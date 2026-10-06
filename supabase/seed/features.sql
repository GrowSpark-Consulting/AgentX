-- Feature toggles (docs/handover.md, module 7 and the Tours & Travel pack).
-- credit_cost is per automated message the feature sends: AI reply, utility and marketing
-- templates cost 1; staff alerts, lead cards, daily agenda and staff replies cost 0.
-- Mirror any change in the credit-cost constants file. Whether a tenant has a feature is
-- isEnabled(): the plan includes the key AND the toggle is on (default_on when unset).

insert into public.features (key, name, description, default_on, credit_cost) values
-- v1
('ai_auto_reply',        'AI replies',              'Replies to customer messages from the knowledge base.',                          true,  1),
('working_hours_mode',   'Working-hours mode',      'Reply only outside business hours, when the team is away. Off means reply all day.', false, 0),
('lead_qualification',   'Lead qualification',      'Asks the qualifying questions and scores each lead hot, warm or cold.',          true,  0),
('booking',              'Booking in chat',         'Offers free slots and books visits inside the chat.',                            true,  0),
('booking_confirmation', 'Booking confirmation',    'Sends a confirmation message when a booking is made.',                           true,  1),
('reminder_24h',         'Day-before reminder',     'Reminder with confirm, reschedule and cancel buttons before the booking.',       true,  1),
('reminder_2h',          '2-hour reminder',         'Same-day reminder with the location and who to meet.',                           true,  1),
('staff_alerts',         'Staff alerts',            'WhatsApp alerts to staff for hot leads and handovers.',                          true,  0),
('handoff_triggers',     'Handover to staff',       'Passes the chat to a person when the customer asks or a trigger fires.',         true,  0),
('auto_topup',           'Auto top-up',             'Buys a credit pack automatically when the balance hits zero.',                   false, 0),
('daily_agenda',         'Daily agenda',            'Sends the owner the day''s bookings every morning.',                             true,  0),
('followup_nudges',      'Follow-up nudges',        'Nudges leads that went quiet, then moves them to nurture.',                      true,  1),
('noshow_rebooking',     'No-show rebooking',       'Offers a new time to customers who missed a booking.',                           false, 1),
('feedback_request',     'Feedback request',        'Asks for a rating after the visit.',                                             true,  1),
('review_request',       'Review request',          'Sends the review link to customers who rated 4 or 5.',                           true,  1),
('outbound_webhooks',    'Outbound webhooks',       'Sends new leads and bookings to the business''s CRM or sheet.',                  false, 0),
-- added in v1.0
('handoff_own_number',   'Handover to own WhatsApp', 'Lets staff take a chat on their own WhatsApp number instead of the inbox.',     true,  0),
('custom_scoring',       'Custom scoring',          'Lets the business change scoring rules, weights and thresholds.',                false, 0),
('quote_auto_send',      'Send quotes automatically', 'Sends a quote without staff approval when it is inside the standard price.',  false, 1),
('quote_followup',       'Quote follow-up',         'Follows up on a sent quote that has had no reply.',                              true,  1),
('pretrip_info',         'Pre-trip messages',       'Sends preparation and pickup details before a trip starts.',                     true,  1)
on conflict (key) do update set
  name = excluded.name,
  description = excluded.description,
  default_on = excluded.default_on,
  credit_cost = excluded.credit_cost;
