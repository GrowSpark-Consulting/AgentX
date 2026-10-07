import { randomUUID } from "node:crypto";
import { z } from "zod";
import { CREDIT_COST } from "../billing/credit-costs";
import { refundCredits, spendCredits } from "../billing/credits";
import { isEnabled } from "../features/is-enabled";
import { supabaseAdmin } from "../lib/supabase-admin";
import { KINDS, type MessageCreditReason, type NotificationKind } from "./kinds";
import { OutsideWindowError, senderFactory, type MessageSender } from "./sender";

// notify.send (docs/handover.md, module 5; docs/contracts.md, section 4): every outbound message goes
// through here. Order: feature toggle → recipient and connection → opt-out → test-message limit →
// 24-hour window (free text) or approved template → credits → send → record (messages + audit_logs).
// If the send fails after credits were spent, they are refunded. If WhatsApp says the window has
// closed (OutsideWindowError), the approved template is sent instead.

export type NotifyPayload = {
  /** Customer messages: the conversation to reply in. */
  conversationId?: string;
  /** test_message only: the E.164 number staff typed. */
  to?: string;
  /** Free-text body, used inside the 24-hour window. */
  text?: string;
  /** Template variables in {{1}}… order, used outside the window. */
  templateParams?: string[];
  /** The staff user who sent it (staff_reply, test_message); recorded in audit_logs. */
  actorId?: string;
};

export type SendOutcome =
  | { status: "sent"; messageId: string; providerMsgId: string; creditsCharged: number; usedTemplate: boolean }
  | {
      status: "skipped";
      reason: "feature_off" | "opted_out" | "insufficient_credits" | "outside_window";
    }
  | { status: "failed"; error: { code: string; message: string } };

export const TEST_MESSAGES_PER_HOUR = 10;
const WINDOW_MS = 24 * 60 * 60 * 1000;

const Target = z.object({
  connection_id: z.guid(),
  conversation_id: z.guid(),
  contact_id: z.guid(),
  to_phone: z.string(),
  opted_out: z.boolean(),
  last_customer_msg_at: z.string().nullable(),
  language: z.string().nullable(),
  recent_test_messages: z.number().int(),
});
const Template = z.object({ name: z.string(), language: z.string(), category: z.string() });

const failed = (code: string, message: string): SendOutcome => ({ status: "failed", error: { code, message } });

export async function send(tenantId: string, kind: NotificationKind, payload: NotifyPayload): Promise<SendOutcome> {
  const kindConfig = KINDS[kind];
  if (kindConfig.audience === "number" ? !payload.to || !payload.text : !payload.conversationId) {
    throw new Error(`notify.send(${kind}): ${kindConfig.audience === "number" ? "to and text" : "conversationId"} required`);
  }

  if (kindConfig.feature && !(await isEnabled(tenantId, kindConfig.feature))) {
    return { status: "skipped", reason: "feature_off" };
  }

  const factory = senderFactory();
  if (!factory) {
    return failed("not_available", "Sending WhatsApp messages isn't switched on yet, so the message was not sent.");
  }

  const db = supabaseAdmin();
  const targetResult = await db.rpc("notify_target", {
    p_tenant_id: tenantId,
    p_conversation_id: payload.conversationId ?? null,
    p_to: payload.to ?? null,
  });
  if (targetResult.error) {
    if (targetResult.error.code === "PA404") return failed("not_found", "That conversation was not found.");
    if (targetResult.error.code === "PA409") {
      return failed("whatsapp_not_connected", "This business has no connected WhatsApp number, so the message was not sent.");
    }
    throw new Error(`notify_target failed: ${targetResult.error.message}`);
  }
  const [target] = z.array(Target).length(1).parse(targetResult.data);

  if (target.opted_out) return { status: "skipped", reason: "opted_out" };
  if (kind === "test_message" && target.recent_test_messages >= TEST_MESSAGES_PER_HOUR) {
    return failed("rate_limited", `Only ${TEST_MESSAGES_PER_HOUR} test messages an hour. Try again later.`);
  }

  // Free text only inside 24 hours of the customer's last message; otherwise an approved template.
  const lastCustomerMessage = target.last_customer_msg_at ? Date.parse(target.last_customer_msg_at) : null;
  const insideWindow = lastCustomerMessage !== null && Date.now() - lastCustomerMessage < WINDOW_MS;
  let template: z.infer<typeof Template> | undefined;
  if (!(insideWindow && payload.text)) {
    if (!kindConfig.template) return { status: "skipped", reason: "outside_window" };
    const templateResult = await db.rpc("notify_template", {
      p_connection_id: target.connection_id,
      p_base_name: kindConfig.template,
      p_language: target.language ?? "en",
    });
    if (templateResult.error) throw new Error(`notify_template failed: ${templateResult.error.message}`);
    template = z.array(Template).max(1).parse(templateResult.data)[0];
    if (!template) return { status: "skipped", reason: "outside_window" };
  }

  const reason: MessageCreditReason | undefined = template
    ? template.category === "marketing" ? "template_marketing" : "template_utility"
    : kindConfig.freeTextReason;
  const cost = kindConfig.charged && reason ? CREDIT_COST[reason] : 0;

  let sender: MessageSender;
  try {
    sender = await factory({ tenantId, connectionId: target.connection_id });
  } catch {
    return failed("upstream_failed", "The WhatsApp connection could not be used, so the message was not sent.");
  }

  const messageId = randomUUID();
  if (cost > 0 && reason && !(await spendCredits(tenantId, cost, reason, messageId))) {
    return { status: "skipped", reason: "insufficient_credits" };
  }

  let providerMsgId: string;
  try {
    const sent = template
      ? await sender.sendTemplate(target.to_phone, template.name, template.language, payload.templateParams ?? [])
      : await sender.sendText(target.to_phone, payload.text as string);
    providerMsgId = sent.providerMsgId;
  } catch (err) {
    if (cost > 0) await refundCredits(tenantId, messageId);
    // The window closed between our check and WhatsApp's. Send again without the free text, which
    // picks the kind's approved template; a kind with no template is skipped.
    if (err instanceof OutsideWindowError && !template) {
      if (!kindConfig.template) return { status: "skipped", reason: "outside_window" };
      return send(tenantId, kind, { ...payload, text: undefined });
    }
    return failed("upstream_failed", "WhatsApp did not accept the message, so it was not sent.");
  }

  const actor = payload.actorId ?? (kindConfig.sender === "ai" ? "ai" : "system");
  const recorded = await db.rpc("notify_record", {
    p_tenant_id: tenantId,
    p_message_id: messageId,
    p_conversation_id: target.conversation_id,
    p_sender: kindConfig.sender,
    p_body: template ? null : (payload.text ?? null),
    p_template_name: template?.name ?? null,
    p_provider_msg_id: providerMsgId,
    p_credits: cost,
    p_actor: actor,
    p_kind: kind,
  });
  // The message has gone out and is paid for; a retry would send it twice. Log and report it as sent.
  if (recorded.error) console.error(`notify_record failed for message ${messageId}: ${recorded.error.message}`);

  return { status: "sent", messageId, providerMsgId, creditsCharged: cost, usedTemplate: Boolean(template) };
}
