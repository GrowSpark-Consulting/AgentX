import type { TenantContext } from "@pakka/types";
import { describe, expect, it } from "vitest";
import { createTemplate } from "../../notify/templates";
import { fakeSupabase } from "../../test-support/fake-supabase";
import { getWhatsAppConnections, hasActiveConnection } from "./connections";
import { sendTestMessage } from "./test-message";

const ctx = (role: TenantContext["role"] = "owner"): TenantContext => ({
  user: { id: "u1", email: "owner@test.local" },
  role,
  tenant: { id: "t1", name: "Skyline Homes", vertical: "real-estate", timezone: "Asia/Kolkata", status: "trial", planKey: "trial", trialEndsAt: null },
});
const connection = (status: string) => ({
  id: "c1", tenant_id: "t1", method: "embedded_signup", waba_id: "w", phone_number_id: "p",
  display_phone: "+91 98400 12345", verified_name: "Skyline Homes", coexistence: true, status,
  last_check: {}, quality_rating: "GREEN", messaging_limit: "TIER_1K", created_at: "2026-10-05T00:00:00Z",
});
const missingView = { data: null, error: { code: "PGRST205", message: "Could not find the table" } };

describe("getWhatsAppConnections", () => {
  it("reports unavailable while the public view doesn't exist", async () => {
    const { client } = fakeSupabase({ whatsapp_connections_public: missingView });
    expect(await getWhatsAppConnections(client, "t1")).toEqual({ state: "unavailable" });
  });

  it("returns rows for the tenant, selecting only public columns", async () => {
    const { client, calls } = fakeSupabase({ whatsapp_connections_public: { data: [connection("active")], error: null } });
    const res = await getWhatsAppConnections(client, "t1");
    expect(res).toEqual({ state: "ok", connections: [connection("active")] });
    expect(hasActiveConnection(res)).toBe(true);
    const select = calls.find((c) => c.method === "select");
    expect(String(select?.args[0])).not.toMatch(/token|secret/);
    expect(calls).toContainEqual({ table: "whatsapp_connections_public", method: "eq", args: ["tenant_id", "t1"] });
  });

  it("returns an empty list when nothing is connected", async () => {
    const { client } = fakeSupabase({ whatsapp_connections_public: { data: [], error: null } });
    const res = await getWhatsAppConnections(client, "t1");
    expect(res).toEqual({ state: "ok", connections: [] });
    expect(hasActiveConnection(res)).toBe(false);
  });

  it("treats a disconnected number as not active", async () => {
    const { client } = fakeSupabase({ whatsapp_connections_public: { data: [connection("disconnected")], error: null } });
    expect(hasActiveConnection(await getWhatsAppConnections(client, "t1"))).toBe(false);
  });

  it("throws a safe error on other failures", async () => {
    const { client } = fakeSupabase({ whatsapp_connections_public: { data: null, error: { code: "57014", message: "statement timeout" } } });
    await expect(getWhatsAppConnections(client, "t1")).rejects.toMatchObject({ code: "upstream_failed" });
  });
});

describe("sendTestMessage", () => {
  const input = { to: "+919840012345", body: "Hello from Pakka" };

  it("rejects invalid input before anything else", async () => {
    const { client } = fakeSupabase({});
    await expect(sendTestMessage(client, ctx(), { to: "98400", body: "" })).rejects.toMatchObject({ name: "ZodError" });
  });

  it("is limited to owners and admins", async () => {
    const { client } = fakeSupabase({});
    await expect(sendTestMessage(client, ctx("staff"), input)).rejects.toMatchObject({ code: "forbidden" });
  });

  it("never reports a send without a connected number", async () => {
    for (const response of [missingView, { data: [], error: null }, { data: [connection("pending")], error: null }]) {
      const { client } = fakeSupabase({ whatsapp_connections_public: response });
      await expect(sendTestMessage(client, ctx(), input)).rejects.toMatchObject({ code: "whatsapp_not_connected" });
    }
  });

  it("does not fake a send even with an active connection, until the adapter exists", async () => {
    const { client } = fakeSupabase({ whatsapp_connections_public: { data: [connection("active")], error: null } });
    await expect(sendTestMessage(client, ctx(), input)).rejects.toMatchObject({ code: "not_available" });
  });
});

describe("createTemplate", () => {
  const valid = { name: "booking_confirmed_v1", category: "utility", language: "en", body: "Hi {{1}}, see you at {{2}}.", examples: ["Karthik", "11 am"] };

  it("validates name, variables and samples", async () => {
    await expect(createTemplate(ctx(), { ...valid, name: "Booking Confirmed" })).rejects.toMatchObject({ name: "ZodError" });
    await expect(createTemplate(ctx(), { ...valid, body: "Hi {{2}}", examples: ["x"] })).rejects.toMatchObject({ name: "ZodError" });
    await expect(createTemplate(ctx(), { ...valid, examples: ["Karthik"] })).rejects.toMatchObject({ name: "ZodError" });
  });

  it("is limited to owners and admins", async () => {
    await expect(createTemplate(ctx("staff"), valid)).rejects.toMatchObject({ code: "forbidden" });
  });

  it("does not pretend a template was submitted", async () => {
    await expect(createTemplate(ctx(), valid)).rejects.toMatchObject({ code: "not_available" });
  });
});
