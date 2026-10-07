import { ERROR_CODES, SendTestMessageInput, type ErrorCode, type SendTestMessageResult, type TenantContext } from "@pakka/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "../../lib/errors";
import { requireRole } from "../../lib/tenant";
import { send, type SendOutcome } from "../../notify/send";
import { getWhatsAppConnections, hasActiveConnection } from "./connections";

type SkipReason = Extract<SendOutcome, { status: "skipped" }>["reason"];

// Test messages are free and have no feature toggle, so only the first two can happen; the others
// are mapped so a change to notify.send can never surface as a raw reason.
const SKIPPED: Record<SkipReason, [ErrorCode, string]> = {
  outside_window: [
    "outside_window",
    "This number hasn't messaged your business in the last 24 hours, so WhatsApp only allows an approved template. Ask them to message you first, then try again.",
  ],
  opted_out: ["conflict", "This number has opted out of messages from your business, so the message was not sent."],
  insufficient_credits: ["insufficient_credits", "Your business is out of credits, so the message was not sent."],
  feature_off: ["plan_required", "Your plan doesn't include this, so the message was not sent."],
};

const isErrorCode = (code: string): code is ErrorCode => (ERROR_CODES as readonly string[]).includes(code);

/**
 * Sends a test WhatsApp message from the business's connected number (Meta App Review flow),
 * through notify.send (docs/contracts.md, section 4, test_message): 0 credits, free text inside
 * the 24-hour window only, 10 an hour per business, recorded with the staff member as the actor.
 * Until Dev 1's adapter is registered, notify.send answers not_available.
 */
export async function sendTestMessage(
  client: SupabaseClient,
  context: TenantContext,
  rawInput: unknown,
): Promise<SendTestMessageResult> {
  const { to, body } = SendTestMessageInput.parse(rawInput);
  requireRole(context, ["owner", "admin"], "send a test message");

  // Checked first, with the member's own client, so a business without a number is told to connect
  // one whatever else is missing. notify.send checks again on the server.
  const connections = await getWhatsAppConnections(client, context.tenant.id);
  if (!hasActiveConnection(connections)) {
    throw new AppError(
      "whatsapp_not_connected",
      "This business has no connected WhatsApp number yet, so the message was not sent. Connect a number, then try again.",
    );
  }

  const outcome = await send(context.tenant.id, "test_message", { to, text: body, actorId: context.user.id });
  if (outcome.status === "sent") return { providerMsgId: outcome.providerMsgId, status: "accepted" };
  if (outcome.status === "skipped") throw new AppError(...SKIPPED[outcome.reason]);
  const { code, message } = outcome.error;
  throw new AppError(isErrorCode(code) ? code : "upstream_failed", message);
}
