import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { describeSetupWriteError, SetupError } from "@/features/settings/resources-data";
import { fetchAlertNumber, saveAlertNumber, validateAlertNumber } from "./alert-number";

// The member's own WhatsApp alert number (memberships.whatsapp_phone), read and written under RLS:
// every query names the business and the member, only whatsapp_phone is sent, and an update RLS
// refuses (no row back) is never reported as saved.

const TENANT = "c0000000-0000-0000-0000-00000000000a";
const OTHER_TENANT = "c0000000-0000-0000-0000-00000000000b";
const USER = "00000000-0000-0000-0000-000000000007";
const OTHER_USER = "00000000-0000-0000-0000-000000000008";

type Result = { data: unknown; error: unknown };
type Call = { table: string; op: string; args: unknown[] }[];

/** A PostgREST query builder that records every call and resolves to `result`. */
function fakeClient(result: Result) {
  const calls: Call = [];
  const client = {
    from(table: string) {
      const chain: Record<string, unknown> = {};
      for (const op of ["select", "update", "eq", "limit"]) {
        chain[op] = (...args: unknown[]) => {
          calls.push({ table, op, args });
          return chain;
        };
      }
      chain.then = (resolve: (r: Result) => unknown, reject: (e: unknown) => unknown) => Promise.resolve(result).then(resolve, reject);
      return chain;
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}
const row = (over: Record<string, unknown> = {}) => ({ tenant_id: TENANT, user_id: USER, whatsapp_phone: "+919840012345", ...over });
const postgrestError = { code: "PGRST301", message: "JWT expired", details: "secret detail", hint: null };

describe("reading the member's alert number", () => {
  it("reads only the member's own row of this business", async () => {
    const { client, calls } = fakeClient({ data: [row()], error: null });
    expect(await fetchAlertNumber(client, TENANT, USER)).toBe("+919840012345");
    expect(calls).toEqual([
      { table: "memberships", op: "select", args: ["tenant_id, user_id, whatsapp_phone"] },
      { table: "memberships", op: "eq", args: ["tenant_id", TENANT] },
      { table: "memberships", op: "eq", args: ["user_id", USER] },
      { table: "memberships", op: "limit", args: [1] },
    ]);
  });

  it("is null when no number is set, or only spaces are stored", async () => {
    expect(await fetchAlertNumber(fakeClient({ data: [row({ whatsapp_phone: null })], error: null }).client, TENANT, USER)).toBeNull();
    expect(await fetchAlertNumber(fakeClient({ data: [row({ whatsapp_phone: "  " })], error: null }).client, TENANT, USER)).toBeNull();
  });

  it("never takes another business's or another member's row", async () => {
    const { client } = fakeClient({ data: [row({ tenant_id: OTHER_TENANT }), row({ user_id: OTHER_USER })], error: null });
    const err = await fetchAlertNumber(client, TENANT, USER).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SetupError);
    expect((err as SetupError).reason).toBe("not_found");
  });

  it("rejects rows of an unexpected shape, and passes database errors on", async () => {
    await expect(fetchAlertNumber(fakeClient({ data: [{ tenant_id: "x", whatsapp_phone: 42 }], error: null }).client, TENANT, USER)).rejects.toMatchObject({
      reason: "invalid_response",
    });
    await expect(fetchAlertNumber(fakeClient({ data: null, error: postgrestError }).client, TENANT, USER)).rejects.toBe(postgrestError);
  });
});

describe("saving the member's alert number", () => {
  it("sends only whatsapp_phone, to the member's own row of this business", async () => {
    const { client, calls } = fakeClient({ data: [row({ whatsapp_phone: "+447700900123" })], error: null });
    expect(await saveAlertNumber(client, TENANT, USER, "+447700900123")).toBe("+447700900123");
    expect(calls).toEqual([
      { table: "memberships", op: "update", args: [{ whatsapp_phone: "+447700900123" }] },
      { table: "memberships", op: "eq", args: ["tenant_id", TENANT] },
      { table: "memberships", op: "eq", args: ["user_id", USER] },
      { table: "memberships", op: "select", args: ["tenant_id, user_id, whatsapp_phone"] },
    ]);
  });

  it("removes the number with null", async () => {
    const { client, calls } = fakeClient({ data: [row({ whatsapp_phone: null })], error: null });
    expect(await saveAlertNumber(client, TENANT, USER, null)).toBeNull();
    expect(calls[0]).toEqual({ table: "memberships", op: "update", args: [{ whatsapp_phone: null }] });
  });

  it("treats an update that came back empty (refused by row-level security) as not saved", async () => {
    for (const data of [[], [row({ user_id: OTHER_USER })], null]) {
      const err = await saveAlertNumber(fakeClient({ data, error: null }).client, TENANT, USER, "+919840012345").catch((e: unknown) => e);
      expect(err).toBeInstanceOf(SetupError);
      expect(describeSetupWriteError(err, "Couldn't save your number")).toMatchObject({
        title: "Couldn't save your number",
        message: "Your number wasn't saved. Refresh and try again.",
      });
    }
  });

  it("says a failed write changed nothing, without the database's details", async () => {
    const err = await saveAlertNumber(fakeClient({ data: null, error: postgrestError }).client, TENANT, USER, "+919840012345").catch((e: unknown) => e);
    const shown = describeSetupWriteError(err, "Couldn't save your number");
    expect(shown.message).toBe("Nothing was changed. Try again in a moment.");
    expect(JSON.stringify(shown)).not.toContain("secret detail");
  });
});

describe("validateAlertNumber", () => {
  it("accepts E.164 numbers, dropping the spaces, dashes, dots and brackets people type", () => {
    for (const [typed, phone] of [
      ["+919840012345", "+919840012345"],
      ["  +91 98400 12345 ", "+919840012345"],
      ["+91-98400-12345", "+919840012345"],
      ["+44 (7700) 900.123", "+447700900123"],
      ["+12025550123", "+12025550123"],
    ]) {
      expect(validateAlertNumber(typed)).toEqual({ ok: true, phone });
    }
  });

  it("asks for a number when nothing is typed", () => {
    expect(validateAlertNumber("   ")).toEqual({ ok: false, message: "Enter your WhatsApp number" });
  });

  it("refuses numbers without a country code, too short, too long or with letters", () => {
    for (const typed of ["9840012345", "09840012345", "+0919840012345", "+9198", "+9198400123456789", "+91 98400 abcde"]) {
      expect(validateAlertNumber(typed)).toEqual({ ok: false, message: "Enter the number with country code, like +919840012345" });
    }
  });
});
