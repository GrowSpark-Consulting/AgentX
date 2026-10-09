import { createHash, timingSafeEqual } from "node:crypto";
import { serverEnv } from "../../lib/env";
import { isTenantWebhookToken } from "./connect/webhook-token";

// Meta's webhook verification (GET /api/webhooks/whatsapp): Meta sends hub.mode, hub.verify_token and
// hub.challenge. If the mode is "subscribe" and the token is ours, we answer 200 with the challenge as
// plain text and nothing else; every other case is a 403 with an empty body. The token is one
// platform-wide value (META_WEBHOOK_VERIFY_TOKEN) for our Meta app. Neither the token nor the challenge
// is ever logged.

// Meta's challenge is a number as a string (unconfirmed in the pages we read). Anything we echo back
// must be short, printable ASCII.
const CHALLENGE = /^[\x20-\x7E]{1,256}$/;

const digest = (value: string) => createHash("sha256").update(value, "utf8").digest();

/** The challenge to echo back, or null when the request must be refused. Never throws. */
export function verifyWebhookChallenge(
  query: { mode: string | null; token: string | null; challenge: string | null },
  expectedToken: string | undefined,
): string | null {
  try {
    const { mode, token, challenge } = query;
    // A missing or empty configured token refuses everything, including an empty request token.
    if (typeof expectedToken !== "string" || expectedToken.trim() === "") return null;
    if (typeof mode !== "string" || typeof token !== "string" || typeof challenge !== "string") return null;
    // Compare fixed-length digests in constant time: tokens of different lengths cannot throw or leak.
    const tokenMatches = timingSafeEqual(digest(token), digest(expectedToken));
    if (mode !== "subscribe" || !tokenMatches || !CHALLENGE.test(challenge)) return null;
    return challenge;
  } catch {
    return null;
  }
}

const forbidden = () => new Response(null, { status: 403, headers: { "cache-control": "no-store" } });

/**
 * The whole GET handler, so the route stays one line (server/routes.ts). `env` is for tests; by default the token is
 * read through serverEnv(). If serverEnv() throws (some variable is invalid) we refuse, and log one
 * fixed line with no values so a misconfiguration can be told from a wrong token.
 */
export function handleWhatsAppVerification(
  request: Request,
  env?: { META_WEBHOOK_VERIFY_TOKEN?: string },
): Response {
  try {
    let expectedToken: string | undefined;
    if (env) {
      expectedToken = env.META_WEBHOOK_VERIFY_TOKEN;
    } else {
      try {
        expectedToken = serverEnv().META_WEBHOOK_VERIFY_TOKEN;
      } catch {
        console.error("webhook verification: environment invalid");
        return forbidden();
      }
    }

    const params = new URL(request.url).searchParams;
    // A repeated parameter is ambiguous, so it counts as missing.
    const only = (name: string) => {
      const values = params.getAll(name);
      return values.length === 1 ? values[0] : null;
    };
    const challenge = verifyWebhookChallenge(
      { mode: only("hub.mode"), token: only("hub.verify_token"), challenge: only("hub.challenge") },
      expectedToken,
    );
    if (challenge === null) return forbidden();

    return new Response(challenge, {
      status: 200,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "x-content-type-options": "nosniff",
        "cache-control": "no-store",
      },
    });
  } catch {
    return forbidden();
  }
}

/**
 * The route's GET handler: our own Meta app's platform token first (no database), then a business's own token
 * for a client who connected their own Meta app (migration 0020). Same answers either way: the challenge on
 * success, an empty 403 otherwise. A database failure refuses, like a wrong token, and logs one fixed line.
 */
export async function handleWhatsAppHandshake(
  request: Request,
  isTenantToken: (token: string) => Promise<boolean> = isTenantWebhookToken,
): Promise<Response> {
  const platform = handleWhatsAppVerification(request);
  if (platform.status === 200) return platform;
  try {
    const params = new URL(request.url).searchParams;
    const one = (name: string) => (params.getAll(name).length === 1 ? params.get(name) : null);
    const token = one("hub.verify_token");
    // Same mode and challenge checks as above, by asking the pure verifier with the token as the expected one.
    const challenge = verifyWebhookChallenge({ mode: one("hub.mode"), token, challenge: one("hub.challenge") }, token ?? undefined);
    if (challenge === null || token === null || !(await isTenantToken(token))) return forbidden();
    return new Response(challenge, {
      status: 200,
      headers: { "content-type": "text/plain; charset=utf-8", "x-content-type-options": "nosniff", "cache-control": "no-store" },
    });
  } catch {
    console.error("webhook verification: token lookup failed");
    return forbidden();
  }
}
