import { createHmac, timingSafeEqual } from "node:crypto";

// Meta signs every webhook POST: header `X-Hub-Signature-256: sha256=<hex>`, an HMAC-SHA256 of the
// RAW request bytes keyed with the app secret. This format is unverified against a live Meta request
// (the doc pages we read did not show it); re-check it once the Meta app is accessible.
//
// The caller picks the secret: META_APP_SECRET, or a manual_byo connection's decrypted app secret.
// Pass the exact bytes received (`await req.arrayBuffer()`), never re-serialised JSON, or the
// signature will not match. This module never logs and never throws; it only returns a boolean.

const HEADER = /^sha256=([0-9a-fA-F]{64})$/;

export function verifySignature(
  rawBody: Uint8Array | string,
  signatureHeader: string | null | undefined,
  appSecret: string,
): boolean {
  try {
    if (typeof signatureHeader !== "string" || typeof appSecret !== "string" || appSecret === "") {
      return false;
    }
    const match = HEADER.exec(signatureHeader.trim());
    if (!match) return false;
    const body = typeof rawBody === "string" ? Buffer.from(rawBody, "utf8") : rawBody;
    if (!(body instanceof Uint8Array)) return false;

    const expected = createHmac("sha256", appSecret).update(body).digest();
    const received = Buffer.from(match[1], "hex");
    return received.length === expected.length && timingSafeEqual(received, expected);
  } catch {
    return false;
  }
}
