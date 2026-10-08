import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { errorOf } from "../test-support/http";

// platform_admins is read with the service role; this fake knows one admin.
const db = vi.hoisted(() => ({ admin: "8f0e0000-0000-4000-8000-000000000001", outage: false, lookups: [] as string[] }));
vi.mock("../lib/supabase-admin", () => ({
  supabaseAdmin: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: (_column: string, userId: string) => ({
          maybeSingle: async () => {
            db.lookups.push(`${table}:${userId}`);
            if (db.outage) return { data: null, error: { message: "statement timeout" } };
            return { data: userId === db.admin ? { user_id: userId } : null, error: null };
          },
        }),
      }),
    }),
  }),
}));

const { adminRoute, requirePlatformAdmin } = await import("./auth");

const MEMBER = "8f0e0000-0000-4000-8000-000000000002";
const USERS: Record<string, string> = { "admin.token.sig": db.admin, "member.token.sig": MEMBER };

function fakeUserClient(): SupabaseClient {
  const getUser = async (jwt: string) =>
    USERS[jwt]
      ? { data: { user: { id: USERS[jwt], email: "someone@test.local" } }, error: null }
      : { data: { user: null }, error: { __isAuthError: true, name: "AuthApiError", status: 401, message: "invalid JWT" } };
  return { auth: { getUser } } as unknown as SupabaseClient;
}

function request(method: string, token?: string, body?: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost:4000/api/admin/whatsapp/connect-link", {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  db.outage = false;
  db.lookups.length = 0;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("requirePlatformAdmin", () => {
  it("returns the verified admin and their audit actor", async () => {
    await expect(requirePlatformAdmin(request("GET", "admin.token.sig"), fakeUserClient)).resolves.toMatchObject({
      user: { id: db.admin },
      actor: `admin:${db.admin}`,
    });
    expect(db.lookups).toEqual([`platform_admins:${db.admin}`]);
  });

  it("refuses a signed-in member, whatever business X-Pakka-Tenant names", async () => {
    const req = request("GET", "member.token.sig", undefined, { "x-pakka-tenant": "10000000-0000-0000-0000-00000000000a" });
    await expect(requirePlatformAdmin(req, fakeUserClient)).rejects.toMatchObject({ code: "forbidden", status: 403 });
  });

  it("verifies the token before looking anyone up", async () => {
    await expect(requirePlatformAdmin(request("GET"), fakeUserClient)).rejects.toMatchObject({ code: "unauthenticated" });
    await expect(requirePlatformAdmin(request("GET", "forged.token.sig"), fakeUserClient)).rejects.toMatchObject({ code: "unauthenticated" });
    expect(db.lookups).toEqual([]);
  });

  it("answers upstream_failed when platform_admins can't be read", async () => {
    db.outage = true;
    await expect(requirePlatformAdmin(request("GET", "admin.token.sig"), fakeUserClient)).rejects.toMatchObject({ code: "upstream_failed" });
  });
});

describe("adminRoute", () => {
  const echo = adminRoute(async ({ admin, body, params }) => ({ actor: admin.actor, body, params }), { status: 201 });

  it("passes the admin, the body and the path params, with the route's status", async () => {
    const res = await echo(request("POST", "admin.token.sig", { tenantId: "t1" }), fakeUserClient, { id: "c1" });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ actor: `admin:${db.admin}`, body: { tenantId: "t1" }, params: { id: "c1" } });
  });

  it("answers 204 when the service returns nothing, reading no body for DELETE", async () => {
    const res = await adminRoute(async () => undefined)(request("DELETE", "admin.token.sig"), fakeUserClient);
    expect(res.status).toBe(204);
  });

  it("answers in the error envelope: 401 signed out, 403 for a member", async () => {
    const signedOut = await echo(request("POST", undefined, {}), fakeUserClient);
    expect(signedOut.status).toBe(401);
    const member = await echo(request("POST", "member.token.sig", {}), fakeUserClient);
    expect(member.status).toBe(403);
    expect(await errorOf(member)).toEqual({ code: "forbidden", message: "Only the Spark Agent team can do this." });
  });

  it("authorizes before reading the body", async () => {
    expect((await echo(request("POST", "member.token.sig", "{not json"), fakeUserClient)).status).toBe(403);
    const bad = await echo(request("POST", "admin.token.sig", "{not json"), fakeUserClient);
    expect(bad.status).toBe(422);
    expect((await errorOf(bad)).code).toBe("validation_failed");
  });
});
