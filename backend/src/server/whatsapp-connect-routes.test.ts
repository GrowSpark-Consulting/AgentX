import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase } from "../test-support/fake-supabase";
import { errorOf } from "../test-support/http";

// How the connection routes are wired: who may call them, which business they act for, and that a handshake
// can use a business's own verify token. What the services do is tested in channels/whatsapp/connect/*.test.ts.

vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.pakkaagent.in");
vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "synthetic-anon-key");
vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "synthetic-service-key");
vi.stubEnv("EMBEDDINGS_API_KEY", "synthetic-embeddings-key");
vi.stubEnv("ANTHROPIC_API_KEY", "synthetic-anthropic-key");
vi.stubEnv("META_WEBHOOK_VERIFY_TOKEN", "synthetic-platform-token");

const getWebhookConfig = vi.fn();
const isTenantWebhookToken = vi.fn();
vi.mock("../channels/whatsapp/connect/webhook-token", () => ({
  getWebhookConfig: (...args: unknown[]) => getWebhookConfig(...args),
  isTenantWebhookToken: (...args: unknown[]) => isTenantWebhookToken(...args),
}));
const connectManual = vi.fn();
vi.mock("../channels/whatsapp/connect/manual", () => ({ connectManual: (...args: unknown[]) => connectManual(...args) }));
// platform_admins: only this user is an admin.
const ADMIN_ID = "user-admin@test.local";
vi.mock("../lib/supabase-admin", () => ({
  supabaseAdmin: () => ({
    from: () => ({ select: () => ({ eq: (_c: string, id: string) => ({ maybeSingle: async () => ({ data: id === ADMIN_ID ? { user_id: id } : null, error: null }) }) }) }),
  }),
}));

const { createApp } = await import("./app");
const { AppError } = await import("../lib/errors");

const FRONTEND = "https://app.pakkaagent.in";
const REALTY = "10000000-0000-0000-0000-000000000001";
const SALON = "10000000-0000-0000-0000-000000000002";
const tenantRow = (id: string, name: string) => ({ id, name, vertical: "real-estate", timezone: "Asia/Kolkata", status: "trial", plan_key: "trial", trial_ends_at: null });
const member = (id: string, name: string, role: string) => ({ tenant_id: id, role, tenants: tenantRow(id, name) });

const ACCOUNTS: Record<string, { email: string; memberships: unknown[] }> = {
  "owner.token.sig": { email: "owner@test.local", memberships: [member(REALTY, "Test Realty", "owner")] },
  "staff.token.sig": { email: "staff@test.local", memberships: [member(REALTY, "Test Realty", "staff")] },
  "admin.token.sig": { email: "admin@test.local", memberships: [] },
};

function fakeUserClient(token: string): SupabaseClient {
  const account = ACCOUNTS[token];
  const { client } = fakeSupabase({ memberships: { data: account?.memberships ?? [], error: null } });
  const getUser = async (jwt: string) => {
    const known = ACCOUNTS[jwt];
    return known
      ? { data: { user: { id: `user-${known.email}`, email: known.email } }, error: null }
      : { data: { user: null }, error: { __isAuthError: true, name: "AuthApiError", status: 401, message: "invalid JWT" } };
  };
  return Object.assign(client, { auth: { getUser } });
}

const app = createApp({ userClient: fakeUserClient, inngest: async () => Response.json({}), allowedOrigins: new Set([FRONTEND]) });
const headers = (token?: string, extra: Record<string, string> = {}) => ({ origin: FRONTEND, ...(token ? { authorization: `Bearer ${token}` } : {}), ...extra });
const get = (path: string, h: Record<string, string>) => app(new Request(`http://localhost:4000${path}`, { method: "GET", headers: h }));
const post = (path: string, h: Record<string, string>, body?: unknown) =>
  app(new Request(`http://localhost:4000${path}`, { method: "POST", headers: { ...h, "content-type": "application/json" }, body: JSON.stringify(body) }));

beforeEach(() => {
  getWebhookConfig.mockReset();
  isTenantWebhookToken.mockReset();
  connectManual.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/whatsapp/webhook-config", () => {
  it("needs a signed-in member", async () => {
    expect((await get("/api/whatsapp/webhook-config", headers())).status).toBe(401);
    expect(getWebhookConfig).not.toHaveBeenCalled();
  });

  it("returns the service's answer for the caller's own business", async () => {
    const config = { webhookUrl: "https://api.test/api/webhooks/whatsapp", verifyToken: "t", partnerBusinessId: null };
    getWebhookConfig.mockResolvedValue(config);
    const res = await get("/api/whatsapp/webhook-config", headers("owner.token.sig", { "x-pakka-tenant": SALON }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(config);
    // X-Pakka-Tenant naming a business the caller doesn't belong to doesn't switch businesses.
    expect(getWebhookConfig.mock.calls[0][0]).toMatchObject({ role: "owner", tenant: { id: REALTY } });
  });

  it.each([
    ["forbidden", 403],
    ["not_available", 501],
    ["upstream_failed", 502],
  ] as const)("turns the service's %s into the envelope with status %s", async (code, status) => {
    getWebhookConfig.mockRejectedValue(new AppError(code, "Words."));
    const res = await get("/api/whatsapp/webhook-config", headers("staff.token.sig"));
    expect(res.status).toBe(status);
    expect(await errorOf(res)).toMatchObject({ code, message: "Words." });
  });
});

describe("POST /api/whatsapp/manual", () => {
  const body = { wabaId: "100000000000001", phoneNumberId: "200000000000001", token: "t".repeat(20), tokenType: "system_user", appSecret: "s".repeat(20) };

  it("needs a signed-in member and refuses another origin", async () => {
    expect((await post("/api/whatsapp/manual", headers(), body)).status).toBe(401);
    expect((await post("/api/whatsapp/manual", { authorization: "Bearer owner.token.sig", origin: "https://evil.example" }, body)).status).toBe(403);
    expect(connectManual).not.toHaveBeenCalled();
  });

  it("refuses staff without running the service", async () => {
    const res = await post("/api/whatsapp/manual", headers("staff.token.sig"), body);
    expect(res.status).toBe(403);
    expect(connectManual).not.toHaveBeenCalled();
  });

  it("connects for the caller's business and ignores a tenantId in the body", async () => {
    connectManual.mockResolvedValue({ id: "c1", status: "active" });
    const res = await post("/api/whatsapp/manual", headers("owner.token.sig"), { ...body, tenantId: SALON });
    expect(res.status).toBe(201);
    expect(connectManual).toHaveBeenCalledWith(expect.objectContaining({ tenantId: REALTY, token: body.token }), "user-owner@test.local");
  });

  it("passes the service's validation errors through with their fields", async () => {
    connectManual.mockRejectedValue(new AppError("validation_failed", "Some details need fixing.", { wabaId: "Digits only." }));
    const res = await post("/api/whatsapp/manual", headers("owner.token.sig"), { ...body, wabaId: "x" });
    expect(res.status).toBe(422);
    expect(await errorOf(res)).toMatchObject({ code: "validation_failed", fields: { wabaId: "Digits only." } });
  });

  it("never echoes the submitted secrets in an error", async () => {
    connectManual.mockRejectedValue(new AppError("upstream_failed", "We couldn't reach Meta to check these details. Try again in a moment."));
    const res = await post("/api/whatsapp/manual", headers("owner.token.sig"), body);
    expect(res.status).toBe(502);
    const text = await res.text();
    expect(text).not.toContain(body.token);
    expect(text).not.toContain(body.appSecret);
  });
});

describe("POST /api/admin/whatsapp/manual", () => {
  const body = { tenantId: SALON, wabaId: "100000000000001", phoneNumberId: "200000000000001", token: "t".repeat(20), tokenType: "system_user", appSecret: "s".repeat(20) };

  it("refuses a business owner: only platform admins may name another business", async () => {
    expect((await post("/api/admin/whatsapp/manual", headers("owner.token.sig"), body)).status).toBe(403);
    expect(connectManual).not.toHaveBeenCalled();
  });

  it("lets a platform admin connect the business named in the body, recording who did it", async () => {
    connectManual.mockResolvedValue({ id: "c1" });
    const res = await post("/api/admin/whatsapp/manual", headers("admin.token.sig"), body);
    expect(res.status).toBe(201);
    expect(connectManual).toHaveBeenCalledWith(expect.objectContaining({ tenantId: SALON }), `admin:${ADMIN_ID}`);
  });
});

describe("GET /api/webhooks/whatsapp (Meta's handshake)", () => {
  const handshake = (token: string) =>
    app(new Request(`http://localhost:4000/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=${token}&hub.challenge=777`));

  it("answers the platform token without touching the database", async () => {
    const res = await handshake("synthetic-platform-token");
    expect(await res.text()).toBe("777");
    expect(isTenantWebhookToken).not.toHaveBeenCalled();
  });

  it("answers a business's own token with the challenge", async () => {
    isTenantWebhookToken.mockResolvedValue(true);
    const res = await handshake("a-business-token");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("777");
    expect(res.headers.get("content-type")).toContain("text/plain");
  });

  it("refuses an unknown token with an empty 403", async () => {
    isTenantWebhookToken.mockResolvedValue(false);
    const res = await handshake("nobody");
    expect(res.status).toBe(403);
    expect(await res.text()).toBe("");
  });

  it("refuses, rather than failing open, when the token lookup breaks", async () => {
    isTenantWebhookToken.mockRejectedValue(new Error("db down"));
    const res = await handshake("a-business-token");
    expect(res.status).toBe(403);
    expect(await res.text()).toBe("");
  });

  it("refuses a business token when the mode is wrong", async () => {
    isTenantWebhookToken.mockResolvedValue(true);
    const res = await app(new Request("http://localhost:4000/api/webhooks/whatsapp?hub.mode=unsubscribe&hub.verify_token=a-business-token&hub.challenge=777"));
    expect(res.status).toBe(403);
  });
});
