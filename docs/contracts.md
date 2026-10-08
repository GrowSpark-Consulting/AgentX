# Contracts — Spark Agent

The contracts between the three areas: schema, shared types, function signatures, events, API
routes and error codes (9-day plan, section 3). Each item is marked:

- **Fixed:** in the handover, a merged migration or a merged PR.
- **Agreed:** decided between the owners and waiting to be built; changing it needs a PR all three see.
- **Proposed:** to be decided in the freeze meeting.

Shapes of shared types are documented in `docs/shared-types.md`; specs in `docs/handover.md`;
screen-level contracts in `docs/dashboard-screen-contracts.md`; WhatsApp connection routes in
[whatsapp-connection-contract.md](whatsapp-connection-contract.md) (Proposed, decision 15).

## 1. Schema

**Fixed (merged and applied to staging)**

| Migration | Contents |
|---|---|
| `0001_init` | 21 core tables, RLS on every table, `is_member()`, tenant indexes |
| `0002_packs_and_bookings` | Pack versions `(key, version)`, generic bookings (`kind`, `details`, optional `resource_id`), `catalog_items`, `quotes`, member write policies |
| `0003_whatsapp_connections_and_consent` | `whatsapp_connections`, `connect_links`, `consent_logs`, `whatsapp_connections_public` (security_invoker), `channels.credentials_enc` dropped |
| `0004_kb_vector_index` | HNSW `vector_cosine_ops` on `kb_chunks.embedding` |
| `0005_credit_functions` | `spend_credits`, `grant_credits`, `renew_plan_credits`, `credit_balance` (service_role only) |
| `0006_trial_signup` | `create_trial_tenant` (service_role only) |
| `0007_whatsapp_templates` | `whatsapp_templates`, `set_template_status` (service_role only) |
| `0008_credit_refunds` | `refund_credits(tenant, ref_id)`: returns a failed send's credits to the same buckets (service_role only) |
| `0009_notify_functions` | `notify_target`, `notify_template`, `notify_record`: the database side of `notify.send` (service_role only) |
| `0010_inbox_realtime` | `messages`, `conversations`, `handoffs` in the Realtime publication; `conversations.last_message_at` kept by a trigger |
| `0011_knowledge_base` | `kb_documents.status`/`error`/`body`, one FAQ per question, `kb_gaps`, `kb_documents` in Realtime, `match_kb_chunks` (section 9) |
| `0012_kb_gap_functions` | `kb_gaps.summary`/`answered_by`/`answered_at`, `record_kb_gap`, `answer_kb_gap` (service_role only, section 9) |
| `0013_inbound_messages` | `messages.kind`/`meta`, one open conversation per contact and channel, `store_inbound_message`, `apply_message_status` (service_role only; Dev 1, #50) |
| `0014_connection_method_platform` | `whatsapp_connections.method` may be `platform` (our own test and demo numbers; Dev 1, #51) |
| `0015_booking_engine` | `services.buffer_min`/`min_notice_min`, booking status `expired`, end after start, slot kinds need a resource, `hold_slot`, `confirm_booking`, `reschedule_booking`, `cancel_booking`, `release_expired_holds` (service_role only, section 4) |
| `0016_platform_admins_and_link_tokens` | `platform_admins` (server only), `connect_links.token` → `token_hash` (SHA-256 hex; existing links rehashed) |

- `kb_chunks.embedding` is `vector(1024)`: Cohere `embed-multilingual-v3.0`, cosine distance (`<=>`).
  Retrieval filters by `tenant_id` and sets `hnsw.iterative_scan = relaxed_order`.
- Seed: `supabase/seed/` (plans, 21 features, demo and isolation-test businesses, services, resources, hours).
- Only the 0005 functions write `credit_ledger`.
- **Member writes from the browser** (everything else is read-only for members; server code writes):

| Table | Members can |
|---|---|
| `catalog_items` | read/write own tenant |
| `quotes` | read/write own tenant; lead and catalog item must be in the same tenant |
| `services`, `resources` | insert/update/delete own tenant |
| `leads` | update `stage`, `owner_user_id`, `outcome`, `fields` |
| `tenants` | update `name`, `timezone`, `business_hours`, `agent_settings` |
| `memberships` | update their own `whatsapp_phone`, `takeover_pref` |
| `consent_logs` | read and insert own tenant (no update or delete) |

**Agreed: template status table** (Dev 2 builds it as the next free migration):

```sql
create table public.whatsapp_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  connection_id uuid not null references public.whatsapp_connections(id) on delete cascade,
  name text not null,                  -- versioned, e.g. reminder_24h_v1
  language text not null,              -- en, ta
  category text not null check (category in ('utility','marketing','authentication')),
  components jsonb not null,           -- body, examples, optional header, footer, up to 3 buttons
  status text not null default 'pending'
    check (status in ('draft','pending','approved','rejected','paused','disabled')),
  rejection_reason text,
  meta_template_id text unique,
  updated_at timestamptz not null default now(),
  unique (connection_id, name, language)
);
```

- RLS: members read their own tenant; only the server writes.
- Dev 2's `createTemplate` inserts the row as `pending` after Dev 1's adapter submits the template to Meta.
- Dev 1's webhook, on `message_template_status_update`, calls Dev 2's
  `set_template_status(meta_template_id, status, reason)`. It never writes the table directly.

**Built in 0011:** `match_kb_chunks(p_tenant_id, p_query vector(1024), p_k default 5)` →
`(chunk_id, document_id, title, content, similarity)`, most similar first, `similarity = 1 - cosine
distance`. Only the business's `ready` documents; `k` is clamped to 1–50. Security invoker,
`search_path = ''`, `hnsw.iterative_scan = relaxed_order` (re-sorted after the scan), executable by
`service_role` only. The similarity threshold is the caller's. Migration numbers go to whoever
merges first.

## 2. Shared types (`@pakka/types`)

**Fixed (#8, #12, #15):** `E164`, `PhoneInput`, `InboundMessage`, `StatusUpdate`, `SendResult`,
`Extraction`, `NextAction`, `HandoffTrigger`, the browser-safe connection types,
`PackDefinition`, `SendTestMessageInput`, `CreateTemplateInput`, `ERROR_CODES`, `ApiErrorBody`,
`redactSecrets`. Ids are validated with `z.guid()` (seeded ids are not RFC 9562). Secret-bearing row
types stay in `backend`. Shapes: `docs/shared-types.md`.

**Fixed (#23), applied in `@pakka/types`:**

- `SendTestMessageResult`: `{ providerMsgId, status: "accepted" }` (was `providerMessageId`, `"sent" | "queued"`).
  Delivery arrives later through the status webhook into `messages.delivery_status`.
- `CreateTemplateInput`: optional `header` (text), `footer`, up to 3 `buttons`
  (`quick_reply`, `url`, `phone_number`), optional `connectionId` (default: the business's only
  active connection).
- `CreateTemplateResult`: `{ id, name, language, status: "pending" | "draft" }`.
- `ERROR_CODES`: the additions in section 6.

**Proposed (Dev 2 adds them):**

```ts
type CreditReason =
  | 'plan_grant' | 'topup' | 'trial_grant' | 'ai_reply' | 'template_utility' | 'template_marketing'
  | 'staff_alert' | 'cycle_reset' | 'admin' | 'refund';          // 'refund' written only by refund_credits

type NotificationKind =               // decides toggle, template and credit cost
  | 'ai_reply' | 'consent_notice' | 'booking_confirmation' | 'reminder_24h' | 'reminder_2h'
  | 'followup_nudge' | 'noshow_rebooking' | 'feedback_request' | 'review_request'
  | 'handoff_customer_notice' | 'staff_alert' | 'lead_card' | 'daily_agenda'
  | 'trial_message' | 'credit_alert' | 'quote_sent' | 'quote_followup' | 'pretrip_info'
  | 'staff_reply' | 'test_message';

type SendOutcome =
  | { status: 'sent'; messageId: string; providerMsgId: string; creditsCharged: number; usedTemplate: boolean }
  | { status: 'skipped'; reason: 'feature_off' | 'opted_out' | 'insufficient_credits' | 'outside_window' | 'conversation_not_ai' }
  | { status: 'failed'; error: { code: string; message: string } };

type NotifyPayload = {
  conversationId?: string;   // customer messages
  to?: string;               // test_message only: E.164 recipient
  text?: string;             // free text, inside the 24-hour window
  templateParams?: string[]; // in {{1}}… order, outside the window
  actorId?: string;          // the staff user (staff_reply, test_message); recorded in audit_logs
};
```

**Built in `backend/src/notify`** (`send.ts`, `kinds.ts`, `sender.ts`): `NotifyPayload` and
`SendOutcome` as above. The credit ref is the generated message id (not a payload field).
`NotificationKind` covers `ai_reply`, `staff_reply`, `test_message` and the customer automations;
staff-facing kinds arrive with their jobs.

**Adapter plug-in (Dev 1):** `registerSender(factory)`, where
`factory({ tenantId, connectionId }) → { sendText(to, text), sendTemplate(to, name, language, params) }`
and both return `{ providerMsgId }`. Until it is registered, `notify.send` answers `not_available`
before spending credits. Both throw when WhatsApp refuses the message. When Meta refuses free text
because the 24-hour window has closed (131047, the adapter's `outside_window`), `sendText` throws
`OutsideWindowError` from `backend/src/notify/sender.ts`; any other refusal can throw a plain `Error`.

`FeatureKey` lives in `backend/src/billing/credit-costs.ts` for now and moves here with the above.

## 3. JSON shapes in jsonb columns

| Column | Shape | Status |
|---|---|---|
| `tenants.business_hours`, `resources.working_hours` | `{ "mon": [{ "start": "10:00", "end": "19:00" }], … }`. Keys `mon`–`sun`; local time in `tenants.timezone`; several intervals allow split shifts; a missing day or `[]` means closed. A resource with no days set uses the business's hours | Fixed: read by `findSlots` (`WeeklyHours` in `backend/src/booking/slots.ts`) |
| `resources.service_area` | `{ "pincodes": ["600041", …] }` (field visits); a resource with no area serves every pincode | Fixed: read by `findSlots` |
| `tenant_features.settings` | Reminders: `{ "offset_minutes": 1440 }`; other features `{}` | Proposed |
| `bookings.details` | Free-form per booking kind (pax, pickup point, package id) | Fixed (handover) |
| `whatsapp_templates.components` | As submitted: body, examples, header, footer, buttons | Agreed |
| `tenants.agent_settings` | Persona name, tone, languages, handoff default, scoring overrides | **To define: Dev 1 + Dev 3** |
| `whatsapp_connections.last_check` | One entry per validation check | **To define: Dev 1** |

A service is bookable on any active resource of the same tenant whose `type` equals `services.resource_type`.

## 4. Function signatures

**Fixed (merged).** Dev 2's functions take `tenantId` first and filter by it.

```ts
// backend/src/billing/credits.ts (#13)
spendCredits(tenantId, amount, reason: SpendReason, refId?): Promise<boolean>   // false = would go below zero
getBalance(tenantId): Promise<{ plan: number; topup: number; total: number }>
// backend/src/features/is-enabled.ts (#18)
isEnabled(tenantId, featureKey: FeatureKey): Promise<boolean>
getFeatureStates(tenantId, { fresh? }): Promise<FeatureState[]>
invalidateFeatureCache(tenantId?): void
// backend/src/billing/trial.ts (#18)
createTrialTenant({ userId, name, vertical, timezone? }): Promise<{ tenantId, routeCode, trialEndsAt, created }>
// backend/src/lib/audit.ts
writeAudit({ tenantId, actor, action, entity?, entityId?, diff? }): Promise<void>
```

- `writeAudit` is for every traceable action other than sent messages (`notify_record` writes
  those). `actor` is a user id, `ai`, `system` or `admin:<user id>`; `action` is
  `<entity>.<verb>` (`feature.toggled`); `tenantId` is null only for platform actions. Phone
  numbers in `diff` are masked. It throws if the row is not written.

- `isEnabled` is on only when the business is live (active, or in a trial whose end date has not
  passed), the plan includes the feature and the toggle is on (`default_on` when unset). The
  handover says plan + toggle; the status check is new and needs confirming (decision 12).
- `createTrialTenant`: one self-serve business per account. A repeat call during the trial returns
  the same business (`created: false`); an account that already owns a paying business gets an error.

**Fixed (handover), to be built:**

```ts
notify.send(tenantId, kind: NotificationKind, payload: NotifyPayload): Promise<SendOutcome>   // Dev 2
buildLeadCard(leadId): Promise<LeadCard>                                                      // Dev 1
```

**Booking functions (built, Day 3; `backend/src/booking/`, server only):**

```ts
// bookings.ts
findSlots(tenantId, { serviceId, resourceType?, from, to, pincode? }): Promise<Slot[]>
holdSlot(tenantId, slot: { start, end, resourceId?, serviceId? }, leadId, { kind?, details? }?): Promise<Booking>
confirmBooking(tenantId, bookingId): Promise<Booking>
rescheduleBooking(tenantId, bookingId, newSlot: { start, end, resourceId? }): Promise<Booking>
cancelBooking(tenantId, bookingId, reason?): Promise<void>
// time.ts
localWindow(timeZone, { day: 'today' | 'tomorrow' | 'YYYY-MM-DD', part?: 'morning' | 'afternoon' | 'evening' | 'any' }, now?)
  -> { date, from, to }        // "tomorrow evening" in the business's time zone, as UTC
// Slot = { start, end, resourceId, resourceName, serviceId, label }   start/end ISO UTC; label "Fri 9 Oct, 5:00 pm"
```

- `findSlots` gives up to 3 times spread across the window (first, middle, last). It respects the resource's
  working hours (else the business's), the service's `duration_min`, `buffer_min` (kept clear on both
  sides of a booking) and `min_notice_min`, and held or confirmed bookings (an expired hold no longer
  counts). Start times are every 30 minutes from opening; each time comes with the least busy free resource
  of the service's `resource_type`. With `pincode`, only resources whose `service_area.pincodes` has it, or
  that have no area set. The window is at most 14 days. Google free/busy comes with the calendar sync (Day 4).
- `holdSlot` holds for 10 minutes (`status 'held'`). `kind` defaults to `slot`; `slot`, `site_visit` and
  `field_visit` need a resource and a service; `callback`, `date_range` and `reservation` may have no resource
  and then never clash. A lead holds one time at a time: a new hold releases its earlier one
  (`cancel_reason 'replaced'`). An expired hold stops blocking at once.
- `confirmBooking` confirms a hold (also one past its expiry while still held) and moves the lead to `booked`
  unless it is further along. A repeat is harmless. Emits `booking.confirmed`.
- `rescheduleBooking` works on a confirmed booking: the old row becomes `rescheduled`, a new confirmed row
  takes the new time (`details.rescheduled_from`). Emits `booking.changed` (old) and `booking.confirmed` (new).
- `cancelBooking` cancels a held or confirmed booking (`details.cancel_reason`). A repeat is harmless. Emits
  `booking.changed`.
- **Errors:** a taken time is `slot_taken` (409, the exclusion constraint's 23P01); an unknown or other
  business's lead, service, resource or booking is `not_found`; a hold that expired or a booking in the wrong
  state is `conflict`; bad times, kinds or resources are `validation_failed`.
- **Jobs:** `release-holds` (Inngest cron, every minute) marks holds past their expiry `expired`.
- **Double booking:** blocked by the database: `scripts/db/hold-slot-concurrency.sh` (CI) runs 20 holds for one
  slot at the same moment; exactly one wins.

**`notify.send` behaviour (Proposed, test message Agreed):**

1. `isEnabled` for the kind's feature, if it has one (`staff_reply`, `consent_notice`, `lead_card` and
   `test_message` have none).
2. Skip if the contact has opted out, unless the kind is the final opt-out confirmation.
3. Inside 24 h of `last_customer_msg_at`: free text. Outside: the kind's approved template; if it has
   none, return `skipped / outside_window`.
4. `spendCredits` with the kind's cost; 0-cost kinds skip it. `false` returns `skipped / insufficient_credits`.
5. Send through Dev 1's adapter, store the `messages` row (`credits_charged`), write `audit_logs`.
6. If the adapter fails after credits were spent, call `refund_credits(tenantId, messageId)`.
7. If `sendText` throws `OutsideWindowError` (the window closed after step 3), refund, then send the
   kind's approved template as in step 3; a kind with no template returns `skipped / outside_window`.
   A refused template send is never retried.

**`test_message` (Agreed):**

- 0 credits.
- Always through `notify.send`.
- Free text inside 24 h; otherwise `outside_window`.
- Recorded in `messages` (`direction 'out'`, `sender 'staff'`, `credits_charged 0`,
  `provider_msg_id`; the contact is found or created for the number and tagged `test`) and in
  `audit_logs` (`action 'test_message.sent'`, actor = the staff user).
- Limit: 10 per business per rolling hour, counted from `audit_logs`; over it, `rate_limited`.

## 5. Events (Inngest)

**Fixed names (handover):** `whatsapp/message.received`, `whatsapp/connected`, `booking.confirmed`,
`booking.changed`, `handoff.opened`, `handoff.own_number`, `tenant.trial_started`, `credits.spent`.

**Payloads (Proposed):** ids only, never phone numbers, message text or tokens. An event that may be
sent twice carries a fixed `id` so Inngest drops the duplicate (`tenant.trial_started` uses
`trial_started:<tenantId>`, Fixed in #18).

| Event | Payload |
|---|---|
| `whatsapp/message.received` | `{ tenantId, conversationId, messageId }` |
| `whatsapp/connected` | `{ tenantId, connectionId }` |
| `booking.confirmed` | `{ tenantId, bookingId }`; sent by `confirmBooking` and `rescheduleBooking` (id `booking.confirmed:<bookingId>`) |
| `booking.changed` | `{ tenantId, bookingId, change: 'rescheduled' \| 'cancelled' \| 'completed' \| 'no_show' }`; sent by `rescheduleBooking` and `cancelBooking` (id `booking.changed:<bookingId>:<change>`) |
| `handoff.opened` | `{ tenantId, handoffId, conversationId }` |
| `handoff.own_number` | `{ tenantId, handoffId }` |
| `tenant.trial_started` | `{ tenantId }` |
| `credits.spent` | `{ tenantId, amount, reason, balanceAfter }` |

## 6. API routes and errors

**Fixed:** the handover's route table, including the module 10 endpoints. Every route validates
input with Zod, resolves the tenant from the session (the browser never sends `tenantId`), checks
membership and role, and returns `{ error: { code, message, fields? } }`.

**Where routes run (changed in `feat/backend-railway-split`):** the API service on Railway
(`backend/src/server/routes.ts`), at `${NEXT_PUBLIC_API_URL}/api/...`; paths and shapes are unchanged.
The browser authenticates with `Authorization: Bearer <Supabase access token>` instead of the session
cookie, and in the dashboard names the business with `X-Pakka-Tenant`, which the API honours only for
one of the caller's own memberships (the same rule as the `pakka_tenant` cookie). Browser calls come
from allowed origins only (CORS). New route: `POST /api/onboarding/trial` `{ name, industry }` →
`StartTrialResult` (`@pakka/types`), with status 200 `ready`, 409 `has_business`, 422 `invalid` or
`unavailable`, 500 `failed`; 401 envelope when signed out. It replaces the onboarding server action.

**Who may call a route (`backend/src/server/auth.ts`, built):**

- Members: `tenantRoute(handler, { status })`, the tenant from the token and `X-Pakka-Tenant`.
- Platform team (`/api/admin/...`): `adminRoute(handler, { status })` verifies the token, then checks
  `platform_admins` (0016); anyone else gets `forbidden`. The business is named in the body or path
  (`tenantId`), never by `X-Pakka-Tenant`. Record `admin.actor` (`admin:<user id>`) in `audit_logs` and
  `whatsapp_connections.connected_by`. Both answer with `status` (default 200), or 204 when the service
  returns nothing.
- Public (no login): a `browser: true` route whose handler doesn't authenticate; CORS and the origin
  check still apply. List secret path segments in the route's `secretParams` (`["token"]`) so the request
  log shows `***`. Connect-link tokens come from `newConnectLinkToken()` and are looked up by
  `hashConnectLinkToken()` (`backend/src/lib/connect-link-token.ts`); `connect_links.token_hash` stores the
  hash. Mark a link used in the same statement that checks it (`used_at is null and expires_at > now()`).

**Error codes.** The list is `ERROR_CODES` in `packages/types/src/errors.ts`; the HTTP statuses are in
`backend/src/lib/errors.ts`.

| In `ERROR_CODES` (#15) | HTTP | Added in #23 | HTTP |
|---|---|---|---|
| `unauthenticated` | 401 | `outside_window` | 409 |
| `forbidden` | 403 | `conflict` (e.g. duplicate template name and language) | 409 |
| `not_found` | 404 | `rate_limited` | 429 |
| `validation_failed` | 422 | `insufficient_credits` | 402 |
| `no_membership` | 403 | `slot_taken` | 409 |
| `whatsapp_not_connected` | 409 | `plan_required` | 403 |
| `not_available` | 501 | `seat_limit` | 409 |
| `upstream_failed` | 502 | | |
| `internal` | 500 | | |

Every answer to the frontend's origins carries CORS headers, so the browser can read the error
instead of reporting a network failure: a missing route (404; its preflight passes), a method a browser
route doesn't have (405) and a body over the limit (413, sent before the route runs). Requests from
other origins get no CORS headers.

**Meta App Review routes (#15; shapes Fixed in #23):**

- `POST /api/messages/test` `{ to, body }` → `{ providerMsgId, status: "accepted" }`; owner or admin.
- `POST /api/templates` `{ name, category, language, body, examples, header?, footer?, buttons?, connectionId? }`
  → `{ id, name, language, status: "pending" | "draft" }`; owner or admin.
- The test route sends through `notify.send`: `outside_window` (409) when the number has not
  messaged in 24 hours, `conflict` (409) when it opted out, and `notify.send`'s own codes otherwise.
  Both routes answer `not_available` until Dev 1's adapter is registered.

**Read routes (Proposed, screen-contracts Q1).** Entitlements and balances are computed on the
server, so these are routes, not SQL views:

| Route | Returns | Owner |
|---|---|---|
| `GET /api/features` | Every feature with `available`, `enabled`, `creditCost` (`getFeatureStates(…, { fresh: true })`) | Dev 2 |
| `GET /api/billing/balance` | Balance plus renewal date and trial end | Dev 2 |
| `GET /api/dashboard/summary` | Month counts: enquiries, qualified, booked, after-hours handled | Dev 2 |

Plain lists (leads, conversations, bookings, services) are read directly under RLS.

## 7. Rules

- Every query filters by `tenant_id`, including with the service role.
- Every outbound message goes through `notify.send`; every credit change goes through the 0005 functions.
- Secrets live only in `whatsapp_connections`, encrypted; never logged, returned or sent to the browser.
- Phone numbers are masked in logs (`+9198xxxxxx21`).
- Migrations are append-only. Never edit a merged migration.
- No industry names in code; branch on pack capabilities.
- Reminders are relative to an event anchor, never a fixed time.
- Times are ISO 8601 UTC on the wire and `timestamptz` in the database; money is integer rupees.

## 8. Decisions

| # | Decision | Status | Owner |
|---|---|---|---|
| 1 | Template status table | **Agreed** (section 1) | Dev 1 + Dev 2 |
| 2 | Refund when a send fails after spending | **Agreed**: `refund_credits` (0008), same buckets and expiry, once per message | Dev 2 |
| 3 | `NotificationKind`, `SendOutcome`, `NotifyPayload` | Proposed (`test_message` Agreed) | Dev 1 + Dev 2 |
| 4 | Event payloads: ids only, fixed ids for re-sendable events | Proposed | All |
| 5 | Read routes vs views (screen-contracts Q1) | Proposed: routes | Dev 2 + Dev 3 |
| 6 | Prices (screen-contracts Q6) | Handover v1.0 prices, seeded; Raja to confirm | Raja |
| 7 | Notification matrix, quiet hours, weekly report, retention (Q7) | Proposed: not in v1 | Raja |
| 8 | `agent_settings` and `last_check` shapes | Open | Dev 1, Dev 3 |
| 9 | Pack `bookingType` vs `bookingModes` | Open | Raja + Dev 1 |
| 10 | PR reviews: CI-only merges vs the plan's paired reviewer | Proposed: paired review for `supabase/`, `packages/` and this file | All |
| 11 | Test message and template routes | **Agreed**; types Fixed in #23, `notify.send` built | Dev 1 + Dev 2 + Dev 3 |
| 12 | `isEnabled` also checks business status (paused, cancelled, trial ended) | Built in #18; confirm | Dev 1 + Dev 2 |
| 13 | One self-serve business per account; repeat signup returns it | Built in #18; confirm | Dev 2 + Dev 3 |
| 14 | Knowledge base: storage, routes, statuses, gaps (section 9) | **Proposed**; schema, router and gap functions built (Shaaz); any team member can answer gaps (Raja); pending Dhatri, and Raja on the rest | Dev 1 |
| 15 | WhatsApp connection routes ([whatsapp-connection-contract.md](whatsapp-connection-contract.md), #44) | **Proposed.** Shaaz's answers (7 Oct): platform admins in a `platform_admins` table; the public connect-link route needs no router change (the token is masked in the request log); link tokens stored hashed; `EMBEDDED_SIGNUP_ENABLED` server flag, off by default; connection status by polling, not Realtime. **Built:** `platform_admins`, `adminRoute`, hashed tokens (0016), `secretParams` log masking (section 6). Roles on recheck and disconnect: Raja | Dev 1 |

## 9. Knowledge base (PROPOSED, not agreed)

> **PROPOSED.** Shaaz has reviewed his part and built it: the schema (0011), the router and the gap
> functions (0012). Raja has confirmed that any team member can answer a gap. **Still pending Raja**
> (Documents section meaning, FAQ and document write roles) **and Dhatri's review of the routes and
> shapes.** Detail, open questions and the PR order:
> [kb-contract-checklist.md](kb-contract-checklist.md). Owner: Dev 1 (Nithisha).

**Where it runs:** the routes are on the Railway API (`backend/src/server/routes.ts`), at
`${NEXT_PUBLIC_API_URL}/api/kb/...`, `browser: true`, bearer token plus `X-Pakka-Tenant`. The tenant comes
from the token and that header, never the body. Lists are direct RLS reads. The ingest job registers in
`backend/src/inngest/functions.ts` (the one Inngest endpoint is the API's `/api/inngest`).

**Schema (built in `0011_knowledge_base`):** `kb_documents` gains `status text check in
('processing','ready','failed')`, `error text` and `body text` (a FAQ's answer). New rows default to
`processing`, so the FAQ route and the ingest job set `ready` once the chunks are stored. A business can
have each FAQ question once (`lower(btrim(title))` among `source_type = 'manual'` rows, unique), so a
duplicate is a `23505` the FAQ route maps to `conflict`. A new `kb_gaps` table (`tenant_id`, RLS: members
read, only the server writes; unique `(tenant_id, question_norm)`, `question`, `asked_count >= 1`,
`last_contact_id`, `last_asked_at`, `status open|answered|dismissed`, `answered_faq_id`; deleting the
contact or the FAQ clears the link). `kb_documents` joins the Realtime publication. `match_kb_chunks` as in
section 1. `0012_kb_gap_functions` adds `kb_gaps.summary` (the latest chat summary, <= 500 characters),
`answered_by` (deleting the user clears it) and `answered_at`.

**Gap functions (built in `0012_kb_gap_functions`, service_role only):**

```sql
record_kb_gap(p_tenant_id, p_question, p_question_norm, p_summary, p_contact_id default null)
  -> (gap_id, asked_count, status, created)
answer_kb_gap(p_tenant_id, p_gap_id, p_answer, p_answered_by, p_question default null)
  -> (faq_id, question, answer)
```

- `record_kb_gap` (agent pipeline): one upsert on `(tenant_id, question_norm)`. The first ask inserts
  (`created`); a repeat adds 1 to `asked_count`, sets `last_asked_at`, and replaces `summary` and the last
  contact when the call gives them. `question` keeps the first wording (trimmed); the app owns the
  normaliser. An answered gap asked again goes back to `open` (the earlier answer's fields stay); a
  dismissed one stays dismissed. The `kb_gap` handoff uses the returned `asked_count`.
- `answer_kb_gap` (the answer route): locks the gap, then in one transaction writes the FAQ
  (`manual`, `processing`) and closes the gap with `answered_faq_id`, `answered_by` and `answered_at`.
  `p_question` rewords the FAQ's question (null or blank keeps the gap's). A dismissed gap can still be
  answered. The app then embeds the FAQ and sets it `ready`.
- **Errors:** `PA404` → `not_found` (unknown business, or a gap that isn't the business's); `PA409` →
  `conflict` (already answered); `23505` → `conflict` (the question duplicates an FAQ; nothing changes and
  the gap stays open); `P0001` → `validation_failed` (question empty or over 300 characters, empty
  `question_norm`, summary over 500, answer empty or over 2000, a contact from another business, an
  unknown user).

| Route | Request | Response |
|---|---|---|
| `POST /api/kb/faqs` | `{ q, a }` (q <= 300, a <= 2000 chars) | 201 `{ id, q, a }`; `conflict` on a duplicate question |
| `PATCH /api/kb/faqs/:id` | `{ q?, a? }` | `{ id, q, a }` |
| `DELETE /api/kb/faqs/:id` | | 204 |
| `POST /api/kb/documents` | multipart: `file` (+ optional `title`); pdf, docx, txt or md, <= 5 MB | 202 `{ id, title, sourceType: 'upload', status: 'processing', createdAt }` |
| `DELETE /api/kb/documents/:id` | | 204 (chunks cascade) |
| `GET /api/kb/gaps` | | `[{ id, question, askedCount, lastAskedBy }]`, open only, `askedCount` desc; `lastAskedBy` is a contact name or a masked number |
| `POST /api/kb/gaps/:id/answer` | `{ a }` | `{ faq: { id, q, a } }`, gap closed in one transaction |
| `POST /api/kb/gaps/:id/dismiss` | | 204 |

- **Reads:** the FAQ list is `kb_documents` where `source_type = 'manual'` (`title` = question, `body` =
  answer). The documents list is `id, title, source_type, status, created_at`.
- **Errors:** the usual envelope. A too-large or unsupported file is `validation_failed` with
  `fields.file`. No new error codes.
- **Timing:** FAQ saves and gap answers embed inline, so replies see them at once (an embed failure is
  `upstream_failed` and the row is `failed`). Uploads go to an idempotent Inngest job (`kb/document.uploaded`,
  keyed on the document id, chunks deleted before re-insert). The dashboard watches `kb_documents` through
  Realtime, polling while a row is `processing`.
- **Gaps:** pipeline step 5 records one when retrieval is below the threshold, the same event that feeds the
  `kb_gap` handoff after two misses.
- **Roles:** owner and admin write FAQs and documents; owner, admin and staff can answer gaps (Raja
  confirmed, 7 Oct).
- **Router and upload-limit changes: built.** Paths take `:name` segments (`/api/kb/faqs/:id`; a fixed
  path wins over a pattern) and handlers get them as `params`; `PATCH` and `DELETE` are methods, and
  the preflight lists whatever a route has; a route sets `maxBodyBytes` (default 1 MB), applied
  before the body is read. `tenantRoute(handler, { status })` passes `params`, reads JSON only for
  POST, PUT and PATCH, and answers 204 when the service returns nothing. `backend/src/server/` is
  Shaaz's (Dev 2): ask before changing it.
- **Upload size:** a 5 MB file plus its multipart wrapping is more than 5 MB, so the upload route sets
  `maxBodyBytes: 6 * 1024 * 1024` and checks the file itself: over `5 * 1024 * 1024` bytes (the
  frontend's `UPLOAD_MAX_BYTES`) is `validation_failed` with `fields.file`. A body over 6 MB is refused
  before the route runs: 413 `validation_failed`, readable by the frontend but without `fields`.
- **Build order:** migration, then `backend/src/kb` and the embeddings client (mocked provider), then the
  router PR, then upload and the ingest job, then FAQ routes, then gaps. **FAQ routes and gaps may slip to
  Day 3.**
