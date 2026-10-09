import { createHash, randomBytes } from "node:crypto";
import type { TenantContext } from "@pakka/types";
import { decryptSecret, encryptSecret, webhookTokenSecretContext } from "../../../lib/crypto";
import { AppError } from "../../../lib/errors";
import { supabaseAdmin } from "../../../lib/supabase-admin";

// The webhook verify token of one business that connects its OWN Meta app (manual_byo). Meta's GET handshake
// sends only the token, so the token is also how we find the business. Stored twice, both server only
// (migration 0020): a SHA-256 for the lookup and an encrypted copy so the owner can see it again. The
// platform-wide META_WEBHOOK_VERIFY_TOKEN is a different thing and is never read here.

const sha256 = (token: string) => createHash("sha256").update(token, "utf8").digest("hex");
const newToken = () => randomBytes(32).toString("base64url");
const UNAVAILABLE = "We couldn't prepare your webhook details. Try again in a moment.";

export interface WebhookTokenDb {
  readEncrypted(tenantId: string): Promise<string | null>;
  /** Inserts only if the business has none yet; returns false when another request got there first. */
  insert(row: { tenantId: string; tokenHash: string; tokenEnc: string }): Promise<boolean>;
  findTenantByHash(tokenHash: string): Promise<string | null>;
}

function realDb(): WebhookTokenDb {
  const fail = () => new AppError("upstream_failed", UNAVAILABLE);
  return {
    async readEncrypted(tenantId) {
      const { data, error } = await supabaseAdmin().from("whatsapp_webhook_tokens").select("token_enc").eq("tenant_id", tenantId).maybeSingle();
      if (error) throw fail();
      return data ? String(data.token_enc) : null;
    },
    async insert(row) {
      const { error } = await supabaseAdmin()
        .from("whatsapp_webhook_tokens")
        .insert({ tenant_id: row.tenantId, token_hash: row.tokenHash, token_enc: row.tokenEnc });
      if (!error) return true;
      if (error.code === "23505") return false; // the business already has one
      throw fail();
    },
    async findTenantByHash(tokenHash) {
      const { data, error } = await supabaseAdmin().from("whatsapp_webhook_tokens").select("tenant_id").eq("token_hash", tokenHash).maybeSingle();
      if (error) throw fail();
      return data ? String(data.tenant_id) : null;
    },
  };
}

/** The business's verify token, created on first use. Concurrent first calls end up with the same token. */
export async function getOrCreateWebhookToken(tenantId: string, db: WebhookTokenDb = realDb()): Promise<string> {
  const context = webhookTokenSecretContext(tenantId);
  const read = async () => {
    const stored = await db.readEncrypted(tenantId);
    return stored === null ? null : decryptSecret(stored, context);
  };
  const existing = await read();
  if (existing !== null) return existing;

  const token = newToken();
  if (await db.insert({ tenantId, tokenHash: sha256(token), tokenEnc: encryptSecret(token, context) })) return token;
  const raced = await read();
  if (raced === null) throw new AppError("upstream_failed", UNAVAILABLE);
  return raced;
}

/** Whether `token` is some business's verify token. Used only by Meta's GET handshake. */
export async function isTenantWebhookToken(token: string, db: WebhookTokenDb = realDb()): Promise<boolean> {
  if (token.length === 0 || token.length > 256) return false;
  return (await db.findTenantByHash(sha256(token))) !== null;
}

export type WebhookConfig = {
  /** Paste into the Meta app's webhook "Callback URL". */
  webhookUrl: string;
  /** Paste into "Verify token". Belongs to this business only. */
  verifyToken: string;
  /** Spark Agent's Business Portfolio ID for partner access; null when it isn't configured. */
  partnerBusinessId: string | null;
};

type ConfigEnv = { API_PUBLIC_URL?: string; META_PARTNER_BUSINESS_ID?: string };

/** Owner or admin only. `not_available` when the API's public URL isn't configured, so a wrong URL is never guessed. */
export async function getWebhookConfig(
  context: Pick<TenantContext, "role" | "tenant">,
  env: ConfigEnv,
  db?: WebhookTokenDb,
): Promise<WebhookConfig> {
  if (context.role !== "owner" && context.role !== "admin") {
    throw new AppError("forbidden", "Only an owner or admin can see the webhook details.");
  }
  if (!env.API_PUBLIC_URL) {
    throw new AppError("not_available", "The webhook address isn't configured yet. Our team will set it up; nothing is wrong on your side.");
  }
  const verifyToken = await getOrCreateWebhookToken(context.tenant.id, db);
  return {
    webhookUrl: `${new URL(env.API_PUBLIC_URL).origin}/api/webhooks/whatsapp`,
    verifyToken,
    partnerBusinessId: env.META_PARTNER_BUSINESS_ID ?? null,
  };
}
