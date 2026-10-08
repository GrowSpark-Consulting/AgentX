import { createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";
import type { TenantContext } from "@pakka/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { writeAudit } from "../lib/audit";
import { calendarSecretContext, decryptSecret, encryptSecret } from "../lib/crypto";
import { serverEnv, type ServerEnv } from "../lib/env";
import { AppError } from "../lib/errors";
import { supabaseAdmin } from "../lib/supabase-admin";
import { requireRole } from "../lib/tenant";

// Google Calendar, one connection per resource (docs/handover.md, endpoints table; 9-day plan, Day 3:
// "connect and callback, token stored encrypted, a reconnect state"). The owner or an admin opens the
// consent link for a staff member; Google sends the browser to the API's callback, which stores the
// refresh token encrypted and sends the browser back to the dashboard. Syncing bookings and free/busy
// use getGoogleAccessToken (Day 4). Without a connection, the bookings table is the source of truth.

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.freebusy",
] as const;
const STATE_TTL_MS = 10 * 60_000;
const FETCH_TIMEOUT_MS = 10_000;
/** Where the browser lands after Google, with ?google_calendar=connected|denied|failed|not_available&resource=<id>. */
export const RETURN_PATH = "/dashboard";

type GoogleEnv = Pick<ServerEnv, "GOOGLE_CLIENT_ID" | "GOOGLE_CLIENT_SECRET" | "GOOGLE_REDIRECT_URI" | "ENCRYPTION_KEY" | "NEXT_PUBLIC_APP_URL">;

export interface GoogleDeps {
  db: SupabaseClient;
  env: GoogleEnv;
  fetch: typeof fetch;
  now: () => Date;
  audit: typeof writeAudit;
}

const defaults = (): GoogleDeps => ({ db: supabaseAdmin(), env: serverEnv(), fetch: globalThis.fetch, now: () => new Date(), audit: writeAudit });

function config(env: GoogleEnv) {
  const { GOOGLE_CLIENT_ID: clientId, GOOGLE_CLIENT_SECRET: clientSecret, GOOGLE_REDIRECT_URI: redirectUri } = env;
  if (!clientId || !clientSecret || !redirectUri || !env.ENCRYPTION_KEY) {
    throw new AppError("not_available", "Google Calendar isn't switched on yet.");
  }
  return { clientId, clientSecret, redirectUri };
}

// --- OAuth state ---------------------------------------------------------------------------------------
// The callback has no login (Google redirects the browser), so the state carries who asked, for which
// business and resource, signed with a key derived from ENCRYPTION_KEY and valid for 10 minutes.

const StatePayload = z.object({ t: z.guid(), r: z.guid(), u: z.string().min(1), exp: z.number().int(), n: z.string() });
export interface ConnectState {
  tenantId: string;
  resourceId: string;
  userId: string;
}

function stateKey(env: Pick<GoogleEnv, "ENCRYPTION_KEY">): Buffer {
  if (!env.ENCRYPTION_KEY) throw new AppError("not_available", "Google Calendar isn't switched on yet.");
  return Buffer.from(hkdfSync("sha256", Buffer.from(env.ENCRYPTION_KEY, "base64"), Buffer.alloc(0), "pakka:google-oauth-state", 32));
}

export function signState(state: ConnectState, env: Pick<GoogleEnv, "ENCRYPTION_KEY">, now: Date): string {
  const payload = Buffer.from(
    JSON.stringify({ t: state.tenantId, r: state.resourceId, u: state.userId, exp: now.getTime() + STATE_TTL_MS, n: randomBytes(12).toString("base64url") }),
  ).toString("base64url");
  return `${payload}.${createHmac("sha256", stateKey(env)).update(payload).digest("base64url")}`;
}

/** The state's contents, or null if it was changed, signed with another key, malformed or expired. */
export function verifyState(state: string, env: Pick<GoogleEnv, "ENCRYPTION_KEY">, now: Date): ConnectState | null {
  const parts = state.split(".");
  if (parts.length !== 2) return null;
  const [payload, mac] = parts;
  const expected = createHmac("sha256", stateKey(env)).update(payload).digest();
  const given = Buffer.from(mac, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  const parsed = StatePayload.safeParse(decoded);
  if (!parsed.success || parsed.data.exp < now.getTime()) return null;
  return { tenantId: parsed.data.t, resourceId: parsed.data.r, userId: parsed.data.u };
}

// --- Google's token endpoint --------------------------------------------------------------------------

const TokenResponse = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().optional(),
  refresh_token: z.string().min(1).optional(),
  scope: z.string().optional(),
  id_token: z.string().optional(),
});
type TokenResult = { ok: true; body: z.infer<typeof TokenResponse> } | { ok: false; status: number; error?: string };

async function postToken(params: Record<string, string>, deps: GoogleDeps): Promise<TokenResult> {
  const res = await deps.fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  const json: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = (json as { error?: unknown }).error;
    return { ok: false, status: res.status, error: typeof error === "string" ? error : undefined };
  }
  return { ok: true, body: TokenResponse.parse(json) };
}

// The id_token comes straight from Google's token endpoint over TLS, so its payload is read, not verified.
function emailFrom(idToken: string | undefined): string | null {
  const payload = idToken?.split(".")[1];
  if (!payload) return null;
  try {
    const email = (JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { email?: unknown }).email;
    return typeof email === "string" ? email : null;
  } catch {
    return null;
  }
}

const describe = (e: unknown) => (e instanceof Error ? `${e.name}: ${e.message}` : "unknown error");

// --- Routes ---------------------------------------------------------------------------------------------

/** GET /api/calendar/google/connect?resourceId=… → { url }: the consent link for one of the business's resources. Owner or admin. */
export async function googleConnectUrl(context: TenantContext, resourceId: string | null, given?: GoogleDeps): Promise<{ url: string }> {
  requireRole(context, ["owner", "admin"], "connect Google Calendar");
  const deps = given ?? defaults();
  const cfg = config(deps.env);
  const id = z.guid().safeParse(resourceId);
  if (!id.success) throw new AppError("validation_failed", "Choose who to connect.", { resourceId: "Choose a staff member" });
  const { data, error } = await deps.db.from("resources").select("id").eq("tenant_id", context.tenant.id).eq("id", id.data).maybeSingle();
  if (error) throw new Error(`google connect: resource read failed: ${error.message}`);
  if (!data) throw new AppError("not_found", "That staff member wasn't found.");

  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline", // a refresh token, so syncing works without the person present
    prompt: "consent", // Google only returns a refresh token on consent
    include_granted_scopes: "true",
    state: signState({ tenantId: context.tenant.id, resourceId: id.data, userId: context.user.id }, deps.env, deps.now()),
  }).toString();
  return { url: url.toString() };
}

/**
 * GET /api/calendar/google/callback: Google sends the browser here after the consent screen. Stores the
 * connection (refresh token encrypted) and sends the browser back to the dashboard. Every outcome is a
 * redirect with ?google_calendar=…, never an error page.
 */
export async function handleGoogleCallback(request: Request, deps: GoogleDeps = defaults()): Promise<Response> {
  const back = (outcome: "connected" | "denied" | "failed" | "not_available", resourceId?: string) => {
    const url = new URL(RETURN_PATH, deps.env.NEXT_PUBLIC_APP_URL);
    url.searchParams.set("google_calendar", outcome);
    if (resourceId) url.searchParams.set("resource", resourceId);
    return new Response(null, { status: 302, headers: { location: url.toString(), "cache-control": "no-store" } });
  };

  let cfg: ReturnType<typeof config>;
  try {
    cfg = config(deps.env);
  } catch {
    return back("not_available");
  }
  const params = new URL(request.url).searchParams;
  const state = verifyState(params.get("state") ?? "", deps.env, deps.now());
  if (!state) return back("failed");
  if (params.get("error")) return back("denied", state.resourceId); // access_denied: the person said no
  const code = params.get("code");
  if (!code) return back("failed", state.resourceId);

  try {
    const tokens = await postToken(
      { code, client_id: cfg.clientId, client_secret: cfg.clientSecret, redirect_uri: cfg.redirectUri, grant_type: "authorization_code" },
      deps,
    );
    if (!tokens.ok || !tokens.body.refresh_token) {
      console.error(`[google] code exchange failed (${tokens.ok ? "no refresh token" : `${tokens.status} ${tokens.error ?? ""}`})`);
      return back("failed", state.resourceId);
    }
    const { tenantId, resourceId, userId } = state;
    const resource = await deps.db.from("resources").select("id").eq("tenant_id", tenantId).eq("id", resourceId).maybeSingle();
    if (resource.error || !resource.data) return back("failed", resourceId);

    const email = emailFrom(tokens.body.id_token);
    const saved = await deps.db.from("google_calendar_connections").upsert(
      {
        tenant_id: tenantId,
        resource_id: resourceId,
        google_email: email,
        calendar_id: "primary",
        refresh_token_enc: encryptSecret(tokens.body.refresh_token, calendarSecretContext({ tenantId, resourceId }), deps.env),
        scope: tokens.body.scope ?? GOOGLE_SCOPES.join(" "),
        status: "connected",
        last_error: null,
        connected_by: z.guid().safeParse(userId).success ? userId : null,
      },
      { onConflict: "resource_id" },
    );
    if (saved.error) throw new Error(`connection save failed: ${saved.error.message}`);
    const mirrored = await deps.db.from("resources").update({ google_calendar_id: "primary" }).eq("tenant_id", tenantId).eq("id", resourceId);
    if (mirrored.error) throw new Error(`resource update failed: ${mirrored.error.message}`);

    try {
      await deps.audit({ tenantId, actor: userId, action: "google_calendar.connected", entity: "resource", entityId: resourceId, diff: { email } });
    } catch (e) {
      console.error(`[google] audit not written for resource ${resourceId}: ${describe(e)}`);
    }
    return back("connected", resourceId);
  } catch (e) {
    console.error(`[google] callback failed: ${describe(e)}`);
    return back("failed", state.resourceId);
  }
}

/**
 * A fresh access token for a resource's calendar, or null when it has no working connection. When
 * Google refuses the saved refresh token (access revoked, or expired while the consent screen is in
 * Testing), the connection becomes needs_reconnect, so the dashboard shows "Reconnect".
 */
export async function getGoogleAccessToken(tenantId: string, resourceId: string, deps: GoogleDeps = defaults()): Promise<string | null> {
  const cfg = config(deps.env);
  const { data, error } = await deps.db
    .from("google_calendar_connections")
    .select("refresh_token_enc, status")
    .eq("tenant_id", tenantId)
    .eq("resource_id", resourceId)
    .maybeSingle();
  if (error) throw new Error(`google token: connection read failed: ${error.message}`);
  const row = data as { refresh_token_enc: string; status: string } | null;
  if (!row || row.status !== "connected") return null;

  const refreshToken = decryptSecret(row.refresh_token_enc, calendarSecretContext({ tenantId, resourceId }), deps.env);
  const result = await postToken({ client_id: cfg.clientId, client_secret: cfg.clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }, deps);
  if (result.ok) return result.body.access_token;
  if (result.status === 400 && result.error === "invalid_grant") {
    const marked = await deps.db
      .from("google_calendar_connections")
      .update({ status: "needs_reconnect", last_error: "Google refused the saved access (revoked or expired). Reconnect to resume syncing." })
      .eq("tenant_id", tenantId)
      .eq("resource_id", resourceId);
    if (marked.error) throw new Error(`google token: marking reconnect failed: ${marked.error.message}`);
    return null;
  }
  throw new AppError("upstream_failed", "Google Calendar couldn't be reached. Try again in a moment.");
}
