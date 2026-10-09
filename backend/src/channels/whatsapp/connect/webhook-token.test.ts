import { createHash, randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { webhookTokenSecretContext } from "../../../lib/crypto";
import { getOrCreateWebhookToken, getWebhookConfig, isTenantWebhookToken, type WebhookTokenDb } from "./webhook-token";

vi.stubEnv("ENCRYPTION_KEY", randomBytes(32).toString("base64"));
vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "synthetic-anon-key");
vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "synthetic-service-key");
vi.stubEnv("EMBEDDINGS_API_KEY", "synthetic-embeddings-key");
vi.stubEnv("ANTHROPIC_API_KEY", "synthetic-anthropic-key");

const A = "a0000000-0000-4000-8000-00000000000a";
const B = "b0000000-0000-4000-8000-00000000000b";
const sha = (t: string) => createHash("sha256").update(t).digest("hex");

function memoryDb() {
  const rows = new Map<string, { hash: string; enc: string }>();
  const db: WebhookTokenDb = {
    async readEncrypted(tenantId) {
      return rows.get(tenantId)?.enc ?? null;
    },
    async insert(row) {
      if (rows.has(row.tenantId)) return false;
      rows.set(row.tenantId, { hash: row.tokenHash, enc: row.tokenEnc });
      return true;
    },
    async findTenantByHash(hash) {
      for (const [tenant, row] of rows) if (row.hash === hash) return tenant;
      return null;
    },
  };
  return { rows, db };
}

let mem: ReturnType<typeof memoryDb>;
beforeEach(() => {
  mem = memoryDb();
});

describe("getOrCreateWebhookToken", () => {
  it("creates a long random token once and returns the same one afterwards", async () => {
    const first = await getOrCreateWebhookToken(A, mem.db);
    expect(first.length).toBeGreaterThanOrEqual(40);
    expect(await getOrCreateWebhookToken(A, mem.db)).toBe(first);
  });

  it("gives each business its own token", async () => {
    expect(await getOrCreateWebhookToken(A, mem.db)).not.toBe(await getOrCreateWebhookToken(B, mem.db));
  });

  it("stores only a hash and an encrypted copy, never the token", async () => {
    const token = await getOrCreateWebhookToken(A, mem.db);
    const row = mem.rows.get(A)!;
    expect(row.hash).toBe(sha(token));
    expect(JSON.stringify([...mem.rows])).not.toContain(token);
  });

  it("binds the encrypted copy to its business: a row copied to another business cannot be read", async () => {
    await getOrCreateWebhookToken(A, mem.db);
    mem.rows.set(B, mem.rows.get(A)!);
    await expect(getOrCreateWebhookToken(B, mem.db)).rejects.toThrow();
    expect(webhookTokenSecretContext(A)).not.toBe(webhookTokenSecretContext(B));
  });

  it("two requests at once end up with one token", async () => {
    const [x, y] = await Promise.all([getOrCreateWebhookToken(A, mem.db), getOrCreateWebhookToken(A, mem.db)]);
    expect(x).toBe(y);
    expect(mem.rows.size).toBe(1);
  });
});

describe("isTenantWebhookToken", () => {
  it("accepts a business's token and nothing else", async () => {
    const token = await getOrCreateWebhookToken(A, mem.db);
    expect(await isTenantWebhookToken(token, mem.db)).toBe(true);
    expect(await isTenantWebhookToken(`${token}x`, mem.db)).toBe(false);
    expect(await isTenantWebhookToken("", mem.db)).toBe(false);
    expect(await isTenantWebhookToken("a".repeat(5000), mem.db)).toBe(false);
  });
});

describe("getWebhookConfig", () => {
  const ctx = (role: "owner" | "admin" | "staff", id = A) => ({ role, tenant: { id } }) as never;
  const env = { API_PUBLIC_URL: "https://api.example.test", META_PARTNER_BUSINESS_ID: "123456789012345" };

  it("returns the callback URL built from the configured origin, the business's own token and the portfolio id", async () => {
    const config = await getWebhookConfig(ctx("owner"), env, mem.db);
    expect(config.webhookUrl).toBe("https://api.example.test/api/webhooks/whatsapp");
    expect(config.verifyToken).toBe(await getOrCreateWebhookToken(A, mem.db));
    expect(config.partnerBusinessId).toBe("123456789012345");
  });

  it("never returns the platform-wide verify token", async () => {
    const config = await getWebhookConfig(ctx("admin"), { ...env, META_WEBHOOK_VERIFY_TOKEN: "platform-secret" } as never, mem.db);
    expect(JSON.stringify(config)).not.toContain("platform-secret");
  });

  it("is for an owner or admin only, and a refused call creates nothing", async () => {
    await expect(getWebhookConfig(ctx("staff"), env, mem.db)).rejects.toMatchObject({ code: "forbidden" });
    expect(mem.rows.size).toBe(0);
  });

  it("says not_available when the API's public URL isn't configured, instead of guessing one", async () => {
    await expect(getWebhookConfig(ctx("owner"), {}, mem.db)).rejects.toMatchObject({ code: "not_available" });
  });

  it("leaves the portfolio id null when it isn't configured", async () => {
    expect((await getWebhookConfig(ctx("owner"), { API_PUBLIC_URL: env.API_PUBLIC_URL }, mem.db)).partnerBusinessId).toBeNull();
  });

  it("gives two businesses different tokens", async () => {
    const a = await getWebhookConfig(ctx("owner", A), env, mem.db);
    const b = await getWebhookConfig(ctx("owner", B), env, mem.db);
    expect(a.verifyToken).not.toBe(b.verifyToken);
  });
});
