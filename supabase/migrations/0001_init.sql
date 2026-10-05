-- 0001_init: core schema for v1 (docs/handover.md, "Database schema").
--
-- Access model:
--   * Every tenant table has tenant_id and row-level security.
--   * Signed-in members can READ their own tenant's rows.
--   * Nothing is writable from the browser yet. Server code (service role) does all
--     writes, so plans, credits, messages and bookings can't be changed around their
--     checks. A later migration grants a specific write when a dashboard screen needs it.
--   * plans, features and vertical_packs are global catalogues any signed-in user can read.

create extension if not exists vector with schema extensions;
create extension if not exists btree_gist with schema extensions;

-- Businesses and people -----------------------------------------------------------

create table public.tenants (
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

create table public.memberships (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','admin','staff')),
  whatsapp_phone text,                            -- for staff alerts
  takeover_pref text check (takeover_pref in ('inbox','own_number','ask')),
  primary key (tenant_id, user_id)
);

-- Channels and conversations ------------------------------------------------------

create table public.channels (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  type text not null check (type in ('whatsapp','email','web')),   -- only whatsapp in v1
  phone_number_id text unique,
  waba_id text,
  display_phone text,
  credentials_enc text,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  phone text not null,
  name text,
  language text,
  consent_at timestamptz,
  opted_out_at timestamptz,
  tags text[] not null default '{}',
  unique (tenant_id, phone)
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  channel_id uuid not null references public.channels(id),
  mode text not null default 'ai' check (mode in ('ai','human','external')),
  assigned_user_id uuid,
  last_customer_msg_at timestamptz,               -- drives the 24-hour window
  status text not null default 'open',
  created_at timestamptz not null default now()
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
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

-- Leads -----------------------------------------------------------------------------

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
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

-- Industry packs and knowledge ------------------------------------------------------

create table public.vertical_packs (
  key text primary key,
  version int not null,
  active boolean not null default false,          -- clinic stays false until launch
  definition jsonb not null
);

create table public.kb_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  source_type text not null,                      -- website, upload, manual
  source_url text,
  title text,
  created_at timestamptz not null default now()
);

create table public.kb_chunks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  document_id uuid not null references public.kb_documents(id) on delete cascade,
  content text not null,
  embedding extensions.vector(1024)               -- set dimension to the chosen embeddings model
);

-- Booking ---------------------------------------------------------------------------

create table public.services (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  duration_min int not null,
  price_min int, price_max int,
  resource_type text not null,
  active boolean not null default true
);

create table public.resources (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  type text not null,                             -- staff, stylist, table, room, technician
  name text not null,
  user_id uuid,
  google_calendar_id text,
  working_hours jsonb not null default '{}',
  service_area jsonb,                             -- pincodes for field visits
  active boolean not null default true
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  resource_id uuid not null references public.resources(id),
  service_id uuid references public.services(id),
  start_at timestamptz not null,
  end_at timestamptz not null,
  status text not null check (status in
    ('held','confirmed','rescheduled','cancelled','completed','no_show')),
  hold_expires_at timestamptz,
  calendar_event_id text,
  created_at timestamptz not null default now(),
  exclude using gist (resource_id with =, tstzrange(start_at, end_at) with &&)
    where (status in ('held','confirmed'))        -- database blocks double booking
);

-- Plans, features, credits ----------------------------------------------------------

create table public.plans (
  key text primary key,                           -- trial, starter, growth, pro
  name text not null,
  price_inr int not null,
  monthly_credits int not null,
  seats int not null,
  whatsapp_numbers int not null,
  feature_keys text[] not null,
  razorpay_plan_id text
);

create table public.features (
  key text primary key,                           -- reminder_24h, feedback_request, ...
  name text not null,
  description text not null,
  default_on boolean not null,
  credit_cost int not null default 0
);

create table public.tenant_features (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  feature_key text not null references public.features(key),
  enabled boolean not null,
  settings jsonb not null default '{}',           -- e.g. reminder offset in minutes
  primary key (tenant_id, feature_key)
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  plan_key text not null references public.plans(key),
  razorpay_subscription_id text unique,
  status text not null,
  current_period_start timestamptz,
  current_period_end timestamptz
);

create table public.credit_ledger (
  id bigserial primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  delta int not null,                             -- +grant / -spend
  reason text not null,                           -- plan_grant, topup, trial_grant, ai_reply, template_utility,
                                                  -- template_marketing, staff_alert, cycle_reset, admin
  ref_id uuid,                                    -- message, booking or payment id
  expires_at timestamptz,                         -- for top-ups
  created_at timestamptz not null default now()
);

-- Handoff, demo routing, audit ------------------------------------------------------

create table public.handoffs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  trigger text not null,
  priority text not null,
  takeover_mode text check (takeover_mode in ('inbox','own_number')),
  assigned_user_id uuid,
  picked_at timestamptz, resolved_at timestamptz,
  outcome text
);

create table public.route_codes (
  code text primary key,                          -- DEMO-REALESTATE, TRIAL-7F3K
  kind text not null check (kind in ('demo','trial')),
  tenant_id uuid references public.tenants(id) on delete cascade,
  expires_at timestamptz
);

create table public.audit_logs (
  id bigserial primary key,
  tenant_id uuid,
  actor text not null,                            -- user id, 'ai', 'system', 'admin:<id>'
  action text not null,
  entity text, entity_id uuid,
  diff jsonb,
  created_at timestamptz not null default now()
);

-- Indexes for tenant-scoped reads and foreign keys -----------------------------------

create index memberships_user_id_idx on public.memberships (user_id);
create index channels_tenant_id_idx on public.channels (tenant_id);
create index conversations_tenant_contact_idx on public.conversations (tenant_id, contact_id);
create index conversations_channel_id_idx on public.conversations (channel_id);
create index messages_conversation_created_idx on public.messages (conversation_id, created_at);
create index messages_tenant_created_idx on public.messages (tenant_id, created_at);
create index leads_tenant_stage_idx on public.leads (tenant_id, stage);
create index leads_contact_id_idx on public.leads (contact_id);
create index kb_documents_tenant_id_idx on public.kb_documents (tenant_id);
create index kb_chunks_tenant_id_idx on public.kb_chunks (tenant_id);
create index kb_chunks_document_id_idx on public.kb_chunks (document_id);
create index services_tenant_id_idx on public.services (tenant_id);
create index resources_tenant_id_idx on public.resources (tenant_id);
create index bookings_tenant_start_idx on public.bookings (tenant_id, start_at);
create index bookings_lead_id_idx on public.bookings (lead_id);
create index bookings_service_id_idx on public.bookings (service_id);
create index tenant_features_feature_key_idx on public.tenant_features (feature_key);
create index subscriptions_tenant_id_idx on public.subscriptions (tenant_id);
create index subscriptions_plan_key_idx on public.subscriptions (plan_key);
create index credit_ledger_tenant_expires_idx on public.credit_ledger (tenant_id, expires_at);
create index handoffs_tenant_id_idx on public.handoffs (tenant_id);
create index handoffs_conversation_id_idx on public.handoffs (conversation_id);
create index route_codes_tenant_id_idx on public.route_codes (tenant_id);
create index audit_logs_tenant_created_idx on public.audit_logs (tenant_id, created_at);

-- leads.updated_at follows every update ---------------------------------------------

create function public.set_updated_at() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

create trigger leads_set_updated_at
  before update on public.leads
  for each row execute function public.set_updated_at();

-- Row-level security ----------------------------------------------------------------

-- security definer so policies can read memberships without recursing into its own policy.
create function public.is_member(t uuid) returns boolean
  language sql stable security definer
  set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.tenant_id = t and m.user_id = (select auth.uid())
  )
$$;

revoke execute on function public.is_member(uuid) from public, anon;
grant execute on function public.is_member(uuid) to authenticated, service_role;

alter table public.tenants enable row level security;
create policy tenant_read on public.tenants
  for select to authenticated using (public.is_member(id));

do $$
declare
  t text;
begin
  foreach t in array array[
    'memberships', 'channels', 'contacts', 'conversations', 'messages', 'leads',
    'kb_documents', 'kb_chunks', 'services', 'resources', 'bookings',
    'tenant_features', 'subscriptions', 'credit_ledger', 'handoffs', 'route_codes', 'audit_logs'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy tenant_read on public.%I for select to authenticated using (public.is_member(tenant_id))',
      t
    );
  end loop;

  foreach t in array array['plans', 'features', 'vertical_packs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy catalogue_read on public.%I for select to authenticated using (true)',
      t
    );
  end loop;
end
$$;
