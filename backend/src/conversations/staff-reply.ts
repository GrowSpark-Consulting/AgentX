import { ERROR_CODES, SendStaffReplyInput, type ErrorCode, type SendStaffReplyResult, type TenantContext } from "@pakka/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { AppError } from "../lib/errors";
import { supabaseAdmin } from "../lib/supabase-admin";
import { requireRole } from "../lib/tenant";
import { send, type SendOutcome } from "../notify/send";

type SkipReason = Extract<SendOutcome, { status: "skipped" }>["reason"];

// staff_reply has no feature toggle and costs nothing, so only the first two can happen; the others are
// mapped so a change to notify.send can never surface as a raw reason.
const SKIPPED: Record<SkipReason, [ErrorCode, string]> = {
  outside_window: [
    "outside_window",
    "This customer hasn't written in the last 24 hours, so WhatsApp only allows an approved template. Wait for them to message you first.",
  ],
  opted_out: ["conflict", "This customer has opted out of messages from your business, so the message was not sent."],
  insufficient_credits: ["insufficient_credits", "Your business is out of credits, so the message was not sent."],
  feature_off: ["plan_required", "Your plan doesn't include this, so the message was not sent."],
};

const isErrorCode = (code: string): code is ErrorCode => (ERROR_CODES as readonly string[]).includes(code);
const ConversationId = z.guid();

/**
 * A staff member's free-text reply in a customer conversation (POST /api/conversations/:id/messages),
 * through notify.send as `staff_reply` (docs/contracts.md, section 4): 0 credits, recorded with the staff
 * member as the actor. notify.send resolves the conversation inside the business (another business's id is
 * not_found), refuses opted-out customers and enforces the 24-hour window, so none of that is repeated here.
 *
 * Not supported by notify.send today, so not offered: sending a template chosen by staff outside the window
 * (staff_reply has no template base name; the outcome is `outside_window`), and a client retry key (send
 * generates the message id itself). Both need a notify change first.
 */
export async function sendStaffReply(
  context: TenantContext,
  conversationId: string,
  rawInput: unknown,
  db: SupabaseClient = supabaseAdmin(),
): Promise<SendStaffReplyResult> {
  requireRole(context, ["owner", "admin", "staff"], "reply to a customer");
  // A malformed id can never name a conversation; answered like a missing one, before it reaches the database.
  if (!ConversationId.safeParse(conversationId).success) throw new AppError("not_found", "That conversation was not found.");
  // Said plainly, not as a schema error: a client that sends a template must be told it was not honoured.
  if (typeof rawInput === "object" && rawInput !== null && "template" in rawInput) {
    throw new AppError("not_available", "Sending a template from the inbox isn't available yet. Nothing was sent. Reply in text while the customer's 24-hour window is open.");
  }
  const { body } = SendStaffReplyInput.parse(rawInput);

  // One responder per chat: while the AI has it, staff don't reply (switch to Human first, POST .../mode). This also
  // makes another business's id not_found before anything is sent. A switch back to AI between this read and the
  // send is a window of milliseconds that the AI's own pre-send check (pipeline/reply.ts) cannot see either.
  const { data, error } = await db.from("conversations").select("mode").eq("id", conversationId).eq("tenant_id", context.tenant.id).maybeSingle();
  if (error) throw new Error(`read conversation mode failed: ${error.message}`);
  if (!data) throw new AppError("not_found", "That conversation was not found.");
  if ((data as { mode: string }).mode === "ai") {
    throw new AppError("conflict", "The AI is replying in this chat. Switch to Human to reply.");
  }

  const outcome = await send(context.tenant.id, "staff_reply", { conversationId, text: body, actorId: context.user.id });
  if (outcome.status === "sent") return { messageId: outcome.messageId, providerMsgId: outcome.providerMsgId, status: "accepted" };
  if (outcome.status === "skipped") throw new AppError(...SKIPPED[outcome.reason]);
  const { code, message } = outcome.error;
  throw new AppError(isErrorCode(code) ? code : "upstream_failed", message);
}
