import type { FixedTextKey } from "./fixed-texts";

// Two ways of reaching people that notify.send does not have yet (Dev 2, docs/contracts.md section 4, "NotificationKind"):
//   - a SYSTEM NOTICE: a free line to the customer that the opt-out check must not block: the holding message when a
//     business is out of credits, and the final confirmation after STOP. notify.send has no such kind: `ai_reply`
//     costs a credit and is refused for a customer who has opted out.
//   - a STAFF ALERT: a message to the owner or staff (credits ran out, a chat was handed over). notify.send has no
//     `staff_alert` kind yet.
// Everything else in the turn (the handoff row, the switch to a person, the event, the audit) is done without them.
// Until Dev 2 adds the kinds, these ports do nothing but say so in the log ("awaiting_notify_kind"); when the kinds
// exist, ONLY these two implementations change (see docs/task-notes, "For Dev 2"). They never throw: a notice that
// could not go is logged and the turn goes on.

export type PortOutcome = { status: "sent" } | { status: "awaiting_notify_kind" } | { status: "failed"; reason: string };

export interface SystemNoticePort {
  send(input: { tenantId: string; conversationId: string; kind: Extract<FixedTextKey, "credits_holding"> | "opt_out_confirmation"; text: string }): Promise<PortOutcome>;
}

export type StaffAlertKind = "credits_exhausted" | "handoff_opened" | "setup_problem";
export interface StaffAlertPort {
  send(input: { tenantId: string; conversationId: string; kind: StaffAlertKind }): Promise<PortOutcome>;
}

// Kinds only in the log: no ids, no text.
export const systemNoticePort: SystemNoticePort = {
  async send({ kind }) {
    console.log(`[pipeline] awaiting_notify_kind (system notice: ${kind})`);
    return { status: "awaiting_notify_kind" };
  },
};

export const staffAlertPort: StaffAlertPort = {
  async send({ kind }) {
    console.log(`[pipeline] awaiting_notify_kind (staff alert: ${kind})`);
    return { status: "awaiting_notify_kind" };
  },
};
