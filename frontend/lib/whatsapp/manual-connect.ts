import { WhatsAppConnectionPublic, type TokenType } from "@pakka/types";
import { z } from "zod";
import { apiFetch } from "@/lib/api/client";
import { apiErrorFrom, formatError } from "@/lib/errors";

// The browser's side of connecting a business's OWN Meta app: read the webhook details to paste into Meta,
// then post the account details once. Both go to the API (Railway) through lib/api/client.ts; nothing is
// read from the database here, and the answer decides what the screen says. The access token and app secret
// are sent once and are never returned, logged or stored by this code.

/** GET /api/whatsapp/webhook-config. */
export const WebhookConfig = z.object({
  webhookUrl: z.url(),
  verifyToken: z.string().min(1),
  partnerBusinessId: z.string().nullable(),
});
export type WebhookConfig = z.infer<typeof WebhookConfig>;

export type WebhookConfigResult =
  | { state: "ready"; config: WebhookConfig }
  /** The API's public address isn't configured: nothing is wrong on the customer's side, and retrying won't help. */
  | { state: "not_available"; message: string }
  | { state: "error"; message: string; retryable: boolean };

const UNEXPECTED = "We couldn't load your webhook details. Try again in a moment.";

export async function loadWebhookConfig(signal?: AbortSignal): Promise<WebhookConfigResult> {
  try {
    const res = await apiFetch("/api/whatsapp/webhook-config", { method: "GET", signal });
    if (!res.ok) {
      const err = await apiErrorFrom(res);
      const shown = formatError(err);
      if (shown.code === "not_available") return { state: "not_available", message: shown.message };
      return { state: "error", message: shown.message, retryable: shown.retryable };
    }
    const parsed = WebhookConfig.safeParse(await res.json().catch(() => null));
    // The API answered 2xx with something else (a proxy, a mismatched deploy): never show half a value.
    return parsed.success ? { state: "ready", config: parsed.data } : { state: "error", message: UNEXPECTED, retryable: true };
  } catch (err) {
    if (signal?.aborted) throw err;
    return { state: "error", message: formatError(err).message, retryable: true };
  }
}

export interface ManualConnectForm {
  wabaId: string;
  phoneNumberId: string;
  tokenType: TokenType;
  token: string;
  appSecret: string;
}

export type ManualConnectResult =
  | { state: "done"; connection: WhatsAppConnectionPublic }
  | { state: "rejected"; message: string; fields: Record<string, string> };

/** POST /api/whatsapp/manual. The connection state shown afterwards is the one the API returned. */
export async function submitManualConnect(form: ManualConnectForm): Promise<ManualConnectResult> {
  const body = {
    wabaId: form.wabaId.trim(),
    phoneNumberId: form.phoneNumberId.trim(),
    tokenType: form.tokenType,
    token: form.token.trim(),
    appSecret: form.appSecret.trim(),
  };
  try {
    const res = await apiFetch("/api/whatsapp/manual", { method: "POST", body });
    if (!res.ok) {
      const shown = formatError(await apiErrorFrom(res));
      return { state: "rejected", message: shown.message, fields: shown.fields ?? {} };
    }
    const parsed = WhatsAppConnectionPublic.safeParse(await res.json().catch(() => null));
    // Without a valid connection from the API we can't claim anything about its state.
    if (!parsed.success) return { state: "rejected", message: "We couldn't confirm the connection. Check your WhatsApp page before trying again.", fields: {} };
    return { state: "done", connection: parsed.data };
  } catch (err) {
    return { state: "rejected", message: formatError(err).message, fields: {} };
  }
}

export type CheckLine = { key: string; status: string; message: string };

/** The per-check lines of a connection's `last_check`, if it has the structured shape (otherwise none). */
export function checkLines(lastCheck: Record<string, unknown>): CheckLine[] {
  const parsed = z
    .object({ checks: z.array(z.object({ key: z.string(), status: z.string(), message: z.string() })) })
    .safeParse(lastCheck);
  return parsed.success ? parsed.data.checks : [];
}
