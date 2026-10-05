-- 0002_packs_and_bookings: pack versions, generic bookings, catalog and quotes
-- (docs/handover.md, "Vertical pack system"), plus the member write access that the
-- handover's RLS pattern implies and 0001 left out.
--
-- Access model after this migration ("members" = signed-in users with a membership row):
--   * Members read their own tenant's rows (0001).
--   * Members now also write where the dashboard edits directly: catalog_items and quotes
--     (handover SQL), services and resources, a lead's stage/owner/outcome/fields, their own
--     alert and takeover preferences, and the tenant's name, timezone, business hours and
--     agent settings. Every write policy pins the row to the member's own tenant.
--   * Server code (service role) stays the only writer where the handover names one:
--     credit_ledger (spend_credits), messages (notify.send), bookings (booking API),
--     tenant_features (PATCH /api/features), memberships (team invite, seat limit),
--     subscriptions (Razorpay webhooks), tenants.plan_key/status (billing), and channels,
--     conversations, handoffs, route_codes, kb_*, audit_logs.
--   * Every policy is scoped `to authenticated`; signed-out requests match no policy.

-- Pack versions: one row per (key, version) -----------------------------------------

alter table public.vertical_packs drop constraint vertical_packs_pkey;
alter table public.vertical_packs add primary key (key, version);

alter table public.tenants
  add column vertical_version int not null default 1,
  add column pack_overrides jsonb not null default '{}';

-- Generic bookings ------------------------------------------------------------------

alter table public.bookings
  add column kind text not null default 'slot'
    check (kind in ('slot','site_visit','field_visit','callback','date_range','reservation')),
  add column details jsonb not null default '{}',   -- pax, pickup point, package id
  alter column resource_id drop not null;
-- the exclusion constraint already ignores rows with null resource_id

-- Catalog: packages, properties, portfolio items, rooms, menus ----------------------

create table public.catalog_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
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

-- Quotes ----------------------------------------------------------------------------

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  catalog_item_id uuid references public.catalog_items(id),
  line_items jsonb not null,                        -- [{ label, qty, unit_price }]
  total_inr int not null,
  status text not null default 'draft'
    check (status in ('draft','sent','accepted','revised','expired','declined')),
  valid_until date,
  approved_by uuid,                                 -- staff who approved; null = auto
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index catalog_items_tenant_id_idx on public.catalog_items (tenant_id);
create index quotes_tenant_id_idx on public.quotes (tenant_id);
create index quotes_lead_id_idx on public.quotes (lead_id);
create index quotes_catalog_item_id_idx on public.quotes (catalog_item_id);

-- RLS for the new tables (handover policies, scoped to signed-in users) -------------

alter table public.catalog_items enable row level security;
create policy tenant_isolation on public.catalog_items
  for all to authenticated
  using (public.is_member(tenant_id))
  with check (public.is_member(tenant_id));

alter table public.quotes enable row level security;
create policy tenant_isolation on public.quotes
  for all to authenticated
  using (public.is_member(tenant_id))
  with check (
    public.is_member(tenant_id)
    -- the lead and catalog item must belong to the same business as the quote
    and exists (
      select 1 from public.leads l
      where l.id = lead_id and l.tenant_id = quotes.tenant_id
    )
    and (
      catalog_item_id is null
      or exists (
        select 1 from public.catalog_items c
        where c.id = catalog_item_id and c.tenant_id = quotes.tenant_id
      )
    )
  );

-- Member writes on 0001 tables --------------------------------------------------------

-- Services and resources: knowledge-base and settings screens edit them directly.
create policy tenant_insert on public.services
  for insert to authenticated with check (public.is_member(tenant_id));
create policy tenant_update on public.services
  for update to authenticated
  using (public.is_member(tenant_id)) with check (public.is_member(tenant_id));
create policy tenant_delete on public.services
  for delete to authenticated using (public.is_member(tenant_id));

create policy tenant_insert on public.resources
  for insert to authenticated with check (public.is_member(tenant_id));
create policy tenant_update on public.resources
  for update to authenticated
  using (public.is_member(tenant_id)) with check (public.is_member(tenant_id));
create policy tenant_delete on public.resources
  for delete to authenticated using (public.is_member(tenant_id));

-- Leads: the pipeline board moves stage and owner; staff can record an outcome and
-- correct answers. Score and temperature stay computed by server code.
revoke update on public.leads from authenticated;
grant update (stage, owner_user_id, outcome, fields) on public.leads to authenticated;
create policy tenant_update on public.leads
  for update to authenticated
  using (public.is_member(tenant_id)) with check (public.is_member(tenant_id));

-- Tenants: agent settings and business details. plan_key, status, trial_ends_at,
-- vertical, vertical_version and pack_overrides stay server-only.
revoke update on public.tenants from authenticated;
grant update (name, timezone, business_hours, agent_settings) on public.tenants to authenticated;
create policy tenant_update on public.tenants
  for update to authenticated
  using (public.is_member(id)) with check (public.is_member(id));

-- Memberships: each person sets their own alert number and takeover preference.
-- Roles and new members go through the team API (seat limit).
revoke update on public.memberships from authenticated;
grant update (whatsapp_phone, takeover_pref) on public.memberships to authenticated;
create policy own_preferences on public.memberships
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
