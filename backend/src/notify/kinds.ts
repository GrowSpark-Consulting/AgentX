import type { FeatureKey } from "../billing/credit-costs";

/** Credit reasons an outbound message can be charged under (credit_ledger.reason). */
export type MessageCreditReason = "ai_reply" | "template_utility" | "template_marketing";

// What each kind of outbound message is (docs/contracts.md, section 2 NotificationKind). Staff-facing
// kinds (staff_alert, lead_card, daily_agenda) arrive with their jobs.
export type NotificationKind =
  | "ai_reply"
  | "staff_reply"
  | "test_message"
  | "booking_confirmation"
  | "reminder_24h"
  | "reminder_2h"
  | "followup_nudge"
  | "noshow_rebooking"
  | "feedback_request"
  | "review_request";

export type KindConfig = {
  /** isEnabled gate; kinds without one are always allowed. */
  feature?: FeatureKey;
  /** Automated messages cost credits; staff-initiated ones (replies, test messages) never do. */
  charged: boolean;
  /** Credit reason when sent as free text inside the 24-hour window. Template sends use the template's category. */
  freeTextReason?: MessageCreditReason;
  /** Template base name; outside the window the newest approved `<base>_vN` is sent. */
  template?: string;
  /** messages.sender */
  sender: "ai" | "staff" | "system";
  /** Who receives it: an existing conversation, or a number typed by staff (test message). */
  audience: "conversation" | "number";
};

export const KINDS: Record<NotificationKind, KindConfig> = {
  ai_reply: { feature: "ai_auto_reply", charged: true, freeTextReason: "ai_reply", sender: "ai", audience: "conversation" },
  staff_reply: { charged: false, sender: "staff", audience: "conversation" },
  test_message: { charged: false, sender: "staff", audience: "number" },
  booking_confirmation: { feature: "booking_confirmation", charged: true, freeTextReason: "template_utility", template: "booking_confirmed", sender: "system", audience: "conversation" },
  reminder_24h: { feature: "reminder_24h", charged: true, freeTextReason: "template_utility", template: "reminder_24h", sender: "system", audience: "conversation" },
  reminder_2h: { feature: "reminder_2h", charged: true, freeTextReason: "template_utility", template: "reminder_2h", sender: "system", audience: "conversation" },
  followup_nudge: { feature: "followup_nudges", charged: true, freeTextReason: "template_marketing", template: "nudge", sender: "system", audience: "conversation" },
  noshow_rebooking: { feature: "noshow_rebooking", charged: true, freeTextReason: "template_marketing", template: "noshow_rebook", sender: "system", audience: "conversation" },
  feedback_request: { feature: "feedback_request", charged: true, freeTextReason: "template_marketing", template: "feedback", sender: "system", audience: "conversation" },
  review_request: { feature: "review_request", charged: true, freeTextReason: "template_marketing", template: "review", sender: "system", audience: "conversation" },
};
