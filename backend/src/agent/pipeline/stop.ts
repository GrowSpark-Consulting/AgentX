import { matchStop } from "../../consent/stop-words";
import { recordAnswered } from "./answered";
import { fixedText } from "./fixed-texts";
import type { PortOutcome } from "./ports";
import { BATCH_WINDOW_MS, type StepRunner, type TurnContext } from "./process-message";
import type { ReplyDeps } from "./reply";

// STOP, before anything else is done with the customer's message (docs/handover.md, "Consent (DPDP)"): if a message of the
// turn IS a STOP (the whole message is one of the fixed phrases in consent/stop-words.ts), the contact is opted out
// (contacts.opted_out_at and consent_logs `opted_out`, in one transaction), they get AT MOST ONE final confirmation, every
// message of the turn is marked answered, and the turn ends: no reading of the message by the model, no reply, no lead
// update. After that the gate (step 3) stops every later message of this contact, and notify.send refuses them too.
//
// It runs on EVERY turn that has a text message, whatever the gate says: a chat a person has, or a business whose AI replies are
// switched off, must honour STOP too (`stopCheckAfterGate`), and so must the safe line sent after a run gave up
// (`answerAfterFailure`). An opt-out never depends on a feature toggle.
//
// The confirmation goes through the system-notice port (a free line the opt-out check must not block). Until Dev 2 adds that
// kind it only logs `awaiting_notify_kind`; the opt-out itself does not wait for it. The confirmation is sent only by the call
// that recorded the opt-out: a run that dies between the two never sends it (at most once, never twice).

export type StopResult = { status: "continue" } | { status: "opted_out"; confirmation: PortOutcome["status"] | "not_needed" };
type OptedOut = Extract<StopResult, { status: "opted_out" }>;
type StopDeps = Pick<ReplyDeps, "store" | "audit" | "systemNotice">;

export interface StopScope {
  tenantId: string;
  conversationId: string;
  contactId: string;
  messageIds: readonly string[];
}

/** Opts the contact out if one of these messages is a STOP: the opt-out, the one confirmation, the answered rows. Null when none is. */
export async function applyStop(scope: StopScope, deps: StopDeps): Promise<OptedOut | null> {
  const { store } = deps;
  const texts = await store.getBatchTexts(scope.tenantId, scope.conversationId, [...scope.messageIds]);
  const hit = texts.map((t) => ({ id: t.id, language: t.body ? matchStop(t.body) : null })).find((t) => t.language !== null);
  if (!hit || hit.language === null) return null;

  const optedOut = await store.recordOptOut(scope.tenantId, scope.contactId, "stop_keyword", hit.id);
  let confirmation: OptedOut["confirmation"] = "not_needed";
  if (optedOut) {
    try {
      const sent = await deps.systemNotice.send({
        tenantId: scope.tenantId,
        conversationId: scope.conversationId,
        kind: "opt_out_confirmation",
        text: fixedText("opt_out_confirmation", hit.language),
      });
      confirmation = sent.status;
    } catch {
      confirmation = "failed"; // the opt-out stands; a notice that could not go is not worth undoing it
    }
  }
  await recordAnswered(scope, deps); // every message of the turn: it was handled, and is not looked at again
  return { status: "opted_out", confirmation };
}

/** The step that runs before the message is read (the gate has let the turn through). */
export async function stopCheck(step: StepRunner, turn: TurnContext, deps: StopDeps): Promise<StopResult> {
  return step.run<StopResult>("stop-check", async () => (await applyStop(turn, deps)) ?? { status: "continue" });
}

/**
 * The same check for a turn the gate turned away because a person has the chat or the AI is switched off: its batch is found
 * here from the event (the same window the pipeline uses). A contact who has already opted out has nothing more to do.
 */
export async function stopCheckAfterGate(step: StepRunner, ids: { tenantId: string; conversationId: string; messageId: string }, deps: StopDeps): Promise<StopResult> {
  return step.run<StopResult>("stop-check-gated", async () => {
    const { store } = deps;
    const message = await store.getMessage(ids.tenantId, ids.conversationId, ids.messageId);
    if (!message || message.direction !== "in" || message.sender !== "customer") return { status: "continue" };
    const conversation = await store.getConversation(ids.tenantId, ids.conversationId);
    if (!conversation) return { status: "continue" };
    const contact = await store.getContact(ids.tenantId, conversation.contactId);
    if (!contact || contact.optedOut) return { status: "continue" };
    const since = new Date(Date.parse(message.createdAt) - BATCH_WINDOW_MS).toISOString();
    const pending = (await store.recentUnanswered(ids.tenantId, ids.conversationId, since)).map((m) => m.id);
    const messageIds = pending.includes(ids.messageId) ? pending : [...pending, ids.messageId];
    return (await applyStop({ tenantId: ids.tenantId, conversationId: ids.conversationId, contactId: contact.id, messageIds }, deps)) ?? { status: "continue" };
  });
}
