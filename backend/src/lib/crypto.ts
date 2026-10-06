import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { serverEnv, type ServerEnv } from "./env";

// AES-256-GCM for secrets at rest (WhatsApp tokens, app secrets). Stored as v1:<iv>:<tag>:<ciphertext>.
// `context` is GCM additional authenticated data: it is not stored, so a ciphertext copied to another
// row or column fails to decrypt. Callers must create the row id BEFORE encrypting, then pass the same
// context (see connectionSecretContext) on every decrypt. Errors never include secrets or context.

const VERSION = "v1";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const BASE64URL = /^[A-Za-z0-9_-]*$/;

export class CryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CryptoError";
  }
}

type KeySource = Pick<ServerEnv, "ENCRYPTION_KEY">;

function keyFrom(env: KeySource | undefined): Buffer {
  const encoded = (env ?? serverEnv()).ENCRYPTION_KEY;
  if (encoded === undefined) throw new CryptoError("ENCRYPTION_KEY is not set");
  return Buffer.from(encoded, "base64");
}

// GCM treats empty AAD as no AAD, so an empty context would silently turn the binding off.
function aadFrom(context: string | undefined): Buffer | undefined {
  if (context === undefined) return undefined;
  if (context === "") throw new CryptoError("context must not be empty");
  return Buffer.from(context, "utf8");
}

export function encryptSecret(
  plaintext: string,
  context?: string,
  env?: KeySource,
): string {
  const aad = aadFrom(context);
  const key = keyFrom(env);
  try {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv("aes-256-gcm", key, iv, {
      authTagLength: TAG_BYTES,
    });
    if (aad) cipher.setAAD(aad);
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, "utf8"),
      cipher.final(),
    ]);
    return [
      VERSION,
      iv.toString("base64url"),
      cipher.getAuthTag().toString("base64url"),
      ciphertext.toString("base64url"),
    ].join(":");
  } catch {
    throw new CryptoError("could not encrypt secret");
  }
}

export function decryptSecret(
  stored: string,
  context?: string,
  env?: KeySource,
): string {
  const aad = aadFrom(context);
  const key = keyFrom(env);

  const parts = typeof stored === "string" ? stored.split(":") : [];
  const [version, ivPart, tagPart, dataPart] = parts;
  if (
    parts.length !== 4 ||
    version !== VERSION ||
    !parts.slice(1).every((p) => BASE64URL.test(p))
  ) {
    throw new CryptoError("stored secret is malformed");
  }
  const iv = Buffer.from(ivPart, "base64url");
  const tag = Buffer.from(tagPart, "base64url");
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
    throw new CryptoError("stored secret is malformed");
  }

  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv, {
      authTagLength: TAG_BYTES,
    });
    if (aad) decipher.setAAD(aad);
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(Buffer.from(dataPart, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    // Tampered value, wrong key and wrong context are deliberately indistinguishable.
    throw new CryptoError("could not decrypt stored secret");
  }
}

// Columns of whatsapp_connections that hold encrypted secrets.
export type ConnectionSecretColumn = "token_enc" | "app_secret_enc";

const SECRET_COLUMNS: readonly string[] = ["token_enc", "app_secret_enc"];

// The one place that builds the context for a connection secret, so encrypt and decrypt cannot
// drift. Use only immutable values: the row id and tenant id, never status, phone or other editable
// fields.
export function connectionSecretContext(parts: {
  column: ConnectionSecretColumn;
  tenantId: string;
  connectionId: string;
}): string {
  const { column, tenantId, connectionId } = parts;
  if (!SECRET_COLUMNS.includes(column)) {
    throw new CryptoError("unsupported secret column");
  }
  // ":" separates the parts, so allowing it inside one would make two contexts collide.
  for (const id of [tenantId, connectionId]) {
    if (id === "" || id.includes(":")) throw new CryptoError("invalid context part");
  }
  return `whatsapp_connections:${column}:${tenantId}:${connectionId}`;
}
