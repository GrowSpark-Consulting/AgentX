import type { TenantContext } from "@pakka/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { calendarSecretContext, decryptSecret, encryptSecret } from "../lib/crypto";
import { getGoogleAccessToken, googleConnectUrl, handleGoogleCallback, signState, verifyState, type GoogleDeps } from "./google-calendar";

const TENANT = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const RESOURCE = "d5000000-0000-0000-0000-000000000011";
const USER = "16fd2706-8baf-433b-82eb-8c7fada847da";
const NOW = new Date("2026-10-08T06:00:00Z");
const ENV = {
  GOOGLE_CLIENT_ID: "client-123.apps.googleusercontent.com",
  GOOGLE_CLIENT_SECRET: "google-secret",
  GOOGLE_REDIRECT_URI: "https://api.test/api/calendar/google/callback",
  ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
  NEXT_PUBLIC_APP_URL: "https://app.test",
};

type Result = { data: unknown; error: { message: string } | null };
let reads: Record<string, Result>;
let writes: { table: string; op: "upsert" | "update"; row: Record<string, unknown>; options?: unknown }[];
const fetchMock = vi.fn<typeof fetch>();
const audit = vi.fn<GoogleDeps["audit"]>(async () => {});

function fakeDb(): SupabaseClient {
  return {
    from(table: string) {
      const chain = (result: () => Result) => {
        const b: Record<string, unknown> = {};
        for (const op of ["select", "eq"]) b[op] = () => b;
        b.maybeSingle = () => Promise.resolve(result());
        b.then = (resolve: (v: Result) => unknown, reject: (e: unknown) => unknown) => Promise.resolve(result()).then(resolve, reject);
        return b;
      };
      return {
        select: (...args: unknown[]) => (chain(() => reads[table] ?? { data: null, error: null }) as { select: (...a: unknown[]) => unknown }).select(...args),
        upsert: (row: Record<string, unknown>, options: unknown) => {
          writes.push({ table, op: "upsert", row, options });
          return Promise.resolve({ data: null, error: null });
        },
        update: (row: Record<string, unknown>) => {
          writes.push({ table, op: "update", row });
          return chain(() => ({ data: null, error: null }));
        },
      };
    },
  } as unknown as SupabaseClient;
}

const deps = (env: Partial<typeof ENV> = ENV): GoogleDeps => ({ db: fakeDb(), env: { ...env } as GoogleDeps["env"], fetch: fetchMock, now: () => NOW, audit });
const context = (role: TenantContext["role"] = "owner"): TenantContext => ({
  user: { id: USER, email: "owner@test.local" },
  role,
  tenant: { id: TENANT, name: "Skyline Homes", vertical: "real-estate", timezone: "Asia/Kolkata", status: "trial", planKey: "trial", trialEndsAt: null },
});
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const idToken = (claims: Record<string, unknown>) => `e30.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.sig`;
const callback = (query: Record<string, string>) => new Request(`https://api.test/api/calendar/google/callback?${new URLSearchParams(query)}`);
const location = (res: Response) => res.headers.get("location");

beforeEach(() => {
  reads = { resources: { data: { id: RESOURCE }, error: null } };
  writes = [];
  fetchMock.mockReset();
  audit.mockReset().mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("OAuth state", () => {
  const state = { tenantId: TENANT, resourceId: RESOURCE, userId: USER };

  it("round-trips for 10 minutes", () => {
    const signed = signState(state, ENV, NOW);
    expect(verifyState(signed, ENV, new Date(NOW.getTime() + 9 * 60_000))).toEqual(state);
    expect(verifyState(signed, ENV, new Date(NOW.getTime() + 11 * 60_000))).toBeNull();
  });

  it("refuses a changed, foreign or malformed state", () => {
    const signed = signState(state, ENV, NOW);
    const [payload, mac] = signed.split(".");
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, "base64url").toString()), t: "00000000-0000-4000-8000-000000000000" })).toString("base64url");
    expect(verifyState(`${forged}.${mac}`, ENV, NOW)).toBeNull();
    expect(verifyState(signed, { ENCRYPTION_KEY: Buffer.alloc(32, 9).toString("base64") }, NOW)).toBeNull();
    for (const bad of ["", "abc", `${payload}.${mac}.x`, `${payload}.`]) expect(verifyState(bad, ENV, NOW)).toBeNull();
  });
});

describe("googleConnectUrl", () => {
  it("links to Google's consent screen for offline calendar access, with a signed state", async () => {
    const { url } = await googleConnectUrl(context(), RESOURCE, deps());
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(Object.fromEntries(u.searchParams)).toMatchObject({
      client_id: ENV.GOOGLE_CLIENT_ID,
      redirect_uri: ENV.GOOGLE_REDIRECT_URI,
      response_type: "code",
      access_type: "offline",
      prompt: "consent",
      scope: "openid email https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.freebusy",
    });
    expect(verifyState(u.searchParams.get("state") ?? "", ENV, NOW)).toEqual({ tenantId: TENANT, resourceId: RESOURCE, userId: USER });
  });

  it("is for owners and admins, for the business's own staff, once Google is configured", async () => {
    await expect(googleConnectUrl(context("staff"), RESOURCE, deps())).rejects.toMatchObject({ code: "forbidden" });
    await expect(googleConnectUrl(context(), null, deps())).rejects.toMatchObject({ code: "validation_failed" });
    reads.resources = { data: null, error: null };
    await expect(googleConnectUrl(context(), RESOURCE, deps())).rejects.toMatchObject({ code: "not_found" });
    await expect(googleConnectUrl(context(), RESOURCE, deps({ ...ENV, GOOGLE_CLIENT_SECRET: undefined }))).rejects.toMatchObject({
      code: "not_available",
    });
  });
});

describe("handleGoogleCallback", () => {
  const validState = () => signState({ tenantId: TENANT, resourceId: RESOURCE, userId: USER }, ENV, NOW);

  it("stores the refresh token encrypted and sends the browser back connected", async () => {
    fetchMock.mockResolvedValue(
      json(200, { access_token: "ya29.access", expires_in: 3599, refresh_token: "1//refresh-token", scope: "openid email calendar", id_token: idToken({ email: "exec1@gmail.com" }) }),
    );
    const res = await handleGoogleCallback(callback({ code: "4/code", state: validState() }), deps());
    expect(res.status).toBe(302);
    expect(location(res)).toBe(`https://app.test/dashboard?google_calendar=connected&resource=${RESOURCE}`);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://oauth2.googleapis.com/token");
    expect(Object.fromEntries(new URLSearchParams(String(init?.body)))).toEqual({
      code: "4/code",
      client_id: ENV.GOOGLE_CLIENT_ID,
      client_secret: ENV.GOOGLE_CLIENT_SECRET,
      redirect_uri: ENV.GOOGLE_REDIRECT_URI,
      grant_type: "authorization_code",
    });

    const saved = writes.find((w) => w.table === "google_calendar_connections");
    expect(saved?.options).toEqual({ onConflict: "resource_id" });
    expect(saved?.row).toMatchObject({ tenant_id: TENANT, resource_id: RESOURCE, google_email: "exec1@gmail.com", status: "connected", connected_by: USER });
    const encrypted = String(saved?.row.refresh_token_enc);
    expect(encrypted).not.toContain("refresh-token");
    expect(decryptSecret(encrypted, calendarSecretContext({ tenantId: TENANT, resourceId: RESOURCE }), ENV)).toBe("1//refresh-token");
    expect(writes).toContainEqual({ table: "resources", op: "update", row: { google_calendar_id: "primary" } });
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ tenantId: TENANT, actor: USER, action: "google_calendar.connected", entityId: RESOURCE }));
  });

  it("sends the browser back with denied, failed or not_available, storing nothing", async () => {
    const cases: [Record<string, string>, GoogleDeps, string][] = [
      [{ error: "access_denied", state: validState() }, deps(), `denied&resource=${RESOURCE}`],
      [{ code: "4/code", state: "forged.state" }, deps(), "failed"],
      [{ state: validState() }, deps(), `failed&resource=${RESOURCE}`],
      [{ code: "4/code", state: validState() }, deps({ ...ENV, GOOGLE_CLIENT_ID: undefined }), "not_available"],
    ];
    for (const [query, d, outcome] of cases) {
      const res = await handleGoogleCallback(callback(query), d);
      expect(location(res), JSON.stringify(query)).toBe(`https://app.test/dashboard?google_calendar=${outcome}`);
    }
    expect(fetchMock).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
  });

  it("fails cleanly when Google refuses the code or sends no refresh token", async () => {
    fetchMock.mockResolvedValueOnce(json(400, { error: "invalid_grant" }));
    expect(location(await handleGoogleCallback(callback({ code: "4/old", state: validState() }), deps()))).toContain("google_calendar=failed");
    fetchMock.mockResolvedValueOnce(json(200, { access_token: "ya29.access" }));
    expect(location(await handleGoogleCallback(callback({ code: "4/code", state: validState() }), deps()))).toContain("google_calendar=failed");
    expect(writes).toEqual([]);
  });
});

describe("getGoogleAccessToken", () => {
  const connected = (status = "connected") => ({
    data: {
      status,
      refresh_token_enc: encryptSecret("1//refresh-token", calendarSecretContext({ tenantId: TENANT, resourceId: RESOURCE }), ENV),
    },
    error: null,
  });

  it("refreshes an access token with the saved refresh token", async () => {
    reads.google_calendar_connections = connected();
    fetchMock.mockResolvedValue(json(200, { access_token: "ya29.fresh", expires_in: 3599 }));
    await expect(getGoogleAccessToken(TENANT, RESOURCE, deps())).resolves.toBe("ya29.fresh");
    expect(Object.fromEntries(new URLSearchParams(String(fetchMock.mock.calls[0][1]?.body)))).toMatchObject({
      refresh_token: "1//refresh-token",
      grant_type: "refresh_token",
    });
  });

  it("marks the connection needs_reconnect when Google refuses the refresh token", async () => {
    reads.google_calendar_connections = connected();
    fetchMock.mockResolvedValue(json(400, { error: "invalid_grant", error_description: "Token has been expired or revoked." }));
    await expect(getGoogleAccessToken(TENANT, RESOURCE, deps())).resolves.toBeNull();
    expect(writes).toContainEqual(expect.objectContaining({ table: "google_calendar_connections", op: "update", row: expect.objectContaining({ status: "needs_reconnect" }) }));
  });

  it("returns null without calling Google when there is no working connection, and upstream_failed when Google is down", async () => {
    reads.google_calendar_connections = connected("needs_reconnect");
    await expect(getGoogleAccessToken(TENANT, RESOURCE, deps())).resolves.toBeNull();
    reads.google_calendar_connections = { data: null, error: null };
    await expect(getGoogleAccessToken(TENANT, RESOURCE, deps())).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    reads.google_calendar_connections = connected();
    fetchMock.mockResolvedValue(json(503, { error: "backendError" }));
    await expect(getGoogleAccessToken(TENANT, RESOURCE, deps())).rejects.toMatchObject({ code: "upstream_failed" });
  });
});
