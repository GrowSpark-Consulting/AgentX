-- Tenant isolation and write lockdown for 0001_init. Run: pnpm db:test
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

-- Guard for every future migration: no public table without row-level security.
select is(
  (select array_agg(c.relname::text order by c.relname)
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
  null,
  'every public table has row level security enabled'
);

-- Fixtures, inserted as the migration owner (bypasses RLS): two businesses, one owner each.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'owner-a@test.local'),
  ('00000000-0000-0000-0000-00000000000b', 'owner-b@test.local');
insert into public.tenants (id, name, vertical) values
  ('10000000-0000-0000-0000-00000000000a', 'Tenant A', 'test-pack'),
  ('10000000-0000-0000-0000-00000000000b', 'Tenant B', 'test-pack');
insert into public.memberships (tenant_id, user_id, role) values
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'owner'),
  ('10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', 'owner');
insert into public.contacts (id, tenant_id, phone) values
  ('20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000a', '+910000000001'),
  ('20000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-00000000000b', '+910000000002');
insert into public.leads (tenant_id, contact_id) values
  ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a'),
  ('10000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b');
insert into public.credit_ledger (tenant_id, delta, reason) values
  ('10000000-0000-0000-0000-00000000000a', 300, 'trial_grant'),
  ('10000000-0000-0000-0000-00000000000b', 300, 'trial_grant');
insert into public.plans (key, name, price_inr, monthly_credits, seats, whatsapp_numbers, feature_keys)
  values ('trial', 'Trial', 0, 300, 2, 1, array['ai_auto_reply']);

-- Act as owner A, the way PostgREST does for a signed-in dashboard user.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

select results_eq('select name from public.tenants', array['Tenant A'],
  'a member sees only their own business');
select is((select count(*) from public.memberships), 1::bigint,
  'a member sees only their own business''s memberships');
select is((select count(*) from public.leads), 1::bigint,
  'a member sees their own leads');
select is((select count(*) from public.leads
            where tenant_id = '10000000-0000-0000-0000-00000000000b'), 0::bigint,
  'a member cannot see another business''s leads');
select is((select count(*) from public.credit_ledger), 1::bigint,
  'a member sees only their own credit history');

select throws_ok(
  $$insert into public.credit_ledger (tenant_id, delta, reason)
    values ('10000000-0000-0000-0000-00000000000a', 100000, 'admin')$$,
  '42501', null,
  'a member cannot grant themselves credits');

update public.tenants set plan_key = 'pro', status = 'active';
select is((select plan_key from public.tenants
            where id = '10000000-0000-0000-0000-00000000000a'), 'trial',
  'a member cannot change their own plan');

select is((select count(*) from public.plans), 1::bigint,
  'signed-in users can read the plan catalogue');

-- Signed out.
reset role;
set local role anon;

select is((select count(*) from public.tenants), 0::bigint,
  'signed-out visitors see no businesses');
select throws_ok(
  $$select public.is_member('10000000-0000-0000-0000-00000000000a')$$,
  '42501', null,
  'signed-out visitors cannot call is_member');

select * from finish();
rollback;
