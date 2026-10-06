// A tiny stand-in for Supabase Auth (GoTrue) and PostgREST, for Playwright only. It speaks the same
// HTTP protocol as the real services, so the app's real @supabase/ssr code runs unchanged; only
// NEXT_PUBLIC_SUPABASE_URL points here. No dependencies; run with `node`.
//
// Accounts (password for all: e2e-password-1) cover each state the app must handle.
//
// Signup, email confirmation and "Continue with Google" follow GoTrue's PKCE flow:
//   * POST /auth/v1/signup creates an account with no business. Addresses @confirm.test.local need
//     email confirmation: the link is "sent" to /__mock/last-email?to=… and opening it redirects to
//     the app's /auth/callback with a one-time code. Other addresses get a session straight away.
//   * GET /auth/v1/authorize?provider=google shows a stand-in Google account chooser; picking an
//     account (or Cancel) redirects to the app's /auth/callback like Supabase does.
//   * POST /auth/v1/token?grant_type=pkce checks the code verifier against the stored challenge.
// GET /__mock/rest-log?email=… lists the PostgREST requests made with that user's token, so tests can
// check that nothing was written and no tenant-scoped table was read.
// POST /rest/v1/rpc/create_trial_tenant (service role only) gives a user a trial business, membership,
// credits and route code the way the SQL function does; GET /__mock/business?email=… reads them back.
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:http";

const PORT = Number(process.env.MOCK_SUPABASE_PORT ?? 54399);
export const PASSWORD = "e2e-password-1";

const tenant = (id, name, vertical) => ({
  id, name, vertical, timezone: "Asia/Kolkata", status: "trial", plan_key: "trial", trial_ends_at: "2026-10-12T00:00:00Z",
});
const T = {
  realty: tenant("10000000-0000-0000-0000-000000000001", "Test Realty", "real-estate"),
  salon: tenant("10000000-0000-0000-0000-000000000002", "Beta Salon", "salon"),
  interiors: tenant("10000000-0000-0000-0000-000000000003", "Bright Interiors", "interiors"),
};
const connection = (tenantId, status) => ({
  id: "30000000-0000-0000-0000-000000000001", tenant_id: tenantId, method: "embedded_signup", waba_id: "102938475610",
  phone_number_id: "109876543210987", display_phone: "+91 98400 12345", verified_name: "Bright Interiors", coexistence: true,
  status, last_check: {}, quality_rating: "GREEN", messaging_limit: "TIER_1K", created_at: "2026-10-01T09:00:00Z",
});
const MISSING_VIEW = { status: 404, body: { code: "PGRST205", details: null, hint: null, message: "Could not find the table 'public.whatsapp_connections_public' in the schema cache" } };

// view: what whatsapp_connections_public returns for this user ({ status, body, delay }).
const USERS = {
  "owner@test.local": { memberships: [[T.realty, "owner"]], view: MISSING_VIEW },
  "staff@test.local": { memberships: [[T.realty, "staff"]], view: { status: 200, body: [] } },
  "connected@test.local": { memberships: [[T.interiors, "owner"]], view: { status: 200, body: [connection(T.interiors.id, "active")] } },
  "disconnected@test.local": { memberships: [[T.interiors, "owner"]], view: { status: 200, body: [connection(T.interiors.id, "disconnected")] } },
  "viewerror@test.local": { memberships: [[T.realty, "owner"]], view: { status: 500, body: { code: "XX000", details: "internal detail", hint: null, message: "boom" } } },
  "slow@test.local": { memberships: [[T.realty, "owner"]], view: { status: 200, body: [], delay: 2500 } },
  "nomember@test.local": { memberships: [], view: { status: 200, body: [] } },
  "multi@test.local": { memberships: [[T.realty, "owner"], [T.salon, "admin"]], view: MISSING_VIEW },
  "pending@test.local": { memberships: [[T.interiors, "owner"]], view: { status: 200, body: [connection(T.interiors.id, "pending")] } },
  "failed@test.local": { memberships: [[T.interiors, "owner"]], view: { status: 200, body: [connection(T.interiors.id, "failed")] } },
};
const idOf = (email) => `00000000-0000-0000-0000-${String(Object.keys(USERS).indexOf(email) + 1).padStart(12, "0")}`;
const userJson = (email) => ({ id: idOf(email), aud: "authenticated", role: "authenticated", email, app_metadata: { provider: USERS[email]?.provider ?? "email" }, user_metadata: {}, identities: [{ provider: USERS[email]?.provider ?? "email" }], created_at: "2026-10-01T00:00:00Z" });

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const revoked = new Set();

// Accounts created during a run start without a business, like a real new signup.
const addUser = (email, password, provider = "email") => {
  USERS[email] ??= { memberships: [], view: { status: 200, body: [] }, password, provider };
};
// Seeded accounts share PASSWORD; Google-only accounts have none, so password sign-in fails for them.
const passwordOf = (email) => ("password" in USERS[email] ? USERS[email].password : PASSWORD);
const random = () => randomBytes(12).toString("base64url");

/** One-time auth codes waiting for a PKCE exchange: code → { email, challenge, method }. */
const authCodes = new Map();
/** Google sign-ins in progress on the chooser page: flow id → { redirectTo, challenge, method }. */
const oauthFlows = new Map();
/** Unconfirmed signups: token → { email, password, redirectTo, challenge, method }. */
const pendingSignups = new Map();
/** Last email "sent" to each address: { link }. */
const outbox = new Map();
/** Every PostgREST request: { email, method, table, query }; read back with /__mock/rest-log?email=. */
const restLog = [];

// Trial signup: create_trial_tenant and credit_balance (migrations 0005, 0006), callable only with the
// service-role key like the real grants. Read back with /__mock/business?email=.
const SERVICE_ROLE_KEY = process.env.MOCK_SERVICE_ROLE_KEY ?? "e2e-service-role-key";
/** plans.monthly_credits for 'trial' (supabase/seed/plans.sql). */
const TRIAL_CREDITS = 300;
/** tenant id → credit balance, and → TRIAL-xxxx code, for businesses created during a run. */
const balances = new Map();
const trialCodes = new Map();
/** email → number of create_trial_tenant calls made for that user. */
const trialCalls = new Map();
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/** Same checks and outcomes as public.create_trial_tenant; returns [status, body]. */
function createTrialTenant({ p_user_id, p_name, p_vertical, p_timezone }) {
  const fail = (message) => [400, { code: "P0001", details: null, hint: null, message }];
  const name = String(p_name ?? "").trim();
  if (!p_user_id) return fail("create_trial_tenant: user id is required");
  if (!name) return fail("create_trial_tenant: business name is required");
  if (!/^[a-z][a-z0-9-]*$/.test(String(p_vertical ?? ""))) {
    return fail("create_trial_tenant: vertical must be a pack key (lowercase letters, digits and hyphens)");
  }
  const email = Object.keys(USERS).find((e) => idOf(e) === p_user_id);
  if (!email) return fail(`create_trial_tenant: unknown user ${p_user_id}`);
  trialCalls.set(email, (trialCalls.get(email) ?? 0) + 1);

  const owned = USERS[email].memberships.find(([, role]) => role === "owner")?.[0];
  if (owned) {
    if (owned.status !== "trial") return fail("create_trial_tenant: this account already owns a business");
    return [200, [{ tenant_id: owned.id, route_code: trialCodes.get(owned.id) ?? null, trial_ends_at: owned.trial_ends_at, created: false }]];
  }
  const t = {
    ...tenant(randomUUID(), name, p_vertical),
    timezone: p_timezone ?? "Asia/Kolkata",
    trial_ends_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  };
  const code = `TRIAL-${[...randomBytes(4)].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("")}`;
  USERS[email].memberships.push([t, "owner"]);
  balances.set(t.id, TRIAL_CREDITS);
  trialCodes.set(t.id, code);
  return [200, [{ tenant_id: t.id, route_code: code, trial_ends_at: t.trial_ends_at, created: true }]];
}

function issueCode(email, challenge, method) {
  const code = random();
  authCodes.set(code, { email, challenge, method });
  return code;
}
function withParams(target, params) {
  const url = new URL(target);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return url.toString();
}
function redirect(res, to) {
  res.writeHead(303, { location: to }).end();
}
function verifierMatches(verifier, challenge, method) {
  if (!verifier || !challenge) return false;
  const expected = method === "plain" ? verifier : createHash("sha256").update(verifier).digest("base64url");
  return expected === challenge;
}
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
function session(email) {
  const now = Math.floor(Date.now() / 1000);
  const access_token = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: idOf(email), email, role: "authenticated", aud: "authenticated", iat: now, exp: now + 3600, session_id: `s-${now}` })}.mock`;
  return { access_token, token_type: "bearer", expires_in: 3600, expires_at: now + 3600, refresh_token: `refresh:${email}:${now}`, user: userJson(email) };
}
function emailFromToken(auth) {
  const token = (auth ?? "").replace(/^Bearer\s+/i, "");
  if (!token || revoked.has(token)) return null;
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
    return payload.exp > Date.now() / 1000 && USERS[payload.email] ? payload.email : null;
  } catch {
    return null;
  }
}

function send(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(body === undefined ? "" : JSON.stringify(body));
}
const readBody = (req) => new Promise((resolve) => { let s = ""; req.on("data", (d) => (s += d)); req.on("end", () => { try { resolve(JSON.parse(s || "{}")); } catch { resolve({}); } }); });

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;
  if (path === "/health") return send(res, 200, { ok: true });

  if (path === "/auth/v1/token") {
    const body = await readBody(req);
    const grant = url.searchParams.get("grant_type");
    if (grant === "password") {
      if (USERS[body.email] && body.password === passwordOf(body.email)) return send(res, 200, session(body.email));
      return send(res, 400, { code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" });
    }
    if (grant === "pkce") {
      const pending = authCodes.get(body.auth_code);
      authCodes.delete(body.auth_code); // single use, even when the verifier is wrong
      if (!pending) return send(res, 404, { code: 404, error_code: "flow_state_not_found", msg: "invalid flow state, no valid flow state found" });
      if (!verifierMatches(body.code_verifier, pending.challenge, pending.method)) {
        return send(res, 400, { code: 400, error_code: "bad_code_verifier", msg: "code challenge does not match previously saved code verifier" });
      }
      return send(res, 200, session(pending.email));
    }
    if (grant === "refresh_token") {
      const email = String(body.refresh_token ?? "").split(":")[1];
      if (USERS[email]) return send(res, 200, session(email));
      return send(res, 400, { code: 400, error_code: "refresh_token_not_found", msg: "Invalid Refresh Token" });
    }
  }
  if (path === "/auth/v1/signup" && req.method === "POST") {
    const body = await readBody(req);
    const email = String(body.email ?? "").toLowerCase();
    const redirectTo = url.searchParams.get("redirect_to");
    const needsConfirmation = email.endsWith("@confirm.test.local");
    if (USERS[email]) {
      // Like GoTrue: with confirmation on, a taken address looks like a fresh signup (no identities);
      // with it off, the API says so and the app must not pass that on.
      if (needsConfirmation) return send(res, 200, { ...userJson(email), id: idOf(email), identities: [] });
      return send(res, 422, { code: 422, error_code: "user_already_exists", msg: "User already registered" });
    }
    if (String(body.password ?? "").length < 6) {
      return send(res, 422, { code: 422, error_code: "weak_password", msg: "Password should be at least 6 characters.", weak_password: { reasons: ["length"] } });
    }
    if (needsConfirmation) {
      const token = random();
      pendingSignups.set(token, { email, password: body.password, redirectTo, challenge: body.code_challenge, method: body.code_challenge_method });
      outbox.set(email, { link: `http://127.0.0.1:${PORT}/auth/v1/verify?token=${token}&type=signup&redirect_to=${encodeURIComponent(redirectTo ?? "")}` });
      return send(res, 200, { id: `pending-${token}`, aud: "authenticated", role: "", email, app_metadata: { provider: "email" }, user_metadata: {}, identities: [{ provider: "email" }], created_at: new Date().toISOString() });
    }
    addUser(email, body.password);
    return send(res, 200, session(email));
  }
  if (path === "/auth/v1/verify" && req.method === "GET") {
    const pending = pendingSignups.get(url.searchParams.get("token"));
    const redirectTo = url.searchParams.get("redirect_to");
    if (!pending) return redirect(res, withParams(redirectTo, { error: "access_denied", error_code: "otp_expired", error_description: "Email link is invalid or has expired" }));
    pendingSignups.delete(url.searchParams.get("token"));
    addUser(pending.email, pending.password);
    return redirect(res, withParams(pending.redirectTo, { code: issueCode(pending.email, pending.challenge, pending.method) }));
  }
  if (path === "/auth/v1/authorize" && url.searchParams.get("provider") === "google") {
    const flow = random();
    oauthFlows.set(flow, { redirectTo: url.searchParams.get("redirect_to"), challenge: url.searchParams.get("code_challenge"), method: url.searchParams.get("code_challenge_method") });
    const choose = (label, query) => `<li><a href="/__mock/google/consent?flow=${flow}&${query}">${escapeHtml(label)}</a></li>`;
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><link rel="icon" href="data:,"><title>Sign in with Google (mock)</title></head>
<body><h1>Choose an account</h1><ul>
${choose("owner@test.local", "account=owner%40test.local")}
${choose("Use a new Google account", "account=new")}
${choose("Cancel", "cancel=1")}
</ul></body></html>`);
    return;
  }
  if (path === "/__mock/google/consent") {
    const flow = oauthFlows.get(url.searchParams.get("flow"));
    oauthFlows.delete(url.searchParams.get("flow"));
    if (!flow) return send(res, 400, { msg: "unknown flow" });
    if (url.searchParams.get("cancel")) {
      return redirect(res, withParams(flow.redirectTo, { error: "access_denied", error_description: "The user denied the request" }));
    }
    const account = url.searchParams.get("account");
    const email = account === "new" ? `google-${random().toLowerCase()}@test.local` : account;
    addUser(email, undefined, "google");
    return redirect(res, withParams(flow.redirectTo, { code: issueCode(email, flow.challenge, flow.method) }));
  }
  if (path === "/__mock/rest-log") {
    const email = String(url.searchParams.get("email") ?? "").toLowerCase();
    return send(res, 200, restLog.filter((r) => r.email === email));
  }
  if (path === "/__mock/business") {
    // The user's businesses as the database would hold them, plus how often a trial was requested.
    const email = String(url.searchParams.get("email") ?? "").toLowerCase();
    const memberships = (USERS[email]?.memberships ?? []).map(([t, role]) => ({
      tenantId: t.id, name: t.name, vertical: t.vertical, status: t.status, planKey: t.plan_key, role,
      credits: balances.get(t.id) ?? null, routeCode: trialCodes.get(t.id) ?? null,
    }));
    return send(res, 200, { memberships, trialCalls: trialCalls.get(email) ?? 0 });
  }
  if (path === "/__mock/last-email") {
    const mail = outbox.get(String(url.searchParams.get("to") ?? "").toLowerCase());
    return mail ? send(res, 200, mail) : send(res, 404, { msg: "no email" });
  }
  if (path === "/auth/v1/user") {
    const email = emailFromToken(req.headers.authorization);
    return email ? send(res, 200, userJson(email)) : send(res, 401, { code: 401, error_code: "bad_jwt", msg: "invalid JWT" });
  }
  if (path === "/auth/v1/logout") {
    revoked.add((req.headers.authorization ?? "").replace(/^Bearer\s+/i, ""));
    res.writeHead(204).end();
    return;
  }

  // PostgREST: row-level security is "the token's user sees their own rows".
  if (path.startsWith("/rest/v1/")) {
    const email = emailFromToken(req.headers.authorization);
    const table = path.slice("/rest/v1/".length);
    restLog.push({ email, method: req.method, table, query: url.search });
    if (table === "rpc/create_trial_tenant" || table === "rpc/credit_balance") {
      // EXECUTE is granted to service_role only.
      if ((req.headers.authorization ?? "") !== `Bearer ${SERVICE_ROLE_KEY}`) {
        return send(res, 403, { code: "42501", details: null, hint: null, message: `permission denied for function ${table.slice(4)}` });
      }
      const body = await readBody(req);
      if (table === "rpc/credit_balance") {
        const total = balances.get(body.p_tenant_id) ?? 0;
        return send(res, 200, [{ plan: total, topup: 0, total }]);
      }
      const [status, result] = createTrialTenant(body);
      return send(res, status, result);
    }
    if (table === "memberships") {
      const rows = email ? USERS[email].memberships.map(([t, role]) => ({ tenant_id: t.id, role, tenants: t })) : [];
      return send(res, 200, rows);
    }
    if (table === "whatsapp_connections_public") {
      if (!email) return send(res, 200, []);
      const view = USERS[email].view;
      if (view.delay) await new Promise((r) => setTimeout(r, view.delay));
      return send(res, view.status, view.body);
    }
    return send(res, 404, { code: "PGRST205", details: null, hint: null, message: `Could not find the table 'public.${table}' in the schema cache` });
  }
  send(res, 404, { msg: "not found" });
}).listen(PORT, "127.0.0.1", () => console.log(`mock supabase on http://127.0.0.1:${PORT}`));
