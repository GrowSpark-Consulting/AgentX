-- Credit ledger functions (0005). Parallel spends are covered by
-- scripts/db/spend-credits-concurrency.sh, which needs separate connections. Run: pnpm db:test
begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

insert into public.tenants (id, name, vertical) values
  ('c0000000-0000-0000-0000-000000000001', 'Credits Basic', 'test-pack'),
  ('c0000000-0000-0000-0000-000000000002', 'Credits Buckets', 'test-pack'),
  ('c0000000-0000-0000-0000-000000000003', 'Credits Rollover', 'test-pack');

-- Basics ---------------------------------------------------------------------------------
select results_eq($$select * from public.credit_balance('c0000000-0000-0000-0000-000000000001')$$,
  $$values (0, 0, 0)$$, 'a new business has no credits');
select is(public.grant_credits('c0000000-0000-0000-0000-000000000001', 300, 'trial_grant', null, now() + interval '7 days'),
  true, 'a trial grant is recorded');
select results_eq($$select * from public.credit_balance('c0000000-0000-0000-0000-000000000001')$$,
  $$values (300, 0, 300)$$, 'trial credits count as plan credits');
select is(public.spend_credits('c0000000-0000-0000-0000-000000000001', 1, 'ai_reply'),
  true, 'spending within the balance succeeds');
select results_eq($$select total from public.credit_balance('c0000000-0000-0000-0000-000000000001')$$,
  $$values (299)$$, 'the spend reduced the balance by one');
select is(public.spend_credits('c0000000-0000-0000-0000-000000000001', 1000, 'ai_reply'),
  false, 'spending more than the balance returns false');
select is((select count(*) from public.credit_ledger where tenant_id = 'c0000000-0000-0000-0000-000000000001'),
  2::bigint, 'a refused spend writes nothing');

insert into public.credit_ledger (tenant_id, delta, reason, expires_at)
  values ('c0000000-0000-0000-0000-000000000001', 500, 'topup', now() - interval '1 day');
select results_eq($$select total from public.credit_balance('c0000000-0000-0000-0000-000000000001')$$,
  $$values (299)$$, 'expired credits are not counted');

select throws_ok($$select public.spend_credits('c0000000-0000-0000-0000-000000000001', 0, 'ai_reply')$$,
  'P0001', null, 'a zero spend is rejected');
select throws_ok($$select public.spend_credits('c0000000-0000-0000-0000-000000000001', 1, 'plan_grant')$$,
  'P0001', null, 'a grant reason cannot be used to spend');
select throws_ok($$select public.grant_credits('c0000000-0000-0000-0000-000000000001', 100, 'plan_grant')$$,
  'P0001', null, 'plan credits only come from renew_plan_credits');

-- Buckets: soonest-expiring first, split across buckets, top-up rules ----------------------
select public.renew_plan_credits('c0000000-0000-0000-0000-000000000002', 5, now() + interval '30 days');
select public.grant_credits('c0000000-0000-0000-0000-000000000002', 10, 'topup', 'c1000000-0000-0000-0000-000000000001');
select results_eq($$select * from public.credit_balance('c0000000-0000-0000-0000-000000000002')$$,
  $$values (5, 10, 15)$$, 'plan and top-up credits are reported separately');
select is(public.spend_credits('c0000000-0000-0000-0000-000000000002', 8, 'template_utility'),
  true, 'a spend larger than one bucket succeeds');
select results_eq(
  $$select delta, expires_at from public.credit_ledger
    where tenant_id = 'c0000000-0000-0000-0000-000000000002' and delta < 0 order by expires_at$$,
  $$values (-5, now() + interval '30 days'), (-3, now() + interval '90 days')$$,
  'the soonest-expiring credits go first and the spend splits across buckets');
select results_eq($$select * from public.credit_balance('c0000000-0000-0000-0000-000000000002')$$,
  $$values (0, 7, 7)$$, 'the plan bucket is empty and the top-up keeps the rest');
select is((select expires_at from public.credit_ledger
            where tenant_id = 'c0000000-0000-0000-0000-000000000002' and reason = 'topup'),
  now() + interval '90 days', 'top-ups expire 90 days after purchase');
select is(public.grant_credits('c0000000-0000-0000-0000-000000000002', 10, 'topup', 'c1000000-0000-0000-0000-000000000001'),
  false, 'the same top-up payment is not granted twice');
select is((select count(*) from public.credit_ledger
            where ref_id = 'c1000000-0000-0000-0000-000000000001' and delta > 0),
  1::bigint, 'only one top-up row exists for that payment');

-- Rollover: plan credits survive exactly one renewal ---------------------------------------
select public.renew_plan_credits('c0000000-0000-0000-0000-000000000003', 100, now() + interval '10 days', 'c2000000-0000-0000-0000-000000000001');
select public.renew_plan_credits('c0000000-0000-0000-0000-000000000003', 200, now() + interval '40 days', 'c2000000-0000-0000-0000-000000000002');
select public.renew_plan_credits('c0000000-0000-0000-0000-000000000003', 1500, now() + interval '70 days', 'c2000000-0000-0000-0000-000000000003');
select results_eq($$select plan from public.credit_balance('c0000000-0000-0000-0000-000000000003')$$,
  $$values (1700)$$, 'after renewal the last cycle rolls over and older plan credits are gone');
select results_eq(
  $$select delta, expires_at from public.credit_ledger
    where tenant_id = 'c0000000-0000-0000-0000-000000000003' and reason = 'cycle_reset'$$,
  $$values (-100, now() + interval '10 days')$$,
  'the cycle before last is reset with a cycle_reset row');
select is(public.renew_plan_credits('c0000000-0000-0000-0000-000000000003', 1500, now() + interval '70 days', 'c2000000-0000-0000-0000-000000000003'),
  false, 'the same renewal is not granted twice');

select is(
  (select count(*) from (
     select tenant_id, expires_at from public.credit_ledger
     where tenant_id::text like 'c0000000-%' and (expires_at is null or expires_at > now())
     group by tenant_id, expires_at having sum(delta) < 0) b),
  0::bigint, 'no credit bucket is ever below zero');

-- Only the server may call these ----------------------------------------------------------
set local role authenticated;
select throws_ok($$select public.spend_credits('c0000000-0000-0000-0000-000000000001', 1, 'ai_reply')$$,
  '42501', null, 'members cannot spend credits directly');
select throws_ok($$select public.grant_credits('c0000000-0000-0000-0000-000000000001', 1000, 'admin')$$,
  '42501', null, 'members cannot grant themselves credits');
reset role;
set local role anon;
select throws_ok($$select * from public.credit_balance('c0000000-0000-0000-0000-000000000001')$$,
  '42501', null, 'signed-out visitors cannot read a balance');

select * from finish();
rollback;
