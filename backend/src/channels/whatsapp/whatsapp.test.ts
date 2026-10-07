import type { TenantContext } from "@pakka/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTemplate } from "../../notify/templates";
import { fakeSupabase } from "../../test-support/fake-supabase";
import { getWhatsAppConnections, hasActiveConnection } from "./connections";
import { sendTestMessage } from "./test-message";

// notify.send's own behaviour is covered in notify/send.test.ts; here only what the route does with it.
const send = vi.hoisted(() => vi.fn());
vi.mock("../../notify/send", () => ({ send }));

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
  const input = { to: "+919840012345", body: "Hello from Spark Agent" };
  const connected = () => fakeSupabase({ whatsapp_connections_public: { data: [connection("active")], error: null } }).client;

  beforeEach(() => {
    send.mockReset().mockResolvedValue({ status: "sent", messageId: "m1", providerMsgId: "wamid.TEST", creditsCharged: 0, usedTemplate: false });
  });

  it("rejects invalid input before anything else", async () => {
    const { client } = fakeSupabase({});
    await expect(sendTestMessage(client, ctx(), { to: "98400", body: "" })).rejects.toMatchObject({ name: "ZodError" });
    expect(send).not.toHaveBeenCalled();
  });

  it("is limited to owners and admins", async () => {
    const { client } = fakeSupabase({});
    await expect(sendTestMessage(client, ctx("staff"), input)).rejects.toMatchObject({ code: "forbidden" });
    expect(send).not.toHaveBeenCalled();
  });

  it("never sends without a connected number", async () => {
    for (const response of [missingView, { data: [], error: null }, { data: [connection("pending")], error: null }]) {
      const { client } = fakeSupabase({ whatsapp_connections_public: response });
      await expect(sendTestMessage(client, ctx(), input)).rejects.toMatchObject({ code: "whatsapp_not_connected" });
    }
    expect(send).not.toHaveBeenCalled();
  });

  it("sends through notify.send as the signed-in member and reports Meta's id", async () => {
    await expect(sendTestMessage(connected(), ctx(), input)).resolves.toEqual({ providerMsgId: "wamid.TEST", status: "accepted" });
    expect(send).toHaveBeenCalledWith("t1", "test_message", { to: "+919840012345", text: "Hello from Spark Agent", actorId: "u1" });
  });

  it("does not fake a send while the adapter is not registered", async () => {
    send.mockResolvedValue({ status: "failed", error: { code: "not_available", message: "Sending WhatsApp messages isn't switched on yet." } });
    await expect(sendTestMessage(connected(), ctx(), input)).rejects.toMatchObject({ code: "not_available", status: 501 });
  });

  it("passes notify.send's errors through with their codes", async () => {
    send.mockResolvedValue({ status: "failed", error: { code: "rate_limited", message: "Only 10 test messages an hour." } });
    await expect(sendTestMessage(connected(), ctx(), input)).rejects.toMatchObject({ code: "rate_limited", status: 429 });
    send.mockResolvedValue({ status: "failed", error: { code: "something_new", message: "Meta said no." } });
    await expect(sendTestMessage(connected(), ctx(), input)).rejects.toMatchObject({ code: "upstream_failed" });
  });

  it("explains a number outside the 24-hour window or one that opted out", async () => {
    send.mockResolvedValue({ status: "skipped", reason: "outside_window" });
    await expect(sendTestMessage(connected(), ctx(), input)).rejects.toMatchObject({ code: "outside_window", status: 409 });
    send.mockResolvedValue({ status: "skipped", reason: "opted_out" });
    await expect(sendTestMessage(connected(), ctx(), input)).rejects.toMatchObject({ code: "conflict", message: expect.stringContaining("opted out") });
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
