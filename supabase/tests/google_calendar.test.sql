-- Google Calendar connections (0017): members see their business's connection status, never the token;
-- only the server writes. Run: pnpm db:test
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000005a0', 'cal-a@test.local'),
  ('00000000-0000-0000-0000-0000000005b0', 'cal-b@test.local');
insert into public.tenants (id, name, vertical) values
  ('7e000000-0000-0000-0000-00000000000a', 'Cal A', 'test-pack'),
  ('7e000000-0000-0000-0000-00000000000b', 'Cal B', 'test-pack');
insert into public.memberships (tenant_id, user_id, role) values
  ('7e000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000005a0', 'owner'),
  ('7e000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000005b0', 'owner');
insert into public.resources (id, tenant_id, type, name) values
  ('7e300000-0000-0000-0000-0000000000a1', '7e000000-0000-0000-0000-00000000000a', 'staff', 'Staff A'),
  ('7e300000-0000-0000-0000-0000000000a2', '7e000000-0000-0000-0000-00000000000a', 'staff', 'Staff A2'),
  ('7e300000-0000-0000-0000-0000000000b1', '7e000000-0000-0000-0000-00000000000b', 'staff', 'Staff B');
insert into public.google_calendar_connections (tenant_id, resource_id, google_email, refresh_token_enc, scope) values
  ('7e000000-0000-0000-0000-00000000000a', '7e300000-0000-0000-0000-0000000000a1', 'staff-a@gmail.com', 'v1:iv:tag:secret-a', 'openid email'),
  ('7e000000-0000-0000-0000-00000000000b', '7e300000-0000-0000-0000-0000000000b1', 'staff-b@gmail.com', 'v1:iv:tag:secret-b', 'openid email');

select ok((select relrowsecurity from pg_class where oid = 'public.google_calendar_connections'::regclass),
  'RLS is on for google_calendar_connections');
select ok(has_column_privilege('service_role', 'public.google_calendar_connections', 'refresh_token_enc', 'select'),
  'server code can read the encrypted token');

select throws_ok(
  $$insert into public.google_calendar_connections (tenant_id, resource_id, refresh_token_enc, scope, status)
    values ('7e000000-0000-0000-0000-00000000000a', '7e300000-0000-0000-0000-0000000000a2', 'v1:x', 'email', 'broken')$$,
  '23514', null, 'status is connected or needs_reconnect');
select throws_ok(
  $$insert into public.google_calendar_connections (tenant_id, resource_id, refresh_token_enc, scope)
    values ('7e000000-0000-0000-0000-00000000000a', '7e300000-0000-0000-0000-0000000000a1', 'v1:x', 'email')$$,
  '23505', null, 'one connection per staff member');

-- Owner A ---------------------------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000005a0","role":"authenticated"}', true);

select results_eq('select google_email, status from public.google_calendar_connections',
  $$values ('staff-a@gmail.com'::text, 'connected'::text)$$, 'a member sees their business''s connection and its status');
select throws_ok('select refresh_token_enc from public.google_calendar_connections', '42501', null,
  'a member cannot read the token');
select throws_ok(
  $$insert into public.google_calendar_connections (tenant_id, resource_id, refresh_token_enc, scope)
    values ('7e000000-0000-0000-0000-00000000000a', '7e300000-0000-0000-0000-0000000000a2', 'v1:x', 'email')$$,
  '42501', null, 'a member cannot add a connection');
select throws_ok($$update public.google_calendar_connections set status = 'needs_reconnect'$$, '42501', null,
  'a member cannot change a connection');

reset role;
set local role anon;
select throws_ok('select status from public.google_calendar_connections', '42501', null,
  'signed-out visitors cannot read connections');

reset role;
select is((select count(*) from public.google_calendar_connections where tenant_id = '7e000000-0000-0000-0000-00000000000b'), 1::bigint,
  'the other business''s connection is untouched (and was invisible to owner A)');
delete from public.resources where id = '7e300000-0000-0000-0000-0000000000a1';
select is((select count(*) from public.google_calendar_connections where resource_id = '7e300000-0000-0000-0000-0000000000a1'), 0::bigint,
  'deleting the staff member deletes their connection');

select * from finish();
rollback;
