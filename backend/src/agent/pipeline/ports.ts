import type { SendOutcome } from "../../notify/send";
import type { FixedTextKey } from "./fixed-texts";

// The SYSTEM NOTICE: a free line to the customer that the opt-out check must not block: the holding message when a business is
// out of credits, and the final confirmation after STOP (notify.send's `system_notice` kind, #70). It never throws into the turn:
// a notice that could not go is logged and the turn goes on.
//
// There is no staff-alert port: the owner's alert for a handoff is Dev 2's `handoff-alert` job (#71), started by the
// `handoff.opened` event the reply step and the STOP check send. Sending one here as well would alert staff twice.

export type PortOutcome = { status: "sent" } | { status: "queued" } | { status: "awaiting_notify_kind" } | { status: "failed"; reason: string };

export interface SystemNoticePort {
  send(input: { tenantId: string; conversationId: string; kind: Extract<FixedTextKey, "credits_holding"> | "opt_out_confirmation"; text: string }): Promise<PortOutcome>;
}

/**
 * The system notice through notify.send's `system_notice` kind (Dev 2, #70): free, no toggle, free text inside the 24-hour
 * window only, and sent even to a contact who opted out. A notice that was not sent (outside the window, a refusal) is a
 * "failed" outcome with a reason: no ids and no text in it.
 */
export function createSystemNoticePort(send: (tenantId: string, kind: "system_notice", payload: { conversationId: string; text: string }) => Promise<SendOutcome>): SystemNoticePort {
  return {
    async send({ tenantId, conversationId, text }) {
      const outcome = await send(tenantId, "system_notice", { conversationId, text });
      if (outcome.status === "sent") return { status: "sent" };
      return { status: "failed", reason: outcome.status === "skipped" ? outcome.reason : outcome.error.code };
    },
  };
}
