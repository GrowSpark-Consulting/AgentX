-- 0015_booking_engine: what the slot engine and the booking functions need (docs/handover.md, module 4;
-- 9-day plan, Day 3). The exclusion constraint from 0001 is what blocks double booking: two held or
-- confirmed bookings on one resource can never overlap, and a booking with no resource clashes with
-- nothing.
--
-- 1. services gain buffer_min (time kept clear on each side of a booking on the same resource) and
--    min_notice_min (how far ahead of now a slot must start). The settings screen edits both.
-- 2. bookings: status 'expired' for a hold nobody confirmed; a booking ends after it starts; slot-style
--    kinds (slot, site_visit, field_visit) need a resource; an index for the release-holds job.
-- 3. Functions, service_role only, every query filtered by tenant_id: hold_slot, confirm_booking,
--    reschedule_booking, cancel_booking, release_expired_holds. Errors use the SQLSTATEs the API maps:
--    PA404 not_found, PA409 conflict, P0001 validation_failed, and the exclusion constraint's 23P01
--    (slot_taken).

-- services ------------------------------------------------------------------------------------------

alter table public.services
  add column buffer_min int not null default 0 check (buffer_min between 0 and 240),
  add column min_notice_min int not null default 60 check (min_notice_min between 0 and 10080);

-- bookings ------------------------------------------------------------------------------------------

alter table public.bookings drop constraint bookings_status_check;
alter table public.bookings
  add constraint bookings_status_check check (status in
    ('held','confirmed','rescheduled','cancelled','completed','no_show','expired')),
  add constraint bookings_time_order_check check (end_at > start_at),
  add constraint bookings_resource_for_slots_check
    check (kind not in ('slot','site_visit','field_visit') or resource_id is not null);

-- The release-holds job: held bookings by expiry.
create index bookings_held_expiry_idx on public.bookings (hold_expires_at) where status = 'held';
create index bookings_resource_start_idx on public.bookings (resource_id, start_at);

-- hold_slot -----------------------------------------------------------------------------------------

-- Holds a time for a lead for p_hold_minutes. Slot-style kinds need a resource and a service whose
-- resource_type matches it; callback, date_range and reservation bookings may have no resource, so
-- they never clash. A hold that has already expired stops blocking at once (release-holds only tidies
-- up), and a lead holds one time at a time: picking another releases its earlier hold. If the time
-- is taken, the insert raises 23P01 and nothing changes.
create function public.hold_slot(
  p_tenant_id uuid, p_lead_id uuid, p_kind text, p_start timestamptz, p_end timestamptz,
  p_resource_id uuid default null, p_service_id uuid default null, p_details jsonb default '{}',
  p_hold_minutes int default 10
)
returns public.bookings
language plpgsql
set search_path = ''
as $$
declare
  v_service_type text;
  v_resource_type text;
  v_row public.bookings;
begin
  if p_kind is null or p_kind not in ('slot','site_visit','field_visit','callback','date_range','reservation') then
    raise exception 'hold_slot: % is not a booking kind', p_kind;
  end if;
  if p_start is null or p_end is null or p_end <= p_start then
    raise exception 'hold_slot: a booking must end after it starts';
  end if;
  if p_start <= now() then
    raise exception 'hold_slot: that time has already passed';
  end if;
  if p_hold_minutes is null or p_hold_minutes not between 1 and 60 then
    raise exception 'hold_slot: a hold lasts 1 to 60 minutes';
  end if;
  if p_kind in ('slot','site_visit','field_visit') and (p_resource_id is null or p_service_id is null) then
    raise exception 'hold_slot: a % booking needs a resource and a service', p_kind;
  end if;

  if not exists (select 1 from public.leads l where l.id = p_lead_id and l.tenant_id = p_tenant_id) then
    raise exception 'hold_slot: lead not found' using errcode = 'PA404';
  end if;
  if p_service_id is not null then
    select s.resource_type into v_service_type
    from public.services s
    where s.id = p_service_id and s.tenant_id = p_tenant_id and s.active;
    if not found then
      raise exception 'hold_slot: service not found' using errcode = 'PA404';
    end if;
  end if;
  if p_resource_id is not null then
    select r.type into v_resource_type
    from public.resources r
    where r.id = p_resource_id and r.tenant_id = p_tenant_id and r.active;
    if not found then
      raise exception 'hold_slot: resource not found' using errcode = 'PA404';
    end if;
    if v_service_type is not null and v_resource_type <> v_service_type then
      raise exception 'hold_slot: that resource does not provide this service';
    end if;
  end if;

  update public.bookings b
     set status = 'expired'
   where b.tenant_id = p_tenant_id and b.resource_id = p_resource_id and b.status = 'held'
     and b.hold_expires_at <= now()
     and tstzrange(b.start_at, b.end_at) && tstzrange(p_start, p_end);

  update public.bookings b
     set status = 'cancelled', details = b.details || '{"cancel_reason": "replaced"}'
   where b.tenant_id = p_tenant_id and b.lead_id = p_lead_id and b.status = 'held';

  insert into public.bookings
    (tenant_id, lead_id, resource_id, service_id, kind, start_at, end_at, status, hold_expires_at, details)
  values
    (p_tenant_id, p_lead_id, p_resource_id, p_service_id, p_kind, p_start, p_end, 'held',
     now() + make_interval(mins => p_hold_minutes), coalesce(p_details, '{}'))
  returning * into v_row;
  return v_row;
end
$$;

-- confirm_booking -----------------------------------------------------------------------------------

-- Confirms a held booking and moves the lead to 'booked' (unless it is already further along). A
-- repeat confirm returns the booking unchanged. A hold past its expiry can still be confirmed while it
-- is 'held': the exclusion constraint kept the time for it. Once expired, cancelled or replaced: PA409.
create function public.confirm_booking(p_tenant_id uuid, p_booking_id uuid)
returns public.bookings
language plpgsql
set search_path = ''
as $$
declare
  v_row public.bookings;
begin
  select * into v_row
  from public.bookings b
  where b.id = p_booking_id and b.tenant_id = p_tenant_id
  for update;
  if not found then
    raise exception 'confirm_booking: booking not found' using errcode = 'PA404';
  end if;
  if v_row.status = 'confirmed' then
    return v_row;
  end if;
  if v_row.status <> 'held' then
    raise exception 'confirm_booking: this booking is no longer held (%)', v_row.status using errcode = 'PA409';
  end if;

  update public.bookings b
     set status = 'confirmed', hold_expires_at = null
   where b.id = p_booking_id and b.tenant_id = p_tenant_id
  returning * into v_row;

  update public.leads l
     set stage = 'booked'
   where l.id = v_row.lead_id and l.tenant_id = p_tenant_id
     and l.stage in ('new','engaged','qualified','nurture','human');
  return v_row;
end
$$;

-- reschedule_booking --------------------------------------------------------------------------------

-- Moves a confirmed booking: the old row becomes 'rescheduled' (freeing its time first, so a move that
-- overlaps the old time works) and a new confirmed row takes the new time, with details.rescheduled_from.
-- p_resource_id changes who it is with; null keeps the same resource. If the new time is taken, 23P01
-- and nothing changes.
create function public.reschedule_booking(
  p_tenant_id uuid, p_booking_id uuid, p_start timestamptz, p_end timestamptz, p_resource_id uuid default null
)
returns public.bookings
language plpgsql
set search_path = ''
as $$
declare
  v_old public.bookings;
  v_new public.bookings;
  v_resource_id uuid;
  v_resource_type text;
  v_service_type text;
begin
  if p_start is null or p_end is null or p_end <= p_start then
    raise exception 'reschedule_booking: a booking must end after it starts';
  end if;
  if p_start <= now() then
    raise exception 'reschedule_booking: that time has already passed';
  end if;

  select * into v_old
  from public.bookings b
  where b.id = p_booking_id and b.tenant_id = p_tenant_id
  for update;
  if not found then
    raise exception 'reschedule_booking: booking not found' using errcode = 'PA404';
  end if;
  if v_old.status <> 'confirmed' then
    raise exception 'reschedule_booking: only a confirmed booking can be moved (%)', v_old.status using errcode = 'PA409';
  end if;

  v_resource_id := coalesce(p_resource_id, v_old.resource_id);
  if p_resource_id is not null and p_resource_id is distinct from v_old.resource_id then
    select r.type into v_resource_type
    from public.resources r
    where r.id = p_resource_id and r.tenant_id = p_tenant_id and r.active;
    if not found then
      raise exception 'reschedule_booking: resource not found' using errcode = 'PA404';
    end if;
    select s.resource_type into v_service_type
    from public.services s
    where s.id = v_old.service_id and s.tenant_id = p_tenant_id;
    if v_service_type is not null and v_resource_type <> v_service_type then
      raise exception 'reschedule_booking: that resource does not provide this service';
    end if;
  end if;

  update public.bookings b
     set status = 'rescheduled'
   where b.id = p_booking_id and b.tenant_id = p_tenant_id;

  insert into public.bookings
    (tenant_id, lead_id, resource_id, service_id, kind, start_at, end_at, status, details)
  values
    (p_tenant_id, v_old.lead_id, v_resource_id, v_old.service_id, v_old.kind, p_start, p_end, 'confirmed',
     v_old.details || jsonb_build_object('rescheduled_from', v_old.id))
  returning * into v_new;
  return v_new;
end
$$;

-- cancel_booking ------------------------------------------------------------------------------------

-- Cancels a held or confirmed booking, keeping the reason in details.cancel_reason. A repeat cancel
-- returns the booking unchanged; a booking that already happened or moved: PA409.
create function public.cancel_booking(p_tenant_id uuid, p_booking_id uuid, p_reason text default null)
returns public.bookings
language plpgsql
set search_path = ''
as $$
declare
  v_row public.bookings;
begin
  if char_length(p_reason) > 500 then
    raise exception 'cancel_booking: the reason is at most 500 characters';
  end if;
  select * into v_row
  from public.bookings b
  where b.id = p_booking_id and b.tenant_id = p_tenant_id
  for update;
  if not found then
    raise exception 'cancel_booking: booking not found' using errcode = 'PA404';
  end if;
  if v_row.status = 'cancelled' then
    return v_row;
  end if;
  if v_row.status not in ('held','confirmed') then
    raise exception 'cancel_booking: a % booking cannot be cancelled', v_row.status using errcode = 'PA409';
  end if;

  update public.bookings b
     set status = 'cancelled', hold_expires_at = null,
         details = b.details || jsonb_build_object('cancel_reason', p_reason)
   where b.id = p_booking_id and b.tenant_id = p_tenant_id
  returning * into v_row;
  return v_row;
end
$$;

-- release_expired_holds -----------------------------------------------------------------------------

-- The release-holds job (every minute): every business's holds past their expiry become 'expired'.
-- Returns how many.
create function public.release_expired_holds()
returns int
language plpgsql
set search_path = ''
as $$
declare
  v_count int;
begin
  update public.bookings b
     set status = 'expired'
   where b.status = 'held' and b.hold_expires_at <= now();
  get diagnostics v_count = row_count;
  return v_count;
end
$$;

-- Server only. Supabase grants new functions to anon and authenticated by default.
revoke execute on function public.hold_slot(uuid, uuid, text, timestamptz, timestamptz, uuid, uuid, jsonb, int) from public, anon, authenticated;
revoke execute on function public.confirm_booking(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.reschedule_booking(uuid, uuid, timestamptz, timestamptz, uuid) from public, anon, authenticated;
revoke execute on function public.cancel_booking(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.release_expired_holds() from public, anon, authenticated;
grant execute on function public.hold_slot(uuid, uuid, text, timestamptz, timestamptz, uuid, uuid, jsonb, int) to service_role;
grant execute on function public.confirm_booking(uuid, uuid) to service_role;
grant execute on function public.reschedule_booking(uuid, uuid, timestamptz, timestamptz, uuid) to service_role;
grant execute on function public.cancel_booking(uuid, uuid, text) to service_role;
grant execute on function public.release_expired_holds() to service_role;
