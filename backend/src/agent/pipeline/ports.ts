import type { SendOutcome } from "../../notify/send";
import type { FixedTextKey } from "./fixed-texts";

// Two ways of reaching people (Dev 2, docs/contracts.md section 4, "NotificationKind"):
//   - a SYSTEM NOTICE: a free line to the customer that the opt-out check must not block: the holding message when a
//     business is out of credits, and the final confirmation after STOP. Built: notify.send's `system_notice` kind (#70).
//   - a STAFF ALERT: a message to the owner or staff (credits ran out, a chat was handed over). notify.send has no
//     `staff_alert` kind on main yet (Dev 2's #71), so this port only says so in the log ("awaiting_notify_kind"); when
//     it lands, ONLY this implementation changes (see docs/task-notes, "For Dev 2").
// Everything else in the turn (the handoff row, the switch to a person, the event, the audit) does not wait for either.
// Neither port throws into the turn: a notice that could not go is logged and the turn goes on.

export type PortOutcome = { status: "sent" } | { status: "awaiting_notify_kind" } | { status: "failed"; reason: string };

export interface SystemNoticePort {
  send(input: { tenantId: string; conversationId: string; kind: Extract<FixedTextKey, "credits_holding"> | "opt_out_confirmation"; text: string }): Promise<PortOutcome>;
}

export type StaffAlertKind = "credits_exhausted" | "handoff_opened" | "setup_problem";
export interface StaffAlertPort {
  send(input: { tenantId: string; conversationId: string; kind: StaffAlertKind }): Promise<PortOutcome>;
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


// Kinds only in the log: no ids, no text.
export const staffAlertPort: StaffAlertPort = {
  async send({ kind }) {
    console.log(`[pipeline] awaiting_notify_kind (staff alert: ${kind})`);
    return { status: "awaiting_notify_kind" };
  },
};
