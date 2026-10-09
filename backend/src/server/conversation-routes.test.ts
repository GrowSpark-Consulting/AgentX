import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase } from "../test-support/fake-supabase";
import { errorOf } from "../test-support/http";

// POST /api/conversations/:id/messages: how the route is wired (who may call, which business, which id comes
// from the path, which status). What the service does is tested in conversations/staff-reply.test.ts.

const sendStaffReply = vi.fn();
vi.mock("../conversations/staff-reply", () => ({ sendStaffReply: (...args: unknown[]) => sendStaffReply(...args) }));

const setConversationMode = vi.fn();
vi.mock("../conversations/mode", () => ({ setConversationMode: (...args: unknown[]) => setConversationMode(...args) }));

const { createApp } = await import("./app");
const { AppError } = await import("../lib/errors");

const FRONTEND = "https://app.pakkaagent.in";
const REALTY = "10000000-0000-0000-0000-000000000001";
const SALON = "10000000-0000-0000-0000-000000000002";
const CHAT = "40000000-0000-4000-8000-000000000001";
const tenantRow = (id: string, name: string) => ({ id, name, vertical: "real-estate", timezone: "Asia/Kolkata", status: "trial", plan_key: "trial", trial_ends_at: null });
const member = (id: string, name: string, role: string) => ({ tenant_id: id, role, tenants: tenantRow(id, name) });

const ACCOUNTS: Record<string, { email: string; memberships: unknown[] }> = {
  "staff.token.sig": { email: "staff@test.local", memberships: [member(REALTY, "Test Realty", "staff")] },
  "multi.token.sig": { email: "multi@test.local", memberships: [member(REALTY, "Test Realty", "owner"), member(SALON, "Beta Salon", "admin")] },
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
const as = (token: string, extra: Record<string, string> = {}) => ({ authorization: `Bearer ${token}`, origin: FRONTEND, ...extra });
const post = (path: string, headers: Record<string, string>, body?: unknown) =>
  app(new Request(`http://localhost:4000${path}`, { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify(body) }));

beforeEach(() => {
  sendStaffReply.mockReset();
  setConversationMode.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/conversations/:id/messages", () => {
  it("answers 200 with the result, for a staff member's business, handing the service the id from the path and the body", async () => {
    const result = { messageId: "m1", providerMsgId: "wamid.1", status: "accepted" };
    sendStaffReply.mockResolvedValue(result);
    const res = await post(`/api/conversations/${CHAT}/messages`, as("staff.token.sig"), { body: "Hello" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(result);
    expect(res.headers.get("access-control-allow-origin")).toBe(FRONTEND);
    expect(sendStaffReply).toHaveBeenCalledWith(expect.objectContaining({ role: "staff", tenant: expect.objectContaining({ id: REALTY }) }), CHAT, { body: "Hello" });
  });

  it("takes the business from X-Pakka-Tenant only if it is one of the caller's own", async () => {
    sendStaffReply.mockResolvedValue({});
    await post(`/api/conversations/${CHAT}/messages`, as("multi.token.sig", { "x-pakka-tenant": SALON }), { body: "Hi" });
    expect(sendStaffReply.mock.calls[0][0].tenant.id).toBe(SALON);
    sendStaffReply.mockClear();
    await post(`/api/conversations/${CHAT}/messages`, as("staff.token.sig", { "x-pakka-tenant": SALON }), { body: "Hi" });
    expect(sendStaffReply.mock.calls[0][0].tenant.id).toBe(REALTY);
  });

  it("needs a signed-in member and refuses another origin, without running the service", async () => {
    expect((await post(`/api/conversations/${CHAT}/messages`, { origin: FRONTEND }, { body: "Hi" })).status).toBe(401);
    expect((await post(`/api/conversations/${CHAT}/messages`, { authorization: "Bearer staff.token.sig", origin: "https://evil.example" }, { body: "Hi" })).status).toBe(403);
    expect(sendStaffReply).not.toHaveBeenCalled();
  });

  it.each([
    ["outside_window", 409],
    ["conflict", 409],
    ["not_found", 404],
    ["not_available", 501],
    ["upstream_failed", 502],
  ] as const)("turns the service's %s into the envelope with status %s", async (code, status) => {
    sendStaffReply.mockRejectedValue(new AppError(code, "Words for the staff."));
    const res = await post(`/api/conversations/${CHAT}/messages`, as("staff.token.sig"), { body: "Hi" });
    expect(res.status).toBe(status);
    expect(await errorOf(res)).toMatchObject({ code, message: "Words for the staff." });
  });
});

describe("POST /api/conversations/:id/mode", () => {
  it("answers 200 with the result, for the member's business, handing the service the id from the path and the body", async () => {
    setConversationMode.mockResolvedValue({ mode: "human", changed: true });
    const res = await post(`/api/conversations/${CHAT}/mode`, as("staff.token.sig"), { mode: "human" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ mode: "human", changed: true });
    expect(res.headers.get("access-control-allow-origin")).toBe(FRONTEND);
    expect(setConversationMode).toHaveBeenCalledWith(expect.objectContaining({ role: "staff", tenant: expect.objectContaining({ id: REALTY }) }), CHAT, { mode: "human" });
  });

  it("takes the business from X-Pakka-Tenant only if it is one of the caller's own", async () => {
    setConversationMode.mockResolvedValue({ mode: "ai", changed: true });
    await post(`/api/conversations/${CHAT}/mode`, as("multi.token.sig", { "x-pakka-tenant": SALON }), { mode: "ai" });
    expect(setConversationMode.mock.calls[0][0].tenant.id).toBe(SALON);
    setConversationMode.mockClear();
    await post(`/api/conversations/${CHAT}/mode`, as("staff.token.sig", { "x-pakka-tenant": SALON }), { mode: "ai" });
    expect(setConversationMode.mock.calls[0][0].tenant.id).toBe(REALTY);
  });

  it("needs a signed-in member and refuses another origin, without running the service", async () => {
    expect((await post(`/api/conversations/${CHAT}/mode`, { origin: FRONTEND }, { mode: "ai" })).status).toBe(401);
    expect((await post(`/api/conversations/${CHAT}/mode`, { authorization: "Bearer staff.token.sig", origin: "https://evil.example" }, { mode: "ai" })).status).toBe(403);
    expect(setConversationMode).not.toHaveBeenCalled();
  });

  it.each([
    ["not_found", 404],
    ["conflict", 409],
    ["validation_failed", 422],
  ] as const)("turns the service's %s into the envelope with status %s", async (code, status) => {
    setConversationMode.mockRejectedValue(new AppError(code, "Words for the staff."));
    const res = await post(`/api/conversations/${CHAT}/mode`, as("staff.token.sig"), { mode: "human" });
    expect(res.status).toBe(status);
    expect(await errorOf(res)).toMatchObject({ code, message: "Words for the staff." });
  });
});
