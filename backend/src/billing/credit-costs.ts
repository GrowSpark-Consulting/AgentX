// Credits per automated message (docs/handover.md, module 7). Meta bills its own per-message fees
// to the business's WhatsApp account; those never touch our ledger.
export const CREDIT_COST = {
  ai_reply: 1,
  template_utility: 1,
  template_marketing: 1,
  staff_alert: 0,
  lead_card: 0,
  daily_agenda: 0,
  staff_reply: 0,
} as const;

// Mirror of features.credit_cost (supabase/seed/features.sql); credit-costs.test.ts keeps them equal.
export const FEATURE_CREDIT_COST = {
  ai_auto_reply: 1,
  working_hours_mode: 0,
  lead_qualification: 0,
  booking: 0,
  booking_confirmation: 1,
  reminder_24h: 1,
  reminder_2h: 1,
  staff_alerts: 0,
  handoff_triggers: 0,
  auto_topup: 0,
  daily_agenda: 0,
  followup_nudges: 1,
  noshow_rebooking: 1,
  feedback_request: 1,
  review_request: 1,
  outbound_webhooks: 0,
  handoff_own_number: 0,
  custom_scoring: 0,
  quote_auto_send: 1,
  quote_followup: 1,
  pretrip_info: 1,
} as const satisfies Record<string, 0 | 1>;

export type FeatureKey = keyof typeof FEATURE_CREDIT_COST;
