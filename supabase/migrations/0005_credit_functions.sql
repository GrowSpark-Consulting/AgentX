-- 0005_credit_functions: the only writers of credit_ledger (docs/handover.md, module 7 and
-- "Credit spending must be atomic"; 9-day plan, Day 2).
--
-- Buckets: credits are grouped by expires_at. A grant opens a bucket; a spend draws from the
-- soonest-expiring live bucket first and carries that bucket's expires_at, splitting across
-- buckets when needed. When a bucket expires, its grant and the spends drawn from it leave the
-- balance together, so rollover and top-up expiry need no clean-up job.
--
-- Every function locks the tenant row first, so changes for one tenant run one at a time and
-- parallel spends cannot overdraw. Server code (service_role) calls these; members cannot.

-- Live balance split into plan credits (plan, trial, admin grants) and top-ups.
create function public.credit_balance(p_tenant_id uuid)
returns table (plan int, topup int, total int)
language sql stable
set search_path = ''
as $$
  with buckets as (
    select l.expires_at,
           sum(l.delta) as remaining,
           bool_or(l.reason = 'topup' and l.delta > 0) as is_topup
    from public.credit_ledger l
    where l.tenant_id = p_tenant_id and (l.expires_at is null or l.expires_at > now())
    group by l.expires_at
  )
  select coalesce(sum(remaining) filter (where not is_topup), 0)::int,
         coalesce(sum(remaining) filter (where is_topup), 0)::int,
         coalesce(sum(remaining), 0)::int
  from buckets
$$;

-- Spend: false instead of going below zero.
create function public.spend_credits(p_tenant_id uuid, p_amount int, p_reason text, p_ref_id uuid default null)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_available bigint;
  v_left int := p_amount;
  v_take int;
  b record;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'spend_credits: amount must be positive, got %', p_amount;
  end if;
  if p_reason not in ('ai_reply', 'template_utility', 'template_marketing', 'staff_alert', 'admin') then
    raise exception 'spend_credits: % is not a spend reason', p_reason;
  end if;

  perform 1 from public.tenants where id = p_tenant_id for update;
  if not found then
    raise exception 'spend_credits: unknown tenant %', p_tenant_id;
  end if;

  select coalesce(sum(delta), 0) into v_available
  from public.credit_ledger
  where tenant_id = p_tenant_id and (expires_at is null or expires_at > now());

  if v_available < p_amount then
    return false;
  end if;

  for b in
    select expires_at, sum(delta) as remaining
    from public.credit_ledger
    where tenant_id = p_tenant_id and (expires_at is null or expires_at > now())
    group by expires_at
    having sum(delta) > 0
    order by expires_at asc nulls last
  loop
    exit when v_left = 0;
    v_take := least(v_left, b.remaining);
    insert into public.credit_ledger (tenant_id, delta, reason, ref_id, expires_at)
    values (p_tenant_id, -v_take, p_reason, p_ref_id, b.expires_at);
    v_left := v_left - v_take;
  end loop;

  return true;
end
$$;

-- Grants other than the monthly plan: trial, top-up, admin. Top-ups always expire 90 days after
-- purchase. A repeated ref_id (webhook retry) grants nothing and returns false.
create function public.grant_credits(
  p_tenant_id uuid, p_amount int, p_reason text, p_ref_id uuid default null, p_expires_at timestamptz default null
)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_expires_at timestamptz := p_expires_at;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'grant_credits: amount must be positive, got %', p_amount;
  end if;
  if p_reason not in ('trial_grant', 'topup', 'admin') then
    raise exception 'grant_credits: % is not a grant reason (plan grants go through renew_plan_credits)', p_reason;
  end if;
  if p_reason = 'topup' then
    if p_expires_at is not null then
      raise exception 'grant_credits: top-up expiry is fixed at 90 days';
    end if;
    v_expires_at := now() + interval '90 days';
  end if;

  perform 1 from public.tenants where id = p_tenant_id for update;
  if not found then
    raise exception 'grant_credits: unknown tenant %', p_tenant_id;
  end if;

  if p_ref_id is not null and exists (
    select 1 from public.credit_ledger
    where tenant_id = p_tenant_id and reason = p_reason and ref_id = p_ref_id and delta > 0
  ) then
    return false;
  end if;

  insert into public.credit_ledger (tenant_id, delta, reason, ref_id, expires_at)
  values (p_tenant_id, p_amount, p_reason, p_ref_id, v_expires_at);
  return true;
end
$$;

-- Plan renewal: plan credits roll over for exactly one month. Keep the newest live plan bucket
-- (the cycle just ended), reset every older one (cycle_reset), then grant the new month expiring
-- at the end of the next cycle. A repeated ref_id grants nothing and returns false.
create function public.renew_plan_credits(
  p_tenant_id uuid, p_credits int, p_next_cycle_end timestamptz, p_ref_id uuid default null
)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  b record;
begin
  if p_credits is null or p_credits <= 0 then
    raise exception 'renew_plan_credits: credits must be positive, got %', p_credits;
  end if;
  if p_next_cycle_end is null or p_next_cycle_end <= now() then
    raise exception 'renew_plan_credits: next cycle end must be in the future';
  end if;

  perform 1 from public.tenants where id = p_tenant_id for update;
  if not found then
    raise exception 'renew_plan_credits: unknown tenant %', p_tenant_id;
  end if;

  if p_ref_id is not null and exists (
    select 1 from public.credit_ledger
    where tenant_id = p_tenant_id and reason = 'plan_grant' and ref_id = p_ref_id
  ) then
    return false;
  end if;

  for b in
    select expires_at, sum(delta) as remaining
    from public.credit_ledger
    where tenant_id = p_tenant_id and expires_at > now()
    group by expires_at
    having bool_or(reason = 'plan_grant' and delta > 0) and sum(delta) > 0
    order by expires_at desc
    offset 1
  loop
    insert into public.credit_ledger (tenant_id, delta, reason, ref_id, expires_at)
    values (p_tenant_id, -b.remaining, 'cycle_reset', p_ref_id, b.expires_at);
  end loop;

  insert into public.credit_ledger (tenant_id, delta, reason, ref_id, expires_at)
  values (p_tenant_id, p_credits, 'plan_grant', p_ref_id, p_next_cycle_end);
  return true;
end
$$;

-- Server only. Supabase grants new functions to anon and authenticated by default.
revoke execute on function public.credit_balance(uuid) from public, anon, authenticated;
revoke execute on function public.spend_credits(uuid, int, text, uuid) from public, anon, authenticated;
revoke execute on function public.grant_credits(uuid, int, text, uuid, timestamptz) from public, anon, authenticated;
revoke execute on function public.renew_plan_credits(uuid, int, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.credit_balance(uuid) to service_role;
grant execute on function public.spend_credits(uuid, int, text, uuid) to service_role;
grant execute on function public.grant_credits(uuid, int, text, uuid, timestamptz) to service_role;
grant execute on function public.renew_plan_credits(uuid, int, timestamptz, uuid) to service_role;
