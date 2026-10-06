-- 0008_credit_refunds: give back credits spent on a message that was never sent (docs/contracts.md,
-- decision 2). notify.send spends with the message id as ref_id before calling the adapter; if the
-- send fails, it calls refund_credits with the same id.
--
-- A refund mirrors the spend rows for that ref_id into the same buckets (same expires_at), so the
-- credits come back with their original expiry. A second refund for the same ref_id returns 0.

create function public.refund_credits(p_tenant_id uuid, p_ref_id uuid)
returns int
language plpgsql
set search_path = ''
as $$
declare
  v_total int := 0;
  b record;
begin
  if p_ref_id is null then
    raise exception 'refund_credits: ref_id is required';
  end if;

  perform 1 from public.tenants where id = p_tenant_id for update;
  if not found then
    raise exception 'refund_credits: unknown tenant %', p_tenant_id;
  end if;

  if exists (
    select 1 from public.credit_ledger
    where tenant_id = p_tenant_id and ref_id = p_ref_id and reason = 'refund'
  ) then
    return 0;
  end if;

  for b in
    select expires_at, -sum(delta) as spent
    from public.credit_ledger
    where tenant_id = p_tenant_id and ref_id = p_ref_id and delta < 0
      and reason in ('ai_reply', 'template_utility', 'template_marketing', 'staff_alert', 'admin')
    group by expires_at
  loop
    insert into public.credit_ledger (tenant_id, delta, reason, ref_id, expires_at)
    values (p_tenant_id, b.spent, 'refund', p_ref_id, b.expires_at);
    v_total := v_total + b.spent;
  end loop;

  return v_total;
end
$$;

revoke execute on function public.refund_credits(uuid, uuid) from public, anon, authenticated;
grant execute on function public.refund_credits(uuid, uuid) to service_role;
