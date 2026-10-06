-- Trial signup (0006). Signups run as service_role, the role the server uses in production.
-- Expects the seed (trial plan). Run: pnpm db:reset, then pnpm db:test
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

insert into public.plans (key, name, price_inr, monthly_credits, seats, whatsapp_numbers, feature_keys)
  values ('trial', 'Trial', 0, 300, 2, 1, array['ai_auto_reply'])
  on conflict (key) do nothing;  -- the seed may already have it
insert into auth.users (id, email) values
  ('e0000000-0000-0000-0000-000000000001', 'signup-1@test.local'),
  ('e0000000-0000-0000-0000-000000000002', 'signup-2@test.local'),
  ('e0000000-0000-0000-0000-000000000003', 'signup-3@test.local'),
  ('e0000000-0000-0000-0000-000000000004', 'signup-4@test.local');
-- signup-3 already owns a paying business
insert into public.tenants (id, name, vertical, status, plan_key)
  values ('e1000000-0000-0000-0000-000000000003', 'Paying Business', 'test-pack', 'active', 'starter');
insert into public.memberships (tenant_id, user_id, role)
  values ('e1000000-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-000000000003', 'owner');

set local role service_role;
create temporary table signup on commit drop as
  select * from public.create_trial_tenant('e0000000-0000-0000-0000-000000000001', '  Sunrise Homes  ', 'real-estate');
create temporary table signup_again on commit drop as
  select * from public.create_trial_tenant('e0000000-0000-0000-0000-000000000001', 'Sunrise Homes', 'real-estate');
create temporary table signup2 on commit drop as
  select * from public.create_trial_tenant('e0000000-0000-0000-0000-000000000002', 'Second Business', 'salon');
reset role;

select is((select created from signup), true, 'the server role can create a trial business');
select results_eq(
  $$select t.name, t.status, t.plan_key, t.timezone from public.tenants t join signup s on s.tenant_id = t.id$$,
  $$values ('Sunrise Homes'::text, 'trial'::text, 'trial'::text, 'Asia/Kolkata'::text)$$,
  'the business starts in trial on the trial plan, name trimmed, Indian time zone');
select is((select trial_ends_at from signup), now() + interval '7 days', 'the trial lasts 7 days');
select results_eq(
  $$select m.user_id, m.role from public.memberships m join signup s on s.tenant_id = m.tenant_id$$,
  $$values ('e0000000-0000-0000-0000-000000000001'::uuid, 'owner'::text)$$,
  'the person who signed up owns the business');
select results_eq($$select b.total from signup s cross join lateral public.credit_balance(s.tenant_id) b$$,
  $$select monthly_credits from public.plans where key = 'trial'$$,
  'the business is funded with the trial plan''s credits');
select is(
  (select l.expires_at from public.credit_ledger l join signup s on s.tenant_id = l.tenant_id where l.reason = 'trial_grant'),
  (select trial_ends_at from signup), 'trial credits expire when the trial ends');
select matches((select route_code from signup), '^TRIAL-[2-9A-HJKMNP-Z]{4}$',
  'the route code looks like TRIAL-XXXX without look-alike characters');
select results_eq(
  $$select r.kind, r.expires_at from public.route_codes r join signup s on s.route_code = r.code and s.tenant_id = r.tenant_id$$,
  $$select 'trial'::text, trial_ends_at from signup$$,
  'the route code points at the business and expires with the trial');

select results_eq($$select tenant_id, route_code, created from signup_again$$,
  $$select tenant_id, route_code, false from signup$$,
  'signing up again returns the same trial business and code');
select is((select count(*) from public.credit_ledger l join signup s on s.tenant_id = l.tenant_id where l.reason = 'trial_grant'),
  1::bigint, 'signing up again grants no extra credits');
select isnt((select route_code from signup), (select route_code from signup2), 'two businesses get different route codes');

select throws_ok($$select * from public.create_trial_tenant('e0000000-0000-0000-0000-000000000003', 'Another', 'salon')$$,
  'P0001', null, 'an account that already owns a business cannot start a trial');
select throws_ok($$select * from public.create_trial_tenant('e0000000-0000-0000-0000-000000000004', 'X', 'salon', 'India Standard Time')$$,
  'P0001', null, 'a time zone that is not an IANA name is rejected');
select throws_ok($$select * from public.create_trial_tenant('e0000000-0000-0000-0000-000000000004', 'X', 'Real Estate!')$$,
  'P0001', null, 'a vertical that is not a pack key is rejected');
select throws_ok($$select * from public.create_trial_tenant('e0000000-0000-0000-0000-000000000004', '   ', 'salon')$$,
  'P0001', null, 'a blank business name is rejected');
select throws_ok($$select * from public.create_trial_tenant('e0000000-0000-0000-0000-0000000000ff', 'X', 'salon')$$,
  'P0001', null, 'an unknown user is rejected');

-- Once the pack loader has written packs, only active packs are accepted and the version is pinned.
insert into public.vertical_packs (key, version, active, definition) values
  ('pack-a', 1, true, '{}'), ('pack-a', 2, true, '{}'), ('pack-b', 1, false, '{}');
select throws_ok($$select * from public.create_trial_tenant('e0000000-0000-0000-0000-000000000004', 'X', 'pack-b')$$,
  'P0001', null, 'an inactive pack is rejected once packs exist');
create temporary table signup_pack on commit drop as
  select * from public.create_trial_tenant('e0000000-0000-0000-0000-000000000004', 'Pack A Business', 'pack-a');
select is((select t.vertical_version from public.tenants t join signup_pack s on s.tenant_id = t.id),
  2, 'a new business is pinned to the latest active pack version');

-- Check the grant itself: a call as these roles would also fail later, which would hide a bad grant.
select ok(not has_function_privilege('authenticated', 'public.create_trial_tenant(uuid, text, text, text)', 'execute'),
  'members cannot call the signup function directly');
select ok(not has_function_privilege('anon', 'public.create_trial_tenant(uuid, text, text, text)', 'execute'),
  'signed-out visitors cannot call the signup function');

select * from finish();
rollback;
