# Developer Handover — Spark Agent (v1.0)

Oct 4, 2026 · @Raja · pakkaagent.in

> Markdown copy of `Pakka_Agent_Developer_Handover_v1.0.pdf`. This file is the source of truth in the repo;
> change it through a pull request when a contract changes.
>
> The product was renamed from Pakka Agent to **Spark Agent** (Oct 2026). The domain (`pakkaagent.in`), the
> repository and package names (`pakka-agent`, `@pakka/*`) and other infrastructure identifiers keep the
> old name until they are migrated; history below keeps the name used at the time.

## What we are building

Spark Agent is a self-serve SaaS where a business connects its WhatsApp number and an AI assistant answers its enquiries, qualifies leads, books visits, sends reminders, collects feedback and hands chats to staff — billed in monthly credits, with a 7-day free trial. Product reasoning, pricing and compliance live in the *Pakka Agent — Production Blueprint*; this document is how we build it.

### In v1

- **Channel:** WhatsApp only, on Meta's WhatsApp Cloud API through our own Meta app (Tech Provider). Clients connect through Embedded Signup, an assisted link, or manual credentials.
- **Industries (vertical packs):** real estate, interior design, beauty parlour first; hotel, restaurant, plumber/electrician as config later.
- **Agent:** answers from the business's knowledge base, collects details in casual chat (English, Tamil, Tanglish, Malayalam, Hindi), scores the lead, books slots, hands off with a lead card.
- **Notifications:** confirmations, 24 h and 2 h reminders, nudges, no-show rebooking, feedback and review requests, staff alerts, daily agenda — each a toggle.
- **Dashboard:** inbox, leads pipeline, calendar, knowledge base, feature toggles, agent settings, billing and credits, team.
- **SaaS:** three plans (Starter, Growth, Pro) sold as credits, top-ups, 7-day trial, shared demo number, admin panel.
- **Not in v1:** clinic pack, email, website chat, Instagram, voice, payments from end customers, CRM sync beyond outbound webhooks.

### Three rules every module follows

1. **Code decides, the LLM talks.** The LLM extracts fields and writes reply text. Scoring, booking, credits and routing are plain code.
2. **Everything is per tenant.** Every row has `tenant_id`; Supabase row-level security is on for every table from day one.
3. **Built to extend.** Channels are adapters, industries are vertical-pack JSON, features are rows in a `features` table. Adding email, a clinic pack or a new toggle must never need a rewrite.

### What changed in v1.0 (read this first)

- **Name:** the product is Spark Agent (formerly Pakka Agent; domain still pakkaagent.in). Repo name `pakka-agent`; WhatsApp webhook at `https://api.pakkaagent.in/webhooks/whatsapp`.
- **No BSP.** We call Meta's WhatsApp Cloud API directly through our own Meta app, registered as a Tech Provider. Each client keeps its own WhatsApp Business Account and pays Meta's fees to Meta. All BSP tasks, env vars and endpoints are gone.
- **New module 10: WhatsApp connection.** Three paths (Embedded Signup with coexistence, an assisted connect link, manual credentials) into one `whatsapp_connections` table, plus `consent_logs` for DPDP. Migration 0003.
- **Pricing changed:** Starter ₹2,499 / 1,500 credits, Growth ₹5,999 / 5,000, Pro ₹12,999 / 15,000. Only automated outbound messages cost credits (1 each); staff alerts, lead cards and staff replies are free. One-month rollover, top-ups at ₹1.20 a credit, 300 trial credits, optional ₹4,999 setup fee.
- **Handoff to a staff member's own WhatsApp** is a Growth and Pro feature (`handoff_own_number`).
- **Tours & Travel pack**, migration 0002 and milestone M7 are added below.
- Apply migrations 0002 and 0003 before the first real tenant exists.

## Team and ownership

Each developer owns one area end to end (database, API, UI, tests) and reviews one other area, so no part depends on a single person.

| Area | Owner | Reviewer | Modules |
|---|---|---|---|
| Agent | Dev 1 (name) | Dev 2 | WhatsApp adapter and connection backend (module 10), message pipeline, orchestrator, LLM prompts, scoring, vertical packs, knowledge base and retrieval, handoff logic, conversation test suite |
| Booking, jobs and money | Dev 2 (name) | Dev 3 | Slot engine, Google Calendar sync, background jobs, notifications and templates, feature-flag checks, credit ledger, Razorpay plans and top-ups, trial and demo-number routing |
| Dashboard and onboarding | Dev 3 (name) | Dev 1 | Auth, dashboard shell, inbox (realtime), leads pipeline, calendar view, KB editor, feature toggles UI, billing UI, onboarding wizard with the WhatsApp connect step, connect-link page, admin panel with manual connection, landing page |
| Shared (all three) | — | — | Database schema and migrations, shared types package, CI, environments |
| Product and accounts | Raja | — | Meta app, Business Portfolio, Tech Provider and App Review; Razorpay and Google accounts; assisted onboarding calls with clients; vertical-pack content; template wording; test chats in Tamil and Tanglish; beta businesses; final decisions |

Rules: schema changes go through a pull request reviewed by all three; anyone touching another area's code tags its owner.

## Tech stack, repo and environments

One TypeScript Next.js app holds the dashboard, the API, the webhooks and the background-job functions; Supabase holds data, auth and vectors.

| Layer | Choice |
|---|---|
| Language | TypeScript (strict), Node 20+ |
| App | Next.js App Router on Vercel |
| UI | Tailwind CSS + shadcn/ui |
| Database, auth, realtime, vectors | Supabase (Postgres, Auth, Realtime, pgvector), Mumbai region |
| DB access | Supabase JS client + SQL migrations in `supabase/migrations` |
| Validation | Zod for every external input and every LLM output |
| Background jobs | Inngest (functions live in `src/inngest`) |
| LLM | Anthropic API: Haiku-class model for extraction, Sonnet-class model for replies, prompt caching on |
| Embeddings | One embeddings provider, chosen at kickoff; vectors in pgvector |
| WhatsApp | Meta WhatsApp Cloud API (Graph API, version pinned in one env var) behind our own adapter; no BSP |
| Calendar | Google Calendar API (OAuth per business) |
| Billing | Razorpay Subscriptions and Orders |
| System email | Resend |
| Monitoring | Sentry; Langfuse for LLM traces |
| Tests | Vitest (unit), Playwright (dashboard), our conversation test runner |

### Repo layout

```
pakka-agent/
├─ CLAUDE.md                  # rules for Claude Code (see section below)
├─ docs/handover.md           # this document
├─ supabase/migrations/       # 0001_init, 0002_packs_and_bookings, 0003_whatsapp_connections_and_consent
├─ packs/                     # real-estate.json, interiors.json, salon.json, tours-travel.json
├─ tests/conversations/       # scripted chats per pack (YAML)
└─ src/
   ├─ app/                    # Next.js routes: (dashboard), (admin), (marketing), connect/, api/
   ├─ channels/whatsapp/      # adapter: parse webhook, send, templates, signature check
   │  └─ connect/             # embedded signup exchange, manual connect, validation checks
   ├─ agent/                  # pipeline, orchestrator, extraction, reply, scoring, handoff
   ├─ booking/                # slot engine, holds, calendar sync, catalog, quotes
   ├─ notify/                 # notification catalogue, template sends, staff alerts
   ├─ billing/                # plans, credits ledger, razorpay
   ├─ consent/                # consent notice, opt-out, deletion
   ├─ features/               # feature flags: isEnabled(tenant, key)
   ├─ kb/                     # ingestion, chunking, embeddings, retrieval
   ├─ inngest/                # job functions (process-message, send-reminder, connection-health, ...)
   ├─ lib/                    # supabase clients, crypto, logger, errors, env
   └─ types/                  # shared types and Zod schemas
```

**Environments:** local (Supabase CLI + Inngest dev server + the Meta test number from the app's WhatsApp setup), staging (separate Supabase project, its own test number), production. Nobody points local code at production data.

**Environment variables** (in `.env.example`, real values in Vercel and a shared password manager, never in git):

```
NEXT_PUBLIC_APP_URL=                 # https://app.pakkaagent.in
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
EMBEDDINGS_API_KEY=
NEXT_PUBLIC_META_APP_ID=
META_APP_SECRET=                     # verifies webhook signatures, exchanges ES codes
NEXT_PUBLIC_META_ES_CONFIG_ID=       # Facebook Login for Business configuration id
META_GRAPH_API_VERSION=              # pin one version, upgrade deliberately
META_WEBHOOK_VERIFY_TOKEN=
META_SYSTEM_USER_TOKEN=              # our own portfolio only: demo number, template admin
WHATSAPP_DEMO_WABA_ID=
WHATSAPP_DEMO_PHONE_NUMBER_ID=
WHATSAPP_REGISTER_PIN=               # 6-digit two-step PIN used when registering numbers
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=
RESEND_API_KEY=
SENTRY_DSN=
LANGFUSE_PUBLIC_KEY=
LANGFUSE_SECRET_KEY=
ENCRYPTION_KEY=                      # AES-256-GCM for WhatsApp and calendar tokens at rest
```

## Database schema

This is the starting migration (`0001_init.sql`). Every table has `tenant_id` and row-level security; the message pipeline runs with the service role, so server code must still filter by `tenant_id` explicitly.

```sql
create extension if not exists vector;
create extension if not exists btree_gist;

-- Businesses and people
create table tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  vertical text not null,                         -- pack key, e.g. 'real-estate'
  timezone text not null default 'Asia/Kolkata',
  status text not null default 'trial' check (status in ('trial','active','paused','cancelled')),
  plan_key text not null default 'trial',
  trial_ends_at timestamptz,
  business_hours jsonb not null default '{}',
  agent_settings jsonb not null default '{}',     -- persona name, tone, languages, handoff default
  created_at timestamptz not null default now()
);

create table memberships (
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','admin','staff')),
  whatsapp_phone text,                            -- for staff alerts
  takeover_pref text check (takeover_pref in ('inbox','own_number','ask')),
  primary key (tenant_id, user_id)
);

-- Channels and conversations
create table channels (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  type text not null check (type in ('whatsapp','email','web')),   -- only whatsapp in v1
  phone_number_id text unique,
  waba_id text,
  display_phone text,
  credentials_enc text,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  phone text not null,
  name text,
  language text,
  consent_at timestamptz,
  opted_out_at timestamptz,
  tags text[] not null default '{}',
  unique (tenant_id, phone)
);

create table conversations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  channel_id uuid not null references channels(id),
  mode text not null default 'ai' check (mode in ('ai','human','external')),
  assigned_user_id uuid,
  last_customer_msg_at timestamptz,               -- drives the 24-hour window
  status text not null default 'open',
  created_at timestamptz not null default now()
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  direction text not null check (direction in ('in','out')),
  sender text not null check (sender in ('customer','ai','staff','system')),
  body text,
  media jsonb,
  template_name text,
  provider_msg_id text unique,                    -- idempotency
  delivery_status text,
  credits_charged int not null default 0,
  created_at timestamptz not null default now()
);

-- Leads
create table leads (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  stage text not null default 'new'
    check (stage in ('new','engaged','qualified','booked','visited','won','lost','nurture','human')),
  score int,
  temperature text check (temperature in ('hot','warm','cold','disqualified')),
  fields jsonb not null default '{}',             -- extracted answers, keyed by pack field
  owner_user_id uuid,
  outcome text,
  feedback_rating int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Industry packs and knowledge
create table vertical_packs (
  key text primary key,
  version int not null,
  active boolean not null default false,          -- clinic stays false until launch
  definition jsonb not null
);

create table kb_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  source_type text not null,                      -- website, upload, manual
  source_url text,
  title text,
  created_at timestamptz not null default now()
);

create table kb_chunks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  document_id uuid not null references kb_documents(id) on delete cascade,
  content text not null,
  embedding vector(1024)                          -- set dimension to the chosen embeddings model
);

-- Booking
create table services (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  duration_min int not null,
  price_min int, price_max int,
  resource_type text not null,
  active boolean not null default true
);

create table resources (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  type text not null,                             -- staff, stylist, table, room, technician
  name text not null,
  user_id uuid,
  google_calendar_id text,
  working_hours jsonb not null default '{}',
  service_area jsonb,                             -- pincodes for field visits
  active boolean not null default true
);

create table bookings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  lead_id uuid not null references leads(id) on delete cascade,
  resource_id uuid not null references resources(id),
  service_id uuid references services(id),
  start_at timestamptz not null,
  end_at timestamptz not null,
  status text not null check (status in
    ('held','confirmed','rescheduled','cancelled','completed','no_show')),
  hold_expires_at timestamptz,
  calendar_event_id text,
  created_at timestamptz not null default now(),
  exclude using gist (resource_id with =, tstzrange(start_at, end_at) with &&)
    where (status in ('held','confirmed'))      -- database blocks double booking
);

-- Plans, features, credits
create table plans (
  key text primary key,                           -- trial, starter, growth, pro
  name text not null,
  price_inr int not null,
  monthly_credits int not null,
  seats int not null,
  whatsapp_numbers int not null,
  feature_keys text[] not null,
  razorpay_plan_id text
);

create table features (
  key text primary key,                           -- reminder_24h, feedback_request, ...
  name text not null,
  description text not null,
  default_on boolean not null,
  credit_cost int not null default 0
);

create table tenant_features (
  tenant_id uuid not null references tenants(id) on delete cascade,
  feature_key text not null references features(key),
  enabled boolean not null,
  settings jsonb not null default '{}',           -- e.g. reminder offset in minutes
  primary key (tenant_id, feature_key)
);

create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  plan_key text not null references plans(key),
  razorpay_subscription_id text unique,
  status text not null,
  current_period_start timestamptz,
  current_period_end timestamptz
);

create table credit_ledger (
  id bigserial primary key,
  tenant_id uuid not null references tenants(id) on delete cascade,
  delta int not null,                             -- +grant / -spend
  reason text not null,                           -- plan_grant, topup, trial_grant, ai_reply,
                                                  -- template_utility, template_marketing, staff_alert, cycle_reset, admin
  ref_id uuid,                                    -- message, booking or payment id
  expires_at timestamptz,                         -- for top-ups
  created_at timestamptz not null default now()
);

-- Handoff, demo routing, audit
create table handoffs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  trigger text not null,
  priority text not null,
  takeover_mode text check (takeover_mode in ('inbox','own_number')),
  assigned_user_id uuid,
  picked_at timestamptz, resolved_at timestamptz,
  outcome text
);

create table route_codes (
  code text primary key,                          -- DEMO-REALESTATE, TRIAL-7F3K
  kind text not null check (kind in ('demo','trial')),
  tenant_id uuid references tenants(id) on delete cascade,
  expires_at timestamptz
);

create table audit_logs (
  id bigserial primary key,
  tenant_id uuid,
  actor text not null,                            -- user id, 'ai', 'system', 'admin:<id>'
  action text not null,
  entity text, entity_id uuid,
  diff jsonb,
  created_at timestamptz not null default now()
);

-- Row-level security pattern (repeat for every tenant table)
create function is_member(t uuid) returns boolean
  language sql stable security definer as $$
  select exists (select 1 from memberships where tenant_id = t and user_id = auth.uid())
$$;

alter table leads enable row level security;
create policy tenant_isolation on leads
  using (is_member(tenant_id)) with check (is_member(tenant_id));
```

**Credit spending must be atomic.** Dev 2 writes a Postgres function `spend_credits(tenant_id, amount, reason, ref_id)` that locks the tenant row, checks the balance (sum of `delta`, ignoring expired top-ups) and inserts the negative row in one transaction. It returns `false` instead of going below zero. Nothing else writes to `credit_ledger` directly.

**Plan renewal and rollover:** on each Razorpay renewal, expire any credits left from the cycle before last (`cycle_reset`), then insert `plan_grant` for the new month with `expires_at` = end of the *next* cycle, so unused plan credits roll over for exactly one month. Top-ups are separate rows with `expires_at` = purchase + 90 days. `spend_credits` always spends the soonest-expiring credits first.

## Message pipeline

Every inbound WhatsApp message goes through the same eight steps inside one Inngest function, `process-message`, so behaviour is predictable and each step is testable on its own.

> The PDF embeds an interactive diagram here ("message pipeline · 8 steps, 3 exits — see the interactive diagram in the online version") that does not survive export. Steps named elsewhere in this document: **step 4** extraction (LLM), **step 5** decide (plain code), **step 7** reply (LLM). Dev 1 to copy the full eight steps and three exits here from the online version.

- The webhook only verifies the Meta signature, finds the tenant from `phone_number_id` in `whatsapp_connections`, dedupes on `provider_msg_id`, stores the message and emits `whatsapp/message.received`; it returns 200 within a second so Meta never retries.
- Inngest runs one conversation at a time (concurrency key = `conversation_id`), so two quick messages from the same customer are processed in order. If a customer sends several messages within 3 seconds, process them together.
- Every step is an Inngest `step.run`, so a failure (LLM timeout, Meta API error) retries that step only and never sends a reply twice.
- Steps 4 and 7 are the only LLM calls. Every call is traced in Langfuse with the tenant id, the model, the prompt version, the tokens and an estimated cost. By design (DPDP: a customer's words carry names, numbers and addresses) a trace carries **no message text** unless `LANGFUSE_CAPTURE_TEXT=true`, and then phone numbers and emails are masked and each text is cut to 2,000 characters (`backend/src/agent/llm/tracing.ts`).

## Module specs

Each module below lists its contract (what other modules can call) and the rules it must enforce; owners design the internals.

### 1. WhatsApp adapter — Dev 1

```ts
export interface InboundMessage {
  tenantId: string; channelId: string;
  providerMsgId: string;
  from: string;                 // E.164, e.g. +9198xxxxxx21
  contactName?: string;
  type: 'text' | 'interactive' | 'image' | 'audio' | 'location' | 'document';
  text?: string; buttonId?: string;
  media?: { id: string; mime: string };
  timestamp: string;
  routeCode?: string;           // DEMO-/TRIAL- code on the shared number
}

export interface ChannelAdapter {
  verifySignature(req: Request): Promise<boolean>;
  parseWebhook(body: unknown): { messages: InboundMessage[]; statuses: StatusUpdate[] };
  sendText(to: string, text: string): Promise<SendResult>;
  sendButtons(to: string, body: string, buttons: { id: string; title: string }[]): Promise<SendResult>; // max 3
  sendList(to: string, body: string, rows: { id: string; title: string; description?: string }[]): Promise<SendResult>; // max 10 rows
  sendTemplate(to: string, name: string, lang: string, params: string[]): Promise<SendResult>;
  markRead(providerMsgId: string): Promise<void>;
}
```

- Free-form messages are allowed only within 24 hours of `last_customer_msg_at`; outside it the adapter throws `OutsideWindowError` unless a template is used.
- Delivery statuses (sent, delivered, read, failed) update `messages.delivery_status`.
- Images and documents are downloaded to Supabase Storage and linked to the lead (useful for plumber and interior photos).
- Voice notes in v1: reply politely asking the customer to type; transcription comes later.
- The adapter calls Meta's Graph API directly with the tenant's token from `whatsapp_connections` (decrypted per call, never logged). Because the provider sits behind this interface, adding a BSP or another channel later only touches this folder.

### 2. Orchestrator and LLM contract — Dev 1

**Step 4: extraction output** (fast model, JSON only, validated with Zod; on failure retry once, then fall back to "ask a clarifying question")

```ts
export const Extraction = z.object({
  language: z.enum(['en', 'ta', 'ta-en', 'ml', 'hi', 'other']),
  intent: z.enum(['greeting', 'question', 'give_details', 'book', 'reschedule', 'cancel',
                  'talk_to_human', 'complaint', 'price_negotiation', 'off_topic', 'opt_out']),
  fields: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])), // only keys from the pack's field schema
  question: z.string().nullable(),
  preferredTime: z.string().nullable(),
  sentiment: z.enum(['positive', 'neutral', 'negative', 'angry']),
  asksIfHuman: z.boolean(),
  confidence: z.number().min(0).max(1),
});
```

**Step 5: decide** (plain code) returns exactly one action:

```ts
type NextAction =
  | { kind: 'answer_and_ask'; question: string; askFields: string[] }   // max 2 fields
  | { kind: 'ask_fields'; askFields: string[] }
  | { kind: 'offer_slots'; serviceId: string; window?: string }
  | { kind: 'confirm_booking'; slotId: string }
  | { kind: 'reschedule' | 'cancel'; bookingId: string }
  | { kind: 'handoff'; trigger: HandoffTrigger }
  | { kind: 'decline_off_topic' }
  | { kind: 'close_disqualified'; reason: string }
  | { kind: 'opt_out_ack' };
```

Decision order: opt-out → handoff triggers (asked for human, complaint, negotiation, hot lead, knowledge gap twice, stuck) → off-topic → booking intents → answer the question and ask the next missing field → when required fields are filled and the score passes the pack threshold, offer slots.

**Step 7: reply input** (strong model): persona name, business name, tone, customer language, the action with its data (KB snippets, slot options, field labels to ask), last 10 messages, and these fixed rules:

- You are the business's assistant. Never claim to be human; if asked, say you are the virtual assistant and offer a team member.
- Only discuss this business's services; politely decline anything else.
- Use only the facts given. Never invent prices, availability, offers or policies.
- At most two questions per message; reply in the customer's language and script; keep it under 600 characters.

**Post-check before sending:** every ₹ amount, date and time in the reply must appear in the facts passed in; if not, regenerate once, then send a safe fallback ("Let me confirm that with the team").

### 3. Vertical pack format — Dev 1 builds the loader, Raja writes the content

```json
{
  "key": "real-estate",
  "version": 1,
  "bookingType": "site_visit",
  "fields": [
    { "key": "budget", "label": "Budget", "type": "range_inr", "required": true },
    { "key": "location", "label": "Preferred area", "type": "text", "required": true },
    { "key": "config", "label": "BHK / type", "type": "enum", "options": ["1BHK", "2BHK", "3BHK", "Villa", "Plot"] },
    { "key": "timeline", "label": "When are you planning to buy?", "type": "enum", "options": ["0-3m", "3-6m", "6m+"], "required": true },
    { "key": "funding", "label": "Loan or own funds", "type": "enum", "options": ["loan_approved", "loan_needed", "own_funds"] }
  ],
  "scoring": {
    "rules": [
      { "field": "budget", "match": "within_project_band", "points": 30 },
      { "field": "timeline", "equals": "0-3m", "points": 25 },
      { "field": "location", "match": "in_project_areas", "points": 20 },
      { "field": "funding", "in": ["loan_approved", "own_funds"], "points": 15 },
      { "field": "decision_maker", "equals": true, "points": 10 }
    ],
    "thresholds": { "hot": 70, "warm": 40 },
    "hardFails": [{ "field": "budget", "below": "min_project_price" }]
  },
  "handoffTriggers": ["asked_human", "complaint", "negotiation", "hot_lead", "kb_gap", "stuck"],
  "templates": ["booking_confirmed_v1", "reminder_24h_v1", "reminder_2h_v1", "feedback_v1", "review_v1", "nudge_v1", "staff_alert_v1"],
  "kbStarter": ["Projects and locations", "Price bands", "Amenities", "Loan partners", "Site visit timings"],
  "extraGuardrails": []
}
```

The loader validates every pack with Zod at startup and stores it in `vertical_packs`. Tenants can override weights, thresholds and labels in agent settings; the override is merged over the pack at runtime.

### 4. Booking and slot engine — Dev 2

```ts
findSlots(tenantId, { serviceId, resourceType, from, to, pincode? }): Promise<Slot[]>   // returns up to 3, spread across the window
holdSlot(tenantId, slot, leadId): Promise<Booking>       // status 'held', hold_expires_at = now + 10 min
confirmBooking(tenantId, bookingId): Promise<Booking>    // 'confirmed', creates Google event, emits booking.confirmed
rescheduleBooking(tenantId, bookingId, newSlot): Promise<Booking>
cancelBooking(tenantId, bookingId, reason): Promise<void>
```

- Slots respect working hours, service duration, buffer between bookings, minimum lead time, existing bookings and Google free/busy.
- Field visits (plumber, electrician, interiors) check the pincode against the resource's service area.
- Double booking is blocked by the database exclusion constraint, not only by code. An expired hold is released by a cron job every minute.
- Store all times in UTC; show and parse in the tenant's timezone (Asia/Kolkata by default). "Tomorrow evening" must resolve against the tenant's local date.
- Without a connected calendar, the internal `bookings` table is the source of truth.

### 5. Notifications and background jobs — Dev 2

Every outbound message, AI or system, goes through one function:

```ts
notify.send(tenantId, kind: NotificationKind, payload): Promise<SendOutcome>
// 1. feature flag on?  2. free-form if inside 24 h, else template  3. spend_credits  4. adapter send  5. log message + audit
```

| Inngest function | Trigger | What it does |
|---|---|---|
| `process-message` | `whatsapp/message.received` | The 8-step pipeline |
| `booking-reminders` | `booking.confirmed` | Sleeps until 24 h and 2 h before; sends if the toggle is on and the booking is still confirmed; cancelled by `booking.changed` |
| `post-visit` | Booking end time + 2 h | Feedback request, then review link for ratings 4–5; outcome prompt to staff |
| `lead-nudges` | Lead engaged, then silent | Nudge after 2 h and 24 h, then move to nurture |
| `release-holds` | Cron, every minute | Frees expired held slots |
| `daily-agenda` | Cron, 8 am tenant time | Day's bookings to the owner |
| `handoff-sla` | `handoff.opened` | Escalates to the owner if not picked up within the SLA |
| `own-number-outcome` | `handoff.own_number` | Asks the staff member for the outcome after 4 h |
| `trial-lifecycle` | `tenant.trial_started` | Day 0, 3, 5, 6, 7 messages; pauses the tenant at the end |
| `credit-alerts` | `credits.spent` | Owner alerts at 80% and 100% of plan credits; auto top-up if on |

Template names are versioned (`reminder_24h_v1`) with English and Tamil versions; a template change means a new version submitted to Meta, never an edit in place.

### 6. Handoff and lead card — Dev 1 (logic), Dev 3 (UI)

- `buildLeadCard(leadId)` returns contact, need, qualifying answers, score, booking status, trigger, sentiment, a 2–3 line AI summary with a suggested next step, and links.
- The staff alert template has two URL buttons pointing at our server: `/h/{token}?mode=inbox` and `/h/{token}?mode=own`. The token is signed, tied to the staff member and the handoff, and expires in 24 hours.
- **Inbox mode:** sets `conversations.mode = 'human'`, assigns the staff member, opens the conversation in the dashboard with the lead card pinned.
- **Own-number mode:** sets mode to `'external'`, sends the customer "{staff} from our team will WhatsApp you from {number}", then redirects the staff member to `https://wa.me/{customer}?text={greeting}` with the greeting pre-filled.
- "Return to AI" in the inbox sets mode back to `'ai'` and adds a system note summarising what staff said.

### 7. Feature flags and credits — Dev 2

```ts
isEnabled(tenantId, featureKey): Promise<boolean>  // plan includes key AND tenant toggle on (default_on if unset); cached 60 s
spendCredits(tenantId, amount, reason, refId): Promise<boolean>  // calls the spend_credits SQL function
getBalance(tenantId): Promise<{ plan: number; topup: number; total: number }>
```

- Feature keys for v1: `ai_auto_reply`, `working_hours_mode`, `lead_qualification`, `booking`, `booking_confirmation`, `reminder_24h`, `reminder_2h`, `staff_alerts`, `handoff_triggers`, `auto_topup`, `daily_agenda`, `followup_nudges`, `noshow_rebooking`, `feedback_request`, `review_request`, `outbound_webhooks`.
- Credit costs: AI reply 1, automated utility template 1, automated marketing template 1; staff alerts, lead cards, daily agenda and staff replies 0. Meta's own fees are billed by Meta to the tenant's WhatsApp account and never touch our ledger. Costs live in one constants file mirrored in `features.credit_cost`.

### 8. Billing, trial and demo number — Dev 2 (backend), Dev 3 (UI)

- Plans are created in the Razorpay dashboard and mapped through `plans.razorpay_plan_id`. Checkout uses Razorpay Subscriptions; top-ups use Razorpay Orders.
- Webhooks handled (signature verified, idempotent): subscription activated, charged (grant credits), halted or cancelled (pause tenant), and payment captured for top-up orders.
- Signup creates the tenant with `status = 'trial'`, `trial_ends_at = now + 7 days`, `plan_key = 'trial'` (Growth features), a 300-credit `trial_grant`, and a `TRIAL-xxxx` route code.
- **Demo number:** an inbound message on the demo `phone_number_id` is routed by the route code in the customer's first message; demo tenants (one per pack) are seeded. With no code, the agent shows an industry menu. Limit: 30 messages per phone per day.
- Plan limits (seats, numbers) are enforced in the API, not only hidden in the UI.

Plans seed (`supabase/seed/plans.sql`; Razorpay plan ids are filled in after Raja creates the plans):

```sql
insert into plans (key, name, price_inr, monthly_credits, seats, whatsapp_numbers, feature_keys) values
('starter','Starter', 2499,  1500, 2,   1, array['ai_auto_reply','working_hours_mode','lead_qualification','booking','booking_confirmation','reminder_24h','reminder_2h','staff_alerts','handoff_triggers','auto_topup','quote_auto_send','quote_followup','pretrip_info']),
('growth', 'Growth',  5999,  5000, 5,   1, array['ai_auto_reply','working_hours_mode','lead_qualification','booking','booking_confirmation','reminder_24h','reminder_2h','staff_alerts','handoff_triggers','auto_topup','quote_auto_send','quote_followup','pretrip_info','handoff_own_number','daily_agenda','followup_nudges','noshow_rebooking','feedback_request','review_request']),
('pro',    'Pro',    12999, 15000, 999, 3, array['ai_auto_reply','working_hours_mode','lead_qualification','booking','booking_confirmation','reminder_24h','reminder_2h','staff_alerts','handoff_triggers','auto_topup','quote_auto_send','quote_followup','pretrip_info','handoff_own_number','daily_agenda','followup_nudges','noshow_rebooking','feedback_request','review_request','outbound_webhooks','custom_scoring']),
('trial',  'Trial',      0,   300, 2,   1, array['ai_auto_reply','working_hours_mode','lead_qualification','booking','booking_confirmation','reminder_24h','reminder_2h','staff_alerts','handoff_triggers','quote_auto_send','quote_followup','pretrip_info','handoff_own_number','daily_agenda','followup_nudges','noshow_rebooking','feedback_request','review_request']);
-- seats 999 = unlimited in the UI
```

- New feature keys to add as rows in `features`: `handoff_own_number` and `custom_scoring`.
- Annual billing is a separate Razorpay plan per tier at 10× the monthly price (2 months free).
- Top-ups: ₹1.20 a credit, sold as 1,000 credits for ₹1,199 through Razorpay Orders.
- The optional ₹4,999 setup fee is a one-time Razorpay Order with reason `setup_fee`; it grants no credits and flags the tenant for an assisted onboarding call in the admin panel.

### 9. Dashboard screens — Dev 3

| Screen | Must have |
|---|---|
| Signup and onboarding wizard | WhatsApp OTP login, business and industry, website/Google profile import, demo test link, Embedded Signup, staff, calendar or slots, toggles review |
| Home | Credit meter, trial countdown, month summary (enquiries, qualified, booked, after-hours handled) |
| Inbox | Realtime list and chat, AI/human switch, lead card panel, AI-suggested reply, templates outside 24 h |
| Leads | Kanban by stage, filters by score and source, lead detail with fields and timeline |
| Calendar | Day/week per resource, reschedule, cancel, mark visited or no-show |
| Knowledge base | Services and prices, FAQs, document upload, "questions the AI couldn't answer" list |
| Feature toggles | Rendered from `features` + `plans`; locked items show Upgrade; estimated credits per month |
| Agent settings | Persona name, tone, languages, scoring overrides, handoff triggers, takeover default, business hours |
| Team | Invite staff, roles, alert preferences, takeover preference |
| Billing | Plan, upgrade/downgrade, top-ups, credit history, invoices |
| Admin (internal) | All tenants with status and credits, extend trial, grant credits, edit plans and features, open a tenant's dashboard (logged) |

### 10. WhatsApp connection and client onboarding — Dev 1 (backend), Dev 3 (UI)

Every client number lives in one `whatsapp_connections` row, however it was connected. The webhook and the adapter only ever read from that table, so the rest of the product never knows which path was used.

| Path (`method`) | Who starts it | Flow |
|---|---|---|
| `embedded_signup` | The client, in the onboarding wizard | Meta popup → code → our server exchanges and sets up the number |
| `assisted` | An admin, for clients Raja onboards personally | Admin creates a one-time link `/connect/:token` (valid 24 h) and sends it on the call; the client opens it on their own device and completes the same popup while the admin watches the status live |
| `manual_byo` | An admin, for clients or agencies with their own Meta app | Admin enters account id, phone number id, system-user token and app secret; the client points their app's webhook at our URL |

**Build order:** `manual_byo` and the validation checks first (no Meta approval needed, unblocks beta), then `embedded_signup` and `assisted` as soon as App Review approves the configuration.

Migration `0003_whatsapp_connections_and_consent.sql`:

```sql
create table whatsapp_connections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  channel_id uuid not null references channels(id) on delete cascade,
  method text not null check (method in ('embedded_signup','assisted','manual_byo')),
  waba_id text not null,
  phone_number_id text not null unique,
  display_phone text,
  verified_name text,
  client_business_id text,                  -- client's own Business Portfolio id
  token_enc text not null,                  -- AES-256-GCM with ENCRYPTION_KEY
  token_type text not null check (token_type in ('business','system_user')),
  token_expires_at timestamptz,             -- null when the token does not expire
  app_secret_enc text,                      -- manual_byo only: their app secret, for webhook signatures
  coexistence boolean not null default false,
  status text not null default 'pending'
    check (status in ('pending','validating','active','failed','disconnected')),
  last_check jsonb not null default '{}',   -- result of each validation check
  quality_rating text,
  messaging_limit text,
  connected_by text not null,               -- user id or 'admin:<id>'
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table connect_links (
  token text primary key,                   -- random 32 bytes, url-safe
  tenant_id uuid not null references tenants(id) on delete cascade,
  created_by uuid not null,
  expires_at timestamptz not null,
  used_at timestamptz
);

create table consent_logs (
  id bigserial primary key,
  tenant_id uuid not null references tenants(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  event text not null check (event in
    ('notice_shown','opted_in','opted_out','deletion_requested','deleted')),
  source text not null,                     -- first_message, stop_keyword, dashboard, admin
  message_id uuid,
  created_at timestamptz not null default now()
);

-- Tokens never reach the browser: the dashboard reads a view without secret columns
revoke all on whatsapp_connections from anon, authenticated;
revoke all on connect_links from anon, authenticated;

create view whatsapp_connections_public as
  select id, tenant_id, method, waba_id, phone_number_id, display_phone, verified_name,
         coexistence, status, last_check, quality_rating, messaging_limit, created_at
  from whatsapp_connections where is_member(tenant_id);
grant select on whatsapp_connections_public to authenticated;

alter table consent_logs enable row level security;
create policy tenant_isolation on consent_logs
  using (is_member(tenant_id)) with check (is_member(tenant_id));
```

For WhatsApp, `channels` keeps only the generic row; all credentials live in `whatsapp_connections`. (Repo note: migration 0003 drops `channels.credentials_enc`, so secrets have one home. Future channel types get their own `*_connections` table.)

#### Embedded Signup flow (also used by assisted)

1. The wizard loads the Facebook JS SDK and calls `FB.login` with `config_id = NEXT_PUBLIC_META_ES_CONFIG_ID`, `response_type: 'code'`, `override_default_response_type: true`. A "Keep using my WhatsApp Business App" choice switches the configuration to coexistence onboarding.
2. A message listener on facebook.com origins reads the `WA_EMBEDDED_SIGNUP` event: on finish it gives `waba_id` and `phone_number_id`; on cancel it gives the step where the client stopped, which we log and show to the admin.
3. The browser posts `{ code, wabaId, phoneNumberId, coexistence }` to `POST /api/onboarding/whatsapp/embedded-signup`.
4. The server exchanges the code for a business token with our app id and secret, then subscribes our app to the client's account (`POST /{waba_id}/subscribed_apps`).
5. For non-coexistence numbers, it registers the number for the Cloud API (`POST /{phone_number_id}/register` with `WHATSAPP_REGISTER_PIN`).
6. It reads the number's display phone, verified name, quality rating and messaging limit, runs the validation checks below, sets `status`, and emits `whatsapp/connected`.
7. `whatsapp/connected` submits the pack's templates in English and Tamil to the client's account and seeds the template status table.

Check each Graph API call and field name against Meta's current documentation for the pinned version before building; Meta changes these flows often.

**Validation checks** (every path, before `active`; results stored in `last_check`):

- Token is valid and carries `whatsapp_business_management` and `whatsapp_business_messaging` for this account.
- The phone number belongs to the account and is registered for the Cloud API.
- Our app is subscribed to the account's webhooks (for `manual_byo`: a signed test webhook arrived at our URL).
- Display name is approved.
- A payment method is on the account; if not, connect anyway but warn that templates won't send.
- A test message to the owner's number is delivered.

**Webhooks.** One endpoint, `POST /api/webhooks/whatsapp` (public URL `https://api.pakkaagent.in/webhooks/whatsapp` via a Vercel rewrite). Verify the signature with our app secret, or with the connection's `app_secret_enc` for `manual_byo` (look the connection up from the account id in the payload first). Handle message, status, template-status, quality and account-update events. For coexistence numbers, messages the owner sends from the phone app arrive as echo events: store them as `sender = 'staff'` and switch the conversation to human mode so the agent never talks over the owner.

**Endpoints added**

| Method and path | Caller | Purpose |
|---|---|---|
| `POST /api/admin/whatsapp/connect-link` | Admin | Create a one-time assisted connect link for a tenant |
| `GET /connect/:token` | Client | Page that runs the Meta popup for an assisted onboarding |
| `POST /api/admin/whatsapp/manual` | Admin | Save a `manual_byo` connection and run the checks |
| `POST /api/whatsapp/connections/:id/recheck` | Dashboard, admin | Run the validation checks again |
| `POST /api/whatsapp/connections/:id/disconnect` | Owner, admin | Unsubscribe, mark disconnected, pause the AI |

**Jobs:** `connection-health` (daily cron) re-checks the token, quality rating and messaging limit for every active connection and alerts the owner and admin on failure; `token-expiry` warns 7 days before any `token_expires_at`.

**Consent (DPDP).** The first AI reply to a new contact carries a one-line notice with a privacy link (logged as `notice_shown`). STOP or an equivalent in Tamil or Hindi sets `contacts.opted_out_at`, logs `opted_out`, and blocks every template except a final confirmation. Deletion requests from the dashboard remove the contact's messages and lead data and log `deleted`.

**UI (Dev 3).** Wizard step "Connect WhatsApp" with two buttons, "Connect with Facebook" and "Book a setup call", plus a live status panel showing each check. Admin panel: connection list with method, status and last check; the connect-link generator; the manual form; a flag for tenants who paid the setup fee.

## Vertical pack system

A new industry is a pack file plus test conversations, never a code fork. The core engine knows about capabilities (booking modes, catalogs, quotes, reminders); a pack only chooses and configures them.

| Lives in the core (code) | Lives in the pack (`packs/*.json`) |
|---|---|
| Message pipeline, extract → decide → reply loop | Lead fields, their labels and ask order |
| Booking modes: slot, site_visit, field_visit, callback, date_range, quote | Which booking modes the industry uses |
| Catalog engine (items, media, price-from, filters) | Catalog type and item attributes |
| Quote builder and quote follow-ups | Scoring rules, thresholds, hard fails |
| Reminder scheduler with event-relative offsets | Reminder and feedback offsets per event |
| Handoff, credits, feature flags, billing | Handoff triggers, template set, KB starter topics, persona tone, extra guardrails |

**Four rules that stop the app collapsing when industries are added** (reviewers reject any PR that breaks one):

1. **No industry names in code.** `if (vertical === 'salon')` is forbidden; branch on capabilities (`pack.bookingModes.includes('date_range')`).
2. **No industry columns in tables.** Industry answers go in `leads.fields` (jsonb), validated against the pack's field schema with Zod generated from the pack.
3. **Booking is generic.** Every booking has a `kind`; slot logic runs only for slot kinds, and `resource_id` is optional for kinds that block no staff calendar.
4. **Reminders are relative to an event anchor** (start, end, quote_sent), never hardcoded "1 hour before".

**Versioning.** `vertical_packs` holds every version of a pack. Each tenant is pinned to `vertical_version`; editing a pack creates version N+1 and never changes live tenants. Moving tenants up is a deliberate script (`pnpm packs:migrate <key> <from> <to>`) that maps old field keys to new ones.

**Tenant overrides.** A business can add fields, hide optional fields, rename labels and change reminder offsets in `tenants.pack_overrides`. The loader merges pack + overrides at runtime; overrides cannot remove required fields or change scoring hard fails.

Migration `0002_packs_and_bookings.sql`:

```sql
-- Pack versions: one row per (key, version)
alter table vertical_packs drop constraint vertical_packs_pkey;
alter table vertical_packs add primary key (key, version);

alter table tenants
  add column vertical_version int not null default 1,
  add column pack_overrides jsonb not null default '{}';

-- Generic bookings
alter table bookings
  add column kind text not null default 'slot'
    check (kind in ('slot','site_visit','field_visit','callback','date_range','reservation')),
  add column details jsonb not null default '{}',   -- pax, pickup point, package id
  alter column resource_id drop not null;
-- the exclusion constraint already ignores rows with null resource_id

-- Catalog: packages, properties, portfolio items, rooms, menus
create table catalog_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  type text not null,                               -- package, property, portfolio, room, menu_item
  title text not null,
  summary text,
  attributes jsonb not null default '{}',           -- per pack: nights, destination, inclusions
  price_from int,
  price_unit text,                                  -- per_person, per_night, total
  media jsonb not null default '[]',                -- images, PDF brochure urls
  seasonal_prices jsonb,                            -- [{ from, to, price_from }]
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Quotes
create table quotes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  lead_id uuid not null references leads(id) on delete cascade,
  catalog_item_id uuid references catalog_items(id),
  line_items jsonb not null,                        -- [{ label, qty, unit_price }]
  total_inr int not null,
  status text not null default 'draft'
    check (status in ('draft','sent','accepted','revised','expired','declined')),
  valid_until date,
  approved_by uuid,                                 -- staff who approved; null = auto
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

alter table catalog_items enable row level security;
create policy tenant_isolation on catalog_items
  using (is_member(tenant_id)) with check (is_member(tenant_id));
alter table quotes enable row level security;
create policy tenant_isolation on quotes
  using (is_member(tenant_id)) with check (is_member(tenant_id));
```

## Tours & Travel pack

Travel is the first vertical that sells through a quote, not a time slot, so it adds four generic capabilities to the core that hotels, real estate and interiors reuse later. YatraKraft is the pilot tenant.

**Conversation flow the agent must handle**

1. Greet as the agency's assistant and ask where and when they want to travel.
2. Collect destination, dates (exact range or month), adults, children, trip type and budget; pickup city and hotel category if offered naturally.
3. Search `catalog_items` (type `package`) by destination, nights, budget and season; share the top 2–3 with image or brochure PDF.
4. Customer picks one → agent builds a draft quote from the package's seasonal price × pax. If the tenant toggle `quote_auto_send` is on and the quote is inside the package's standard price, send it; otherwise hand off to staff for approval.
5. Customer wants changes, a custom itinerary or a group above the pack limit → handoff with the lead card.
6. Customer prefers to talk → book a callback with an agent.
7. Quote accepted → staff mark the trip confirmed in the dashboard; a `date_range` booking is created from trip start to end.
8. Pre-trip messages at −2 days and −1 day; feedback and review request the day after the trip ends.

The agent never confirms availability of hotels, flights or trains, never collects payment details in chat, and never quotes a price that is not in the catalog or an approved quote.

Pack file `packs/tours-travel.json`:

```json
{
  "key": "tours-travel",
  "version": 1,
  "label": "Tours & Travel",
  "bookingModes": ["quote", "callback", "date_range"],
  "catalog": {
    "type": "package",
    "attributes": ["destination", "nights", "inclusions", "exclusions", "hotel_category", "best_season"],
    "matchOn": ["destination", "nights", "budget_per_person", "travel_dates"]
  },
  "fields": [
    { "key": "destination", "label": "Where would you like to go?", "type": "text", "required": true },
    { "key": "travel_dates", "label": "Travel dates", "type": "date_range_or_month", "required": true },
    { "key": "adults", "label": "Adults", "type": "int", "required": true },
    { "key": "children", "label": "Children (with ages)", "type": "text" },
    { "key": "trip_type", "label": "Trip type", "type": "enum", "options": ["family", "honeymoon", "friends", "corporate", "solo", "pilgrimage"] },
    { "key": "budget_per_person", "label": "Budget per person", "type": "range_inr" },
    { "key": "pickup_city", "label": "Starting from", "type": "text" },
    { "key": "hotel_category", "label": "Stay preference", "type": "enum", "options": ["budget", "3-star", "4-star", "5-star", "homestay", "resort"] }
  ],
  "scoring": {
    "rules": [
      { "field": "travel_dates", "match": "starts_within_days", "value": 45, "points": 30 },
      { "field": "budget_per_person", "match": "within_catalog_band", "points": 25 },
      { "field": "adults", "gte": 4, "points": 15 },
      { "field": "trip_type", "in": ["honeymoon", "corporate"], "points": 15 },
      { "field": "destination", "match": "in_catalog_destinations", "points": 15 }
    ],
    "thresholds": { "hot": 70, "warm": 40 },
    "hardFails": [{ "field": "travel_dates", "match": "in_past" }]
  },
  "reminders": [
    { "event": "callback", "anchor": "start", "offset": "-30m", "template": "callback_reminder_v1" },
    { "event": "quote", "anchor": "quote_sent", "offset": "+2d", "template": "quote_followup_v1", "feature": "quote_followup" },
    { "event": "trip", "anchor": "start", "offset": "-2d", "template": "trip_prep_v1", "feature": "pretrip_info" },
    { "event": "trip", "anchor": "start", "offset": "-1d", "template": "trip_pickup_v1", "feature": "pretrip_info" }
  ],
  "feedback": { "event": "trip", "anchor": "end", "offset": "+1d", "template": "feedback_v1" },
  "handoffTriggers": ["asked_human", "complaint", "custom_itinerary", "group_above_15", "payment_question", "visa_question", "hot_lead", "kb_gap", "stuck"],
  "templates": ["quote_sent_v1", "quote_followup_v1", "callback_reminder_v1", "trip_confirmed_v1", "trip_prep_v1", "trip_pickup_v1", "feedback_v1", "review_v1", "nudge_v1", "staff_alert_v1"],
  "kbStarter": ["Destinations and packages", "Best season per destination", "Inclusions and exclusions", "Cancellation and refund policy", "Advance payment terms", "Pickup points"],
  "extraGuardrails": ["never_confirm_third_party_availability", "no_unlisted_prices", "no_payment_details_in_chat"]
}
```

**New core capabilities travel needs** (built generic, owned by module)

| Capability | What it does | Module owner | Reused later by |
|---|---|---|---|
| Catalog engine | CRUD for `catalog_items`, dashboard editor with media upload, `searchCatalog(tenantId, filters)` used by the decide step | Booking/Dashboard dev | Real estate projects, interiors portfolio, hotel rooms |
| Quote builder | `buildQuote(lead, item)` from seasonal price × pax, staff approval queue, PDF render, `quote_sent` event | Orchestrator dev | Interiors estimates, event venues |
| `date_range` and `callback` bookings | Multi-day bookings with no resource; callbacks use the existing slot engine on the staff resource | Booking dev | Hotels, rentals |
| Event-relative reminders | Scheduler reads `reminders[]` from the pack and schedules Inngest jobs on anchor events; cancels jobs when the booking or quote changes | Notifications dev | Every vertical |

**New feature toggles** (rows in `features`): `quote_auto_send` (default off), `quote_followup` (default on), `pretrip_info` (default on). Existing `feedback_request` and `review_request` apply unchanged.

**Credits.** No new pricing rules: quote messages and trip reminders are automated outbound messages and spend credits like any other; staff replies stay free.

**Templates.** The ten templates above ship as drafts in English and Tamil; onboarding submits them to Meta on the tenant's own WhatsApp account. Trip reminders and quote follow-ups fall outside the 24-hour window, so they must be approved utility templates.

**Test conversations** (`tests/conversations/tours-travel/`, minimum 20): month-only dates ("sometime in December"), unknown destination not in catalog, budget below every package, honeymoon couple asking for upgrades, group of 25, Tamil–English mixed messages, past dates, haggling on a sent quote, visa question, cancellation-policy question, prompt injection asking for a discount.

### Adding any future industry

Every new vertical (clinics, gyms, coaching centres, event venues) follows the same checklist. If step 2 finds no missing capability, the vertical ships with zero core code changes.

- [ ] Write `packs/<key>.json`: fields, booking modes, catalog type, scoring, reminders, feedback, handoff triggers, templates, KB starter, extra guardrails.
- [ ] Capability check: list every behaviour the industry needs and mark which the core already has. Anything missing is built as a generic capability with its own spec and PR, named without the industry.
- [ ] Add any new feature toggles as rows in `features`, with defaults and credit cost.
- [ ] Draft WhatsApp templates in English and Tamil; Raja reviews wording.
- [ ] Write at least 20 conversations in `tests/conversations/<key>/` covering happy path, missing info, off-topic, angry customer, haggling, Tamil–English mix and prompt injection; all pass in CI.
- [ ] Seed a demo tenant and a `DEMO-<KEY>` route code so sales demos work on day one.
- [ ] Add the vertical to the signup picker with `vertical_packs.active = true` only after one pilot business has run on it for a week.
- [ ] Update `CLAUDE.md` if a new capability added folders or commands.

**Changing an existing pack:** never edit a published version. Copy to version N+1, change it, run that pack's conversation tests, then migrate tenants with `pnpm packs:migrate`.

### M7 — Second vertical: Tours & Travel

**Exit:** YatraKraft runs on the travel pack for one week; a lead goes from first message to sent quote to confirmed trip with pre-trip and feedback messages delivered, and real-estate tests still pass unchanged.

- [ ] Migration `0002_packs_and_bookings.sql` applied; existing tenants pinned to version 1.
- [ ] Pack loader reads (key, version), merges `pack_overrides`, and generates the Zod field schema.
- [ ] Catalog engine and dashboard catalog editor with image and PDF upload.
- [ ] Quote builder, staff approval queue and quote PDF.
- [ ] `date_range` and `callback` booking kinds.
- [ ] Event-relative reminder scheduler replacing fixed reminder jobs.
- [ ] `packs/tours-travel.json`, ten templates submitted, 20 test conversations passing.
- [ ] YatraKraft onboarded with its packages entered in the catalog.

## API and webhook endpoints

Dashboard data reads go straight through the Supabase client under row-level security; the routes below are for actions that need server secrets, external services or multi-step logic.

| Method and path | Caller | Purpose | Owner |
|---|---|---|---|
| `POST /api/webhooks/whatsapp` | Meta | Inbound messages and delivery statuses | Dev 1 |
| `GET /api/webhooks/whatsapp` | Meta | Webhook verification challenge | Dev 1 |
| `POST /api/webhooks/razorpay` | Razorpay | Subscription and payment events | Dev 2 |
| `/api/inngest` | Inngest | Serves all background functions | Dev 2 |
| `POST /api/onboarding/whatsapp/embedded-signup` | Dashboard | Exchange the Embedded Signup code, subscribe and register the number, validate, save the connection (more connection endpoints in module 10) | Dev 3 |
| `POST /api/onboarding/import-site` | Dashboard | Crawl a website or Google profile into draft KB entries | Dev 1 |
| `POST /api/kb/documents` | Dashboard | Upload a document, chunk and embed it | Dev 1 |
| `GET /api/calendar/google/connect`, `/callback` | Dashboard | Google OAuth per resource | Dev 2 |
| `POST /api/conversations/:id/messages` | Dashboard | Staff reply (free-form or template) | Dev 3 |
| `POST /api/conversations/:id/mode` | Dashboard | Switch AI / human / return to AI | Dev 3 |
| `POST /api/conversations/:id/suggest` | Dashboard | AI-suggested reply for staff | Dev 1 |
| `GET /h/:token` | Staff from WhatsApp alert | Take over in inbox or own number | Dev 1 |
| `POST /api/bookings/:id/(reschedule \| cancel \| complete \| no-show)` | Dashboard | Booking actions; emits `booking.changed` | Dev 2 |
| `PATCH /api/features/:key` | Dashboard | Toggle a feature; checks plan; writes audit log | Dev 2 |
| `POST /api/billing/checkout`, `/topup`, `/change-plan` | Dashboard | Start Razorpay subscription, top-up order or plan change | Dev 2 |
| `POST /api/team/invite` | Dashboard | Invite staff; enforces seat limit | Dev 3 |
| `/api/admin/*` | Internal admin | Tenants, credits, trials, plans, features | Dev 3 |
| Outbound webhooks (Pro) | Our server → client URL | `lead.created`, `lead.qualified`, `booking.confirmed`, `booking.cancelled`, `handoff.opened`, signed with a per-tenant secret | Dev 2 |

Every route validates input with Zod, checks the caller's membership and role, and returns errors as `{ error: { code, message } }`.

## Build milestones

Work in this order; a milestone is done only when its exit test passes on staging, and the next one starts from there. All three developers work in parallel inside each milestone.

### M0 — Foundations

**Exit:** all three can run the app locally, log in, and see a message sent to the test number appear in the `messages` table.

- [ ] Dev 1: WhatsApp webhook (verify, parse, dedupe, store), adapter `sendText`, test number connected
- [ ] Dev 2: repo, CI (lint, typecheck, tests), Supabase projects (local, staging), migration `0001_init.sql` with RLS, Inngest set up
- [ ] Dev 3: Next.js shell, auth with WhatsApp/phone OTP, dashboard layout, "send message" and "create template" screens for Meta App Review
- [ ] All: `CLAUDE.md`, `.env.example`, shared Zod types, seed script with one demo tenant per pack

### M1 — The agent talks

**Exit:** a customer asks about a project on WhatsApp and gets a correct answer from the knowledge base, in English and Tamil, within 10 seconds.

- [ ] Dev 1: pipeline steps 1–4 and 7, extraction prompt, reply prompt, post-check, KB retrieval, real-estate pack loaded
- [ ] Dev 2: `notify.send`, `spendCredits` SQL function, `isEnabled`, credit costs
- [ ] Dev 3: inbox (realtime), conversation view, KB editor (services, prices, FAQs), website import screen
- [ ] Dev 1 + Dev 3: migration 0003, `manual_byo` connection with validation checks and the admin form, so beta clients can go live before App Review approves Embedded Signup

### M2 — It qualifies and books

**Exit:** a test customer is asked qualifying questions casually, gets a score, picks one of three slots, and the booking appears in Google Calendar and the dashboard.

- [ ] Dev 1: decide step (actions, scoring, decision order), slot offering as WhatsApp list, confirmation flow
- [ ] Dev 2: slot engine, holds, exclusion constraint, Google Calendar connect and sync, `release-holds` job
- [ ] Dev 3: leads board, lead detail, calendar view, services and resources settings

### M3 — It notifies and hands off

**Exit:** reminders arrive at 24 h and 2 h with working buttons; a "talk to a person" message sends staff the lead card, and both takeover options work.

- [ ] Dev 1: handoff triggers, `buildLeadCard`, `/h/:token` takeover, off-topic decline, conversation test suite running in CI
- [ ] Dev 2: all notification jobs (reminders, post-visit, nudges, daily agenda, SLA, own-number outcome), templates submitted
- [ ] Dev 3: lead card panel, AI/human switch, AI-suggested reply, team and alert preferences

### M4 — Businesses control it

**Exit:** a new business signs up, imports its website, connects its own number through Embedded Signup (or an admin connects it through an assisted link), sets toggles and goes live; a coexistence number keeps working in the WhatsApp Business App.

- [ ] Dev 1: interiors and salon packs, Tamil/Tanglish prompt tuning with Raja's test chats
- [ ] Dev 2: feature toggle API with plan checks, outbound webhooks, audit log everywhere
- [ ] Dev 3: onboarding wizard with Embedded Signup, feature toggles screen, agent settings, home dashboard

### M5 — It sells itself

**Exit:** a stranger tries the demo number, starts a trial, pays through Razorpay, receives credits, and the admin panel shows it all.

- [ ] Dev 1: demo-number routing by route code, demo menu
- [ ] Dev 2: plans, Razorpay subscriptions and top-ups, renewal credit grants, trial lifecycle, credit alerts and zero-credit fallback
- [ ] Dev 3: billing screens, trial countdown, upgrade prompts, admin panel, landing page with pricing and demo buttons

### M6 — Beta, then launch

**Exit:** beta businesses use it daily with no blocking bugs, and the launch checklist (terms, privacy policy, refund policy, monitoring alerts, backups) is complete.

- [ ] All: fix beta issues, review the "questions the AI couldn't answer" list weekly, tune packs, load-test the webhook

## Engineering conventions and definition of done

Small pull requests, one owner per area, and nothing merges to `main` without passing CI and one review.

**Git and reviews**

- Branches: `feat/<area>-<short-name>`, `fix/...`; squash-merge into `main`; `main` auto-deploys to staging, a tagged release deploys to production.
- Pull requests stay under about 400 changed lines; the reviewer named in the ownership table approves.
- Migrations are append-only (`0002_...sql`); never edit a merged migration.

**Code rules**

- TypeScript strict, no `any`; Zod at every boundary (webhooks, API input, LLM output, pack files).
- Every query includes `tenant_id`; a test checks that one tenant can't read another's rows.
- No secrets in code or logs; phone numbers masked in logs (`+9198xxxxxx21`).
- Every outbound message goes through `notify.send`; every credit change through `spend_credits`.
- Webhooks and jobs are idempotent: processing the same event twice changes nothing.
- Prompts live in `src/agent/prompts/` as versioned files, not inline strings.

**Definition of done for any task**

- [ ] Works on staging, not just locally
- [ ] Unit tests for logic; conversation tests updated if agent behaviour changed
- [ ] Typecheck, lint and tests green in CI
- [ ] RLS covers any new table
- [ ] Errors reach Sentry; LLM calls visible in Langfuse
- [ ] Audit log written for any action a business would want to trace
- [ ] `CLAUDE.md` or this document updated if a contract changed

**Conversation test suite.** `tests/conversations/<pack>/*.yaml` holds scripted chats with expected outcomes (fields extracted, action chosen, booking made, handoff fired, no invented price). At least 20 per pack covering: happy path, Tamil and Tanglish, off-topic, angry customer, price haggling, prompt injection ("ignore your instructions"), "are you a bot?", reschedule, cancel, out-of-area address. CI runs them on every change to prompts, packs or agent code.

## Working with Claude

All three developers use Claude Code in the same repo, so the project rules live in one `CLAUDE.md` at the root; everyone's Claude then follows the same contracts instead of inventing its own. The starting version is committed at the repo root.

**How to use it day to day**

- Put this handover document in the repo as `docs/handover.md` so Claude can read the specs.
- Ask Claude to plan before coding on anything that touches the schema, the pipeline or credits, and review the plan before it writes code.
- Give Claude the exact error, log line or failing test, not a description of it.
- Let Claude write the tests first for the decide step, scoring, slot engine and credit spending; these are pure logic and easy to test.
- Never let Claude change a contract (types, table, endpoint) silently: a contract change is a PR the owner and reviewer both see.
- Review every line Claude writes for tenant filtering and secret handling; these are the two mistakes that hurt a multi-tenant product most.

## Accounts and setup — owned by Raja

These depend on approvals outside the team's control, so they start on day one, in parallel with M0.

**Meta and WhatsApp**

- [ ] Business Portfolio created under the exact legal name on the registration documents (GrowSpark or a Pakka Agent entity), two-factor login on, business verification submitted
- [ ] Meta developer app "Pakka Agent" created with the WhatsApp use case and owned by the portfolio; developers added as app roles
- [ ] Webhook callback set to `https://api.pakkaagent.in/webhooks/whatsapp` with the verify token; messages and account fields subscribed
- [ ] Privacy policy, terms and data-deletion URLs on pakkaagent.in added to the app settings
- [ ] System user created in the portfolio; permanent token generated for our own demo number
- [ ] Tech Provider registration; Facebook Login for Business configuration for Embedded Signup (with coexistence); App Review submitted once Dev 3's two screen recordings are ready
- [ ] Pakka Agent's own WhatsApp number and the shared demo number added and registered
- [ ] Message templates written (English and Tamil) for each pack

**Payments and services**

- [ ] Razorpay account activated (KYC); Subscriptions enabled; monthly and annual plans created for Starter ₹2,499, Growth ₹5,999 and Pro ₹12,999
- [ ] Anthropic API account with billing and usage limits; one key per environment
- [ ] Google Cloud project with Calendar API and OAuth consent screen
- [ ] Supabase organisation (staging and production projects), Vercel team, Inngest, Sentry, Langfuse, Resend accounts
- [x] Domain pakkaagent.in bought
- [ ] DNS for app.pakkaagent.in, api.pakkaagent.in, the landing page and the email sender

**Product content**

- [x] Product name confirmed: Pakka Agent
- [ ] Vertical pack content for real estate, interiors and salon: fields, scoring weights, starter FAQs
- [ ] 20 test chats per pack in English, Tamil and Tanglish for the conversation suite
- [ ] Terms of service, privacy policy (with the data processing clause and consent notice), refund policy
- [ ] Five beta businesses lined up and briefed; YatraKraft lined up as the travel pilot
- [ ] Shared password manager for all credentials

## Kickoff meeting

The goal of the meeting is that every developer leaves knowing their area, their first M0 task, and the contracts they must not break.

**Agenda (about 90 minutes)**

1. The product in 10 minutes: demo the flow on the blueprint's workflow diagram; who the customers are; why WhatsApp first.
2. The three rules: code decides, everything per tenant, built to extend.
3. Walk through the message pipeline and the module contracts (sections above).
4. Confirm ownership and reviewer pairs; developers add their names to the ownership table.
5. Make the open decisions below.
6. Walk through M0 and M1 checklists; each developer picks their first task.
7. Agree the working rhythm: daily 15-minute stand-up, milestone demo on staging when each exit test passes, one shared channel for blockers.
8. Set up together: repo access, `CLAUDE.md` committed, `.env` values shared through the password manager.

**Decisions to make in the meeting**

| Decision | Options | Owner |
|---|---|---|
| Embeddings provider and vector size | Pick one; fixes `vector(n)` in the schema | Dev 1 |
| Package manager and monorepo | pnpm, single Next.js app (recommended) | Dev 2 |
| Login method for businesses | WhatsApp OTP, phone SMS OTP, or Google login | Dev 3 + Raja |
| Default persona name per pack | e.g. "Maya"; businesses can rename | Raja |
| Who writes Tamil templates and test chats | Raja or a named teammate | Raja |
| Graph API version to pin | The current stable version on kickoff day | Dev 1 |

Already decided, no discussion needed: product name and domain (Pakka Agent, pakkaagent.in), direct Cloud API with no BSP, the three connection paths, and the pricing in the billing module.

After the meeting: each developer posts their first pull request (even a skeleton) on the first day, and Raja continues the Meta app, business verification and Razorpay setup the same day.
