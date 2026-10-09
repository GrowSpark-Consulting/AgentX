import type { Extraction, HandoffTrigger, NextAction } from "@pakka/types";
import { textLanguage, type FixedTextKey, type TextLanguage } from "./fixed-texts";
import type { ReplySettings } from "./persona";
import type { UnderstandResult } from "./understand";

// What the customer gets for every way the understanding step can end. Plain code, no model: the table below is
// the whole decision, and every row is a case in plan.test.ts. NOTHING ENDS WITHOUT A DEFINED ANSWER: a customer
// whose message was read, not read, found nothing, or hit an outage always gets a reply, a clarifying question or a
// handover.
//
//   the step ended with                                  | the customer gets                      | also
//   -----------------------------------------------------+----------------------------------------+---------------------------------------------
//   the turn's time ran out (25 s)                       | the safe fallback                      |
//   understood, the message is about leaving (opt_out)   | the STOP hint                          |
//   understood, off topic                                | the model's polite decline             |
//   understood, the knowledge base had the answer        | the model's answer from the facts      | the miss count goes back to 0
//   understood, the knowledge base had nothing (a gap)   | the safe fallback                      | the gap is recorded; the miss count goes up
//   ... and that is the second miss in a row, same chat  | the handover line                      | handoff kb_gap (if the business has it on)
//   understood, the search could not run (an outage)     | the safe fallback                      | no gap, no handoff
//   understood, nothing to look up (a greeting, details) | the model's reply, no facts            | the miss count goes back to 0
//   fallback (no text, bad answer twice, model declined) | a clarifying question                  |
//   the language model could not be reached              | the safe fallback                      |
//   the business has no usable pack                      | the safe fallback                      | handoff stuck, so a person looks at it
//
// A "miss" is a question the knowledge base could not answer. Two in a row IN THE SAME CHAT is the handover trigger
// (docs/handover.md); a miss, then any answered turn, then a miss is not. The count lives on the chat's own messages
// (`messages.meta.agent.kbMisses`), never on the business-wide gap count, which only feeds the dashboard's most-asked list.

export const KB_MISSES_FOR_HANDOFF = 2;

export type ReplyPlan =
  | { mode: "model"; action: NextAction; facts: string[]; language: Extraction["language"] | null }
  | { mode: "fixed"; text: FixedTextKey; language: TextLanguage };

export interface PlanInput {
  understood: UnderstandResult;
  /** The question the customer asked, in English, from the extraction (messages.meta.agent), or null. */
  question: string | null;
  /** contacts.language, as the last fallback for the language of a fixed line. */
  contactLanguage: string | null;
  /** Consecutive misses in this chat before this turn. */
  previousMisses: number;
  settings: ReplySettings;
  /** The turn's hard stop has passed: no model call, the safe fallback. */
  deadlineExceeded: boolean;
}

export interface Plan {
  reply: ReplyPlan;
  /** Open a handover after the reply is sent. */
  handoff?: { trigger: HandoffTrigger; priority: "high" | "normal" };
  /** Record this question as a gap in the knowledge base. */
  gap?: { question: string };
  /** The miss count to keep for the next turn of this chat. */
  kbMisses: number;
  /** The row of the table above, for the log (never a customer's words). */
  case: string;
}

const fixed = (text: FixedTextKey, language: TextLanguage): ReplyPlan => ({ mode: "fixed", text, language });

export function planReply(input: PlanInput): Plan {
  const { understood, question, previousMisses, settings } = input;
  const language = textLanguage(understood.status === "understood" ? understood.summary.language : null, input.contactLanguage);
  const carry = previousMisses;

  if (input.deadlineExceeded) return { reply: fixed("fallback", language), kbMisses: carry, case: "deadline" };

  switch (understood.status) {
    case "no_pack":
      return { reply: fixed("fallback", language), handoff: { trigger: "stuck", priority: "normal" }, kbMisses: carry, case: "no_pack" };
    case "model_unavailable":
      return { reply: fixed("fallback", language), kbMisses: carry, case: "model_unavailable" };
    case "fallback":
      return { reply: fixed("clarify", language), kbMisses: carry, case: `clarify_${understood.reason}` };
    case "understood":
      break;
  }

  const { summary, retrieval } = understood;
  if (summary.intent === "opt_out") return { reply: fixed("stop_hint", language), kbMisses: carry, case: "opt_out_hint" };

  const asked = question?.trim() ? question.trim() : "";
  const model = (action: NextAction, facts: string[] = []): ReplyPlan => ({ mode: "model", action, facts, language: summary.language });

  if (summary.intent === "off_topic") return { reply: model({ kind: "decline_off_topic" }), kbMisses: 0, case: "off_topic" };

  switch (retrieval.outcome) {
    case "found": {
      const facts = retrieval.chunks.map((chunk) => (chunk.title ? `${chunk.title}: ${chunk.content}` : chunk.content));
      return { reply: model({ kind: "answer_and_ask", question: asked, askFields: [] }, facts), kbMisses: 0, case: "answered_from_kb" };
    }
    case "none": {
      // Capped: a business that had this trigger off (or a chat a person handed back) must not start with a bank of misses.
      const misses = Math.min(previousMisses, KB_MISSES_FOR_HANDOFF - 1) + 1;
      const gap = asked ? { question: asked } : undefined;
      if (misses >= KB_MISSES_FOR_HANDOFF && settings.kbGapHandoffEnabled) {
        // The handover uses the misses up: when a person hands the chat back, it starts again from 0.
        return { reply: fixed("handoff", language), handoff: { trigger: "kb_gap", priority: "normal" }, gap, kbMisses: 0, case: "kb_miss_handoff" };
      }
      return { reply: fixed("fallback", language), gap, kbMisses: misses, case: "kb_miss" };
    }
    case "unavailable":
      return { reply: fixed("fallback", language), kbMisses: carry, case: "kb_unavailable" };
    case "skipped":
      return { reply: model({ kind: "answer_and_ask", question: "", askFields: [] }), kbMisses: 0, case: "nothing_to_look_up" };
  }
}
