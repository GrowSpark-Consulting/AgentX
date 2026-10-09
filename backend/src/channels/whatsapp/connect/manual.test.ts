import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { connectionSecretContext, decryptSecret, encryptSecret } from "../../../lib/crypto";
import { connectManual, type ConnectionRecord, type ManualConnectDb, type MetaProbe } from "./manual";

const KEY = { ENCRYPTION_KEY: randomBytes(32).toString("base64") };
vi.stubEnv("ENCRYPTION_KEY", KEY.ENCRYPTION_KEY);
vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "synthetic-anon-key");
vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "synthetic-service-key");
vi.stubEnv("EMBEDDINGS_API_KEY", "synthetic-embeddings-key");
vi.stubEnv("ANTHROPIC_API_KEY", "synthetic-anthropic-key");

const A = "a0000000-0000-4000-8000-00000000000a";
const B = "b0000000-0000-4000-8000-00000000000b";
const NEW_ID = "d0000000-0000-4000-8000-0000000000d1";
const TOKEN = "EAAB-synthetic-access-token";
const APP_SECRET = "synthetic0app0secret0value";
const INPUT = { tenantId: A, wabaId: "100000000000001", phoneNumberId: "200000000000001", token: TOKEN, tokenType: "system_user", appSecret: APP_SECRET };
const GOOD: MetaProbe = { state: "ok", numberInAccount: true, info: { displayPhone: "+91 98765 43210", verifiedName: "Skyline Homes", qualityRating: "GREEN" } };

type Existing = { id: string; tenantId: string; channelId: string; method: string; status: string };

function setup(probe: MetaProbe = GOOD, existing: Existing | null = null) {
  const saved: { record: ConnectionRecord; replace: boolean }[] = [];
  const db: ManualConnectDb = {
    async tenantExists(id) {
      return id === A || id === B;
    },
    async findByPhoneNumberId() {
      return existing;
    },
    async channelIdFor() {
      return "c0000000-0000-4000-8000-0000000000c1";
    },
    async save(record, replace) {
      saved.push({ record, replace });
      return {
        id: record.id, tenant_id: record.tenantId, method: "manual_byo", waba_id: record.wabaId, phone_number_id: record.phoneNumberId,
        display_phone: record.displayPhone, verified_name: record.verifiedName, coexistence: false, status: record.status,
        last_check: record.lastCheck, quality_rating: record.qualityRating, messaging_limit: null, created_at: "2026-10-09T00:00:00Z",
      };
    },
  };
  const probeFn = vi.fn(async () => probe);
  const audit = vi.fn(async () => {});
  const deps = { db, probe: probeFn, audit, encrypt: encryptSecret, now: () => new Date("2026-10-09T00:00:00Z"), newId: () => NEW_ID };
  return { saved, probeFn, audit, run: (input: unknown = INPUT, actor = "user-1") => connectManual(input, actor, deps) };
}

describe("connectManual", () => {
  it("stores an active manual_byo connection and returns only the public shape", async () => {
    const s = setup();
    const result = await s.run();
    expect(result).toMatchObject({ tenant_id: A, method: "manual_byo", status: "active", display_phone: "+91 98765 43210", verified_name: "Skyline Homes" });
    expect(Object.keys(result).sort()).not.toEqual(expect.arrayContaining(["token", "token_enc", "app_secret_enc", "appSecret"]));
    expect(JSON.stringify(result)).not.toContain(TOKEN);
    expect(JSON.stringify(result)).not.toContain(APP_SECRET);
  });

  it("encrypts the token and the app secret, each bound to its own column, business and connection", async () => {
    const s = setup();
    await s.run();
    const { record } = s.saved[0];
    expect(record.tokenEnc).not.toContain(TOKEN);
    expect(record.appSecretEnc).not.toContain(APP_SECRET);
    const ctx = (column: "token_enc" | "app_secret_enc") => connectionSecretContext({ column, tenantId: A, connectionId: NEW_ID });
    expect(decryptSecret(record.tokenEnc, ctx("token_enc"))).toBe(TOKEN);
    expect(decryptSecret(record.appSecretEnc, ctx("app_secret_enc"))).toBe(APP_SECRET);
    expect(() => decryptSecret(record.tokenEnc, ctx("app_secret_enc"))).toThrow();
    expect(record.connectedBy).toBe("user-1");
  });

  it("records the checks: passes what Meta confirmed and says what is still waiting", async () => {
    const s = setup();
    const { last_check } = await s.run();
    const checks = (last_check as { checks: { key: string; status: string }[]; overall: string }).checks;
    expect(checks.map((c) => c.key)).toEqual(["token_permissions", "number_registered", "webhook_subscribed", "display_name_approved", "payment_method", "test_message_delivered"]);
    expect(checks.slice(0, 2).map((c) => c.status)).toEqual(["pass", "pass"]);
    expect(checks.find((c) => c.key === "webhook_subscribed")?.status).toBe("not_verified");
    expect((last_check as { overall: string }).overall).toBe("warn");
  });

  it("saves a failed connection, with safe words, when Meta rejects the token", async () => {
    const s = setup({ state: "rejected" });
    const result = await s.run();
    expect(result.status).toBe("failed");
    const text = JSON.stringify(result.last_check);
    expect(text).toContain("did not accept");
    expect(text).not.toContain(TOKEN);
  });

  it("fails the connection when the number isn't in that account", async () => {
    const s = setup({ ...GOOD, numberInAccount: false } as MetaProbe);
    expect((await s.run()).status).toBe("failed");
  });

  it("answers upstream_failed and saves nothing when Meta can't be reached", async () => {
    const s = setup({ state: "unreachable" });
    await expect(s.run()).rejects.toMatchObject({ code: "upstream_failed" });
    expect(s.saved).toEqual([]);
  });

  describe("audit log", () => {
    it("records the connect with the user as actor and no secret in the diff", async () => {
      const s = setup();
      const result = await s.run(INPUT, "8f0e0000-0000-4000-8000-000000000001");
      expect(s.audit).toHaveBeenCalledTimes(1);
      const entry = (s.audit.mock.calls[0] as unknown[])[0];
      expect(entry).toMatchObject({ tenantId: A, actor: "8f0e0000-0000-4000-8000-000000000001", action: "whatsapp_connection.connected", entity: "whatsapp_connection", entityId: result.id });
      const text = JSON.stringify(entry);
      expect(text).not.toContain(TOKEN);
      expect(text).not.toContain(APP_SECRET);
    });

    it("uses admin:<id> as the actor for the admin route", async () => {
      const s = setup();
      await s.run(INPUT, "admin:8f0e0000-0000-4000-8000-000000000001");
      expect((s.audit.mock.calls[0] as unknown[])[0]).toMatchObject({ actor: "admin:8f0e0000-0000-4000-8000-000000000001" });
    });

    it("records a failed connection too, and writes nothing when the connect is refused", async () => {
      const failed = setup({ state: "rejected" });
      await failed.run();
      expect((failed.audit.mock.calls[0] as unknown[])[0]).toMatchObject({ diff: expect.objectContaining({ status: "failed" }) });
      const refused = setup({ state: "unreachable" });
      await refused.run().catch(() => {});
      expect(refused.audit).not.toHaveBeenCalled();
    });

    it("still returns the connection when the audit write fails", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const s = setup();
      s.audit.mockRejectedValue(new Error("db down"));
      await expect(s.run()).resolves.toMatchObject({ status: "active" });
    });
  });

  describe("validation", () => {
    it.each([
      ["a non-numeric account id", { wabaId: "abc" }, "wabaId"],
      ["a phone number instead of its id", { phoneNumberId: "+919876543210" }, "phoneNumberId"],
      ["a missing token", { token: "" }, "token"],
      ["a token with spaces", { token: "EAAB token with spaces" }, "token"],
      ["an unknown token type", { tokenType: "personal" }, "tokenType"],
      ["a missing app secret", { appSecret: "" }, "appSecret"],
    ])("rejects %s with a field message, without calling Meta or saving", async (_name, change, field) => {
      const s = setup();
      const err = await s.run({ ...INPUT, ...change }).catch((e: unknown) => e);
      expect(err).toMatchObject({ code: "validation_failed" });
      expect((err as { fields: Record<string, string> }).fields[field]).toBeTruthy();
      expect(s.probeFn).not.toHaveBeenCalled();
      expect(s.saved).toEqual([]);
    });

    it("rejects a business that doesn't exist", async () => {
      const s = setup();
      await expect(s.run({ ...INPUT, tenantId: "f0000000-0000-4000-8000-0000000000ff" })).rejects.toMatchObject({ code: "not_found" });
      expect(s.saved).toEqual([]);
    });
  });

  describe("a number that already exists", () => {
    it("is a conflict when another business has it, and Meta is not called", async () => {
      const s = setup(GOOD, { id: "x", tenantId: B, channelId: "c", method: "manual_byo", status: "failed" });
      await expect(s.run()).rejects.toMatchObject({ code: "conflict" });
      expect(s.probeFn).not.toHaveBeenCalled();
      expect(s.saved).toEqual([]);
    });

    it("is a conflict when our own connection is active", async () => {
      const s = setup(GOOD, { id: "x", tenantId: A, channelId: "c", method: "manual_byo", status: "active" });
      await expect(s.run()).rejects.toMatchObject({ code: "conflict" });
    });

    it("is never taken over from another method, even in the same business", async () => {
      const s = setup(GOOD, { id: "x", tenantId: A, channelId: "c", method: "platform", status: "failed" });
      await expect(s.run()).rejects.toMatchObject({ code: "conflict" });
    });

    it("lets the business retry its own failed manual connection in place", async () => {
      const s = setup(GOOD, { id: "e0000000-0000-4000-8000-0000000000e1", tenantId: A, channelId: "c0000000-0000-4000-8000-0000000000c9", method: "manual_byo", status: "failed" });
      const result = await s.run();
      expect(result.status).toBe("active");
      expect(s.saved[0].replace).toBe(true);
      expect(s.saved[0].record.id).toBe("e0000000-0000-4000-8000-0000000000e1");
    });
  });
});
