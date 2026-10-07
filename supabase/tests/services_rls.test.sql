-- The Knowledge base services editor: what a member can do to services under RLS (0001 tenant_read,
-- 0002 tenant_insert / tenant_update / tenant_delete). Complements writes_and_whatsapp.test.sql.
-- Run: pnpm db:test
begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000002a0', 'svc-owner-a@test.local'),
  ('00000000-0000-0000-0000-0000000002a1', 'svc-staff-a@test.local'),
  ('00000000-0000-0000-0000-0000000002b0', 'svc-owner-b@test.local');
insert into public.tenants (id, name, vertical) values
  ('e0000000-0000-0000-0000-00000000000a', 'Services A', 'test-pack'),
  ('e0000000-0000-0000-0000-00000000000b', 'Services B', 'test-pack');
insert into public.memberships (tenant_id, user_id, role) values
  ('e0000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000002a0', 'owner'),
  ('e0000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000002a1', 'staff'),
  ('e0000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000002b0', 'owner');
insert into public.services (id, tenant_id, name, duration_min, price_min, price_max, resource_type) values
  ('e1000000-0000-0000-0000-0000000000a1', 'e0000000-0000-0000-0000-00000000000a', 'Haircut A', 30, 300, 600, 'stylist'),
  ('e1000000-0000-0000-0000-0000000000a2', 'e0000000-0000-0000-0000-00000000000a', 'Booked A', 60, null, null, 'stylist'),
  ('e1000000-0000-0000-0000-0000000000b1', 'e0000000-0000-0000-0000-00000000000b', 'Haircut B', 30, 300, 600, 'stylist');
-- A booking on 'Booked A', so deleting it must fail (bookings.service_id has no ON DELETE rule).
insert into public.contacts (id, tenant_id, phone) values
  ('e2000000-0000-0000-0000-00000000000a', 'e0000000-0000-0000-0000-00000000000a', '+919800000201');
insert into public.leads (id, tenant_id, contact_id) values
  ('e3000000-0000-0000-0000-00000000000a', 'e0000000-0000-0000-0000-00000000000a', 'e2000000-0000-0000-0000-00000000000a');
insert into public.bookings (tenant_id, lead_id, service_id, start_at, end_at, status) values
  ('e0000000-0000-0000-0000-00000000000a', 'e3000000-0000-0000-0000-00000000000a', 'e1000000-0000-0000-0000-0000000000a2',
   '2026-11-02 10:00+05:30', '2026-11-02 11:00+05:30', 'confirmed');

-- Owner A ---------------------------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000002a0","role":"authenticated"}', true);

select results_eq('select name from public.services order by name', array['Booked A', 'Haircut A'],
  'a member lists only their own business''s services');
select lives_ok(
  $$insert into public.services (id, tenant_id, name, duration_min, price_min, price_max, resource_type, active)
    values ('e1000000-0000-0000-0000-0000000000a3', 'e0000000-0000-0000-0000-00000000000a', 'Colour A', 90, 1500, 3500, 'stylist', false)$$,
  'a member adds a service with every editable column');
update public.services set name = 'Haircut A+', duration_min = 45, price_min = null, price_max = 700, active = false
  where id = 'e1000000-0000-0000-0000-0000000000a1';
select results_eq(
  $$select name, duration_min, price_min, price_max, active from public.services where id = 'e1000000-0000-0000-0000-0000000000a1'$$,
  $$values ('Haircut A+'::text, 45, null::int, 700, false)$$,
  'a member edits every editable column of their own service');
delete from public.services where id = 'e1000000-0000-0000-0000-0000000000a3';
select is((select count(*) from public.services where id = 'e1000000-0000-0000-0000-0000000000a3'), 0::bigint,
  'a member deletes their own service');
select throws_ok(
  $$delete from public.services where id = 'e1000000-0000-0000-0000-0000000000a2'$$,
  '23503', null, 'a service with bookings cannot be deleted (the editor offers switching it off)');

-- Another business's services: invisible, and every write matches nothing or is refused.
select is((select count(*) from public.services where tenant_id = 'e0000000-0000-0000-0000-00000000000b'), 0::bigint,
  'a member cannot see another business''s services');
-- No-ops under RLS; checked as the migration owner at the end.
update public.services set name = 'hacked' where id = 'e1000000-0000-0000-0000-0000000000b1';
delete from public.services where id = 'e1000000-0000-0000-0000-0000000000b1';
select throws_ok(
  $$insert into public.services (tenant_id, name, duration_min, resource_type)
    values ('e0000000-0000-0000-0000-00000000000b', 'Injected', 30, 'stylist')$$,
  '42501', null, 'a member cannot add a service to another business');
select throws_ok(
  $$update public.services set tenant_id = 'e0000000-0000-0000-0000-00000000000b'
    where id = 'e1000000-0000-0000-0000-0000000000a1'$$,
  '42501', null, 'a member cannot move their service into another business');

-- The schema's own rules still apply to members.
select throws_ok(
  $$insert into public.services (tenant_id, name, resource_type) values ('e0000000-0000-0000-0000-00000000000a', 'No length', 'stylist')$$,
  '23502', null, 'duration_min is required');
select throws_ok(
  $$insert into public.services (tenant_id, name, duration_min) values ('e0000000-0000-0000-0000-00000000000a', 'No type', 30)$$,
  '23502', null, 'resource_type is required');

-- Staff A: same business, same rights (0002 does not distinguish roles) -------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000002a1","role":"authenticated"}', true);
select results_eq('select name from public.services order by name', array['Booked A', 'Haircut A+'],
  'staff see their business''s services');

-- Owner B: sees only B, including after A's changes ---------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000002b0","role":"authenticated"}', true);
select results_eq('select name from public.services', array['Haircut B'], 'the other business sees only its own service');

-- Back as the migration owner ------------------------------------------------------------------------

reset role;
select is((select name from public.services where id = 'e1000000-0000-0000-0000-0000000000b1'), 'Haircut B',
  'an update of another business''s service changed nothing');
select ok(exists (select 1 from public.services where id = 'e1000000-0000-0000-0000-0000000000b1'),
  'a delete of another business''s service removed nothing');
select ok(exists (select 1 from public.services where id = 'e1000000-0000-0000-0000-0000000000a2'),
  'the booked service is still there');

select * from finish();
rollback;
