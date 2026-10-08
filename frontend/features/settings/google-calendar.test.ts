import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/errors";
import { calendarOutcomeText, calendarReturn, googleConnectUrl, listCalendarConnections } from "./google-calendar";

const TENANT = "c0000000-0000-0000-0000-00000000000a";
const RESOURCE = "a0000000-0000-0000-0000-000000000001";

vi.mock("@/lib/api/client", () => ({ apiFetch: vi.fn() }));
const { apiFetch } = await import("@/lib/api/client");
const fetchMock = vi.mocked(apiFetch);

afterEach(() => fetchMock.mockReset());

describe("calendar connections under RLS", () => {
  it("reads only the columns members may see, for the session's business", async () => {
    const calls: [string, unknown[]][] = [];
    const builder: Record<string, unknown> = {};
    for (const name of ["select", "eq"]) {
      builder[name] = (...args: unknown[]) => {
        calls.push([name, args]);
        return builder;
      };
    }
    builder.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: [{ resource_id: RESOURCE, google_email: "asha@example.com", status: "connected" }], error: null }).then(resolve);
    const client = { from: (t: string) => (calls.push(["from", [t]]), builder) } as unknown as SupabaseClient;

    const byResource = await listCalendarConnections(client, TENANT);
    expect(byResource.get(RESOURCE)).toEqual({ resourceId: RESOURCE, email: "asha@example.com", status: "connected" });
    expect(calls).toContainEqual(["from", ["google_calendar_connections"]]);
    expect(calls).toContainEqual(["select", ["resource_id, google_email, status"]]);
    expect(calls).toContainEqual(["eq", ["tenant_id", TENANT]]);
  });
});

describe("the connect link", () => {
  it("asks the API for the resource's consent link and returns Google's URL", async () => {
    fetchMock.mockResolvedValue(Response.json({ url: "https://accounts.google.com/o/oauth2/v2/auth?client_id=x" }));
    expect(await googleConnectUrl(TENANT, RESOURCE)).toBe("https://accounts.google.com/o/oauth2/v2/auth?client_id=x");
    expect(fetchMock).toHaveBeenCalledWith(`/api/calendar/google/connect?resourceId=${RESOURCE}`, { method: "GET", tenantId: TENANT });
  });

  it("passes the API's refusal on as an ApiError", async () => {
    fetchMock.mockResolvedValue(Response.json({ error: { code: "not_available", message: "Google Calendar isn't switched on yet." } }, { status: 501 }));
    const err = await googleConnectUrl(TENANT, RESOURCE).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 501, body: { error: { code: "not_available" } } });
  });

  it("never sends the browser anywhere but Google's consent screen", async () => {
    fetchMock.mockResolvedValue(Response.json({ url: "https://evil.example.com/accounts.google.com/" }));
    await expect(googleConnectUrl(TENANT, RESOURCE)).rejects.toThrow(/unexpected shape/);
  });
});

describe("coming back from Google", () => {
  it("reads the callback's outcome and resource", () => {
    expect(calendarReturn({ google_calendar: "connected", resource: RESOURCE })).toEqual({ outcome: "connected", resourceId: RESOURCE });
    expect(calendarReturn({ google_calendar: "not_available" })).toEqual({ outcome: "not_available", resourceId: null });
    expect(calendarReturn({ google_calendar: "denied", resource: "not-an-id" })).toEqual({ outcome: "denied", resourceId: null });
  });

  it("ignores anything else", () => {
    expect(calendarReturn({})).toBeNull();
    expect(calendarReturn({ google_calendar: "<script>" })).toBeNull();
  });

  it("words each outcome", () => {
    expect(calendarOutcomeText("connected", "Asha")).toEqual({ ok: true, text: "Google Calendar connected for Asha." });
    expect(calendarOutcomeText("denied", null).ok).toBe(false);
    expect(calendarOutcomeText("failed", "Asha").text).toBe("Google Calendar couldn't be connected for Asha. Try again.");
    expect(calendarOutcomeText("not_available", "Asha").text).toBe("Google Calendar isn't switched on yet.");
  });
});
