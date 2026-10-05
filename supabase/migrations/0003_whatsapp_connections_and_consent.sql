-- 0003_whatsapp_connections_and_consent: one row per connected WhatsApp number, one-time
-- assisted connect links, and the DPDP consent log (docs/handover.md, module 10).
--
-- WhatsApp credentials have one home, whatsapp_connections: channels.credentials_enc from
-- 0001 is dropped (it was never written, and members could read it).
--
-- Secrets (token_enc, app_secret_enc, connect_links.token) never reach a client:
--   * RLS is on for all three tables.
--   * whatsapp_connections and connect_links: anon and authenticated lose every privilege.
--     Members get SELECT on the non-secret columns of whatsapp_connections only, which is
--     what whatsapp_connections_public exposes. connect_links is server-only.
--   * whatsapp_connections_public is a security_invoker view, so it runs with the caller's
--     privileges and RLS instead of the view owner's.
--   * consent_logs is an append-only audit trail: members read and add their own tenant's
--     entries; nobody edits or deletes them from a client.

create table public.whatsapp_connections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  channel_id uuid not null references public.channels(id) on delete cascade,
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

create table public.connect_links (
  token text primary key,                   -- random 32 bytes, url-safe
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  created_by uuid not null,
  expires_at timestamptz not null,
  used_at timestamptz
);

create table public.consent_logs (
  id bigserial primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  event text not null check (event in
    ('notice_shown','opted_in','opted_out','deletion_requested','deleted')),
  source text not null,                     -- first_message, stop_keyword, dashboard, admin
  message_id uuid,
  created_at timestamptz not null default now()
);

create index whatsapp_connections_tenant_id_idx on public.whatsapp_connections (tenant_id);
create index whatsapp_connections_channel_id_idx on public.whatsapp_connections (channel_id);
create index whatsapp_connections_waba_id_idx on public.whatsapp_connections (waba_id);
create index connect_links_tenant_id_idx on public.connect_links (tenant_id);
create index consent_logs_tenant_contact_idx on public.consent_logs (tenant_id, contact_id);
create index consent_logs_contact_id_idx on public.consent_logs (contact_id);

create trigger whatsapp_connections_set_updated_at
  before update on public.whatsapp_connections
  for each row execute function public.set_updated_at();

-- Tokens never reach the browser ---------------------------------------------------

-- channels keeps only the generic row. A second credentials column would be a second place
-- for secrets, readable by members under 0001's policy. Future channel types get their own
-- *_connections table with the same lockdown as below.
alter table public.channels drop column credentials_enc;

alter table public.whatsapp_connections enable row level security;
alter table public.connect_links enable row level security;

revoke all on public.whatsapp_connections from anon, authenticated;
revoke all on public.connect_links from anon, authenticated;

grant select (id, tenant_id, method, waba_id, phone_number_id, display_phone, verified_name,
              coexistence, status, last_check, quality_rating, messaging_limit, created_at)
  on public.whatsapp_connections to authenticated;
create policy tenant_read on public.whatsapp_connections
  for select to authenticated using (public.is_member(tenant_id));

-- The dashboard reads this view (name and columns as in the handover).
create view public.whatsapp_connections_public
  with (security_invoker = true) as
  select id, tenant_id, method, waba_id, phone_number_id, display_phone, verified_name,
         coexistence, status, last_check, quality_rating, messaging_limit, created_at
  from public.whatsapp_connections
  where public.is_member(tenant_id);

revoke all on public.whatsapp_connections_public from anon, authenticated;
grant select on public.whatsapp_connections_public to authenticated;

-- Consent log: append-only ------------------------------------------------------------

alter table public.consent_logs enable row level security;

create policy tenant_read on public.consent_logs
  for select to authenticated using (public.is_member(tenant_id));
create policy tenant_insert on public.consent_logs
  for insert to authenticated
  with check (
    public.is_member(tenant_id)
    and exists (
      select 1 from public.contacts c
      where c.id = contact_id and c.tenant_id = consent_logs.tenant_id
    )
  );

revoke update, delete, truncate on public.consent_logs from anon, authenticated;
