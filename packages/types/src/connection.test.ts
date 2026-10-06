import { describe, expect, it } from "vitest";
import { ManualConnectInput, WhatsAppConnectionPublic } from "./connection";

const row = {
  id: "11111111-1111-4111-8111-111111111111",
  tenant_id: "22222222-2222-4222-8222-222222222222",
  method: "manual_byo",
  waba_id: "100200300",
  phone_number_id: "400500600",
  display_phone: "+91 98123 45621",
  verified_name: null,
  coexistence: false,
  status: "active",
  last_check: { token: { ok: true } },
  quality_rating: "GREEN",
  messaging_limit: "TIER_1K",
  created_at: "2026-10-06T09:00:00Z",
};

describe("WhatsAppConnectionPublic", () => {
  it("accepts a row of the public view", () => {
    expect(WhatsAppConnectionPublic.parse(row).status).toBe("active");
  });

  it("accepts the seeded Postgres ids, which are not RFC version 1-8 uuids", () => {
    const seeded = {
      ...row,
      id: "d4000000-0000-0000-0000-0000000000a1", // isolation test A connection
      tenant_id: "d0000000-0000-0000-0000-0000000000a1", // isolation test A tenant
    };
    expect(WhatsAppConnectionPublic.parse(seeded).id).toBe(seeded.id);
  });

  it.each([
    ["one hex digit short", "d0000000-0000-0000-0000-00000000000"],
    ["a non-hex character", "d0000000-0000-0000-0000-00000000000g"],
    ["no hyphens", "d00000000000000000000000000000001"],
  ])("rejects a malformed id and tenant_id: %s", (_why, bad) => {
    expect(WhatsAppConnectionPublic.safeParse({ ...row, id: bad }).success).toBe(false);
    expect(WhatsAppConnectionPublic.safeParse({ ...row, tenant_id: bad }).success).toBe(false);
  });

  it("rejects an unknown method or status", () => {
    expect(WhatsAppConnectionPublic.safeParse({ ...row, method: "bsp" }).success).toBe(false);
    expect(WhatsAppConnectionPublic.safeParse({ ...row, status: "broken" }).success).toBe(false);
  });

  it("drops secret columns if a caller passes a full row", () => {
    const parsed = WhatsAppConnectionPublic.parse({
      ...row,
      token_enc: "secret",
      app_secret_enc: "secret",
    });
    expect(parsed).not.toHaveProperty("token_enc");
    expect(parsed).not.toHaveProperty("app_secret_enc");
  });
});

describe("ManualConnectInput", () => {
  const input = {
    tenantId: "22222222-2222-4222-8222-222222222222",
    wabaId: "100200300",
    phoneNumberId: "400500600",
    token: "EAAB-token",
    tokenType: "system_user",
    appSecret: "app-secret",
  };

  it("accepts the admin form", () => {
    expect(ManualConnectInput.parse(input).tokenType).toBe("system_user");
  });

  it("accepts the seeded demo tenant id and rejects a malformed one", () => {
    const seeded = { ...input, tenantId: "d0000000-0000-0000-0000-000000000001" };
    expect(ManualConnectInput.safeParse(seeded).success).toBe(true);
    const bad = { ...input, tenantId: "d0000000-0000-0000-0000-00000000000g" };
    expect(ManualConnectInput.safeParse(bad).success).toBe(false);
  });

  it("requires the token and the app secret", () => {
    expect(ManualConnectInput.safeParse({ ...input, token: "" }).success).toBe(false);
    const { appSecret: _appSecret, ...noSecret } = input;
    expect(ManualConnectInput.safeParse(noSecret).success).toBe(false);
  });

  it("rejects an unknown token type", () => {
    expect(ManualConnectInput.safeParse({ ...input, tokenType: "user" }).success).toBe(false);
  });
});
