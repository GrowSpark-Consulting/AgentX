-- 0017_google_calendar: one Google Calendar connection per resource (docs/handover.md, endpoints table:
-- "GET /api/calendar/google/connect, /callback: Google OAuth per resource"; 9-day plan, Day 3).
--
-- The refresh token is encrypted with ENCRYPTION_KEY (AES-256-GCM, backend/src/lib/crypto.ts,
-- calendarSecretContext) and never leaves the server. Members read the other columns, so the dashboard
-- can show "Connected as …" or "Reconnect"; only server code writes. status is needs_reconnect when
-- Google refuses the refresh token (access revoked, or the 7-day expiry of tokens while the consent
-- screen is in Testing). resources.google_calendar_id mirrors calendar_id while connected.

create table public.google_calendar_connections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  resource_id uuid not null unique references public.resources(id) on delete cascade,
  google_email text,
  calendar_id text not null default 'primary',
  refresh_token_enc text not null,
  scope text not null,
  status text not null default 'connected' check (status in ('connected', 'needs_reconnect')),
  last_error text,
  connected_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index google_calendar_connections_tenant_id_idx on public.google_calendar_connections (tenant_id);

create trigger google_calendar_connections_set_updated_at
  before update on public.google_calendar_connections
  for each row execute function public.set_updated_at();

alter table public.google_calendar_connections enable row level security;
revoke all on public.google_calendar_connections from anon, authenticated;
grant select (id, tenant_id, resource_id, google_email, calendar_id, scope, status, last_error, created_at, updated_at)
  on public.google_calendar_connections to authenticated;
create policy tenant_read on public.google_calendar_connections
  for select to authenticated using (public.is_member(tenant_id));
