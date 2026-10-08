import { createHash, randomBytes } from "node:crypto";

// Assisted connect links (docs/whatsapp-connection-contract.md). A token is 32 random bytes, base64url,
// and only ever appears in the link. connect_links stores its hash (migration 0016), so a leaked row
// can't be used: store tokenHash, and look a link up by hashConnectLinkToken(the token from the link).

const TOKEN = /^[A-Za-z0-9_-]{43}$/;

/** A new link token and the hash to store for it. */
export function newConnectLinkToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashConnectLinkToken(token) };
}

/** Lowercase hex SHA-256 of the token's UTF-8 bytes, as SQL's encode(sha256(convert_to(token, 'UTF8')), 'hex'). */
export function hashConnectLinkToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** True if the text has the shape of a link token, so anything else can be answered not_found at once. */
export function isConnectLinkToken(text: string): boolean {
  return TOKEN.test(text);
}
