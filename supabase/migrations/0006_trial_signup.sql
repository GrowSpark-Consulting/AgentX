-- 0006_trial_signup: create a funded trial business in one transaction (docs/handover.md,
-- module 8; 9-day plan, Day 2: "signup creates a tenant in trial with trial_ends_at in 7 days,
-- plan trial, a 300-credit trial_grant and a TRIAL-xxxx route code").
--
-- The server calls this as service_role after verifying the signed-up user's session; the user id
-- comes from that session, never from the browser.
--   * One self-serve business per account. A repeat call for a user whose business is still in
--     trial returns that business (double-click, retry after a timeout); calls for one user are
--     serialised, so two at once cannot both create a business.
--   * service_role cannot read auth.users, so an unknown user is caught by the memberships foreign key.
--   * Trial credits come from plans.monthly_credits for 'trial' and expire with the trial, as does
--     the route code. An expired trial code can be handed to a new business.

create function public.create_trial_tenant(
  p_user_id uuid, p_name text, p_vertical text, p_timezone text default 'Asia/Kolkata'
)
returns table (tenant_id uuid, route_code text, trial_ends_at timestamptz, created boolean)
language plpgsql
set search_path = ''
as $$
declare
  v_tenant_id uuid;
  v_status text;
  v_trial_ends_at timestamptz := now() + interval '7 days';
  v_timezone text := coalesce(p_timezone, 'Asia/Kolkata');
  v_credits int;
  v_version int;
  v_code text;
  v_bytes bytea;
  -- no 0/O, 1/I/L: codes are typed into WhatsApp by hand
  v_alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
begin
  if p_user_id is null then
    raise exception 'create_trial_tenant: user id is required';
  end if;
  if p_name is null or btrim(p_name) = '' then
    raise exception 'create_trial_tenant: business name is required';
  end if;
  -- Same rule as PackDefinition.key in packages/types/src/pack.ts.
  if p_vertical is null or p_vertical !~ '^[a-z][a-z0-9-]*$' then
    raise exception 'create_trial_tenant: vertical must be a pack key (lowercase letters, digits and hyphens)';
  end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = v_timezone) then
    raise exception 'create_trial_tenant: % is not a time zone name such as Asia/Kolkata', v_timezone;
  end if;
  -- Until the pack loader has written vertical_packs, any well-formed key is accepted.
  if exists (select 1 from public.vertical_packs)
     and not exists (select 1 from public.vertical_packs where key = p_vertical and active) then
    raise exception 'create_trial_tenant: % is not an active pack', p_vertical;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('create_trial_tenant:' || p_user_id::text, 0));

  select t.id, t.status into v_tenant_id, v_status
  from public.memberships m join public.tenants t on t.id = m.tenant_id
  where m.user_id = p_user_id and m.role = 'owner'
  order by t.created_at
  limit 1;
  if v_tenant_id is not null then
    if v_status <> 'trial' then
      raise exception 'create_trial_tenant: this account already owns a business';
    end if;
    return query
      select t.id, r.code, t.trial_ends_at, false
      from public.tenants t
      left join public.route_codes r on r.tenant_id = t.id and r.kind = 'trial'
      where t.id = v_tenant_id
      limit 1;
    return;
  end if;

  select monthly_credits into v_credits from public.plans where key = 'trial';
  if v_credits is null then
    raise exception 'create_trial_tenant: the trial plan is missing from plans';
  end if;
  select max(version) into v_version from public.vertical_packs where key = p_vertical and active;

  insert into public.tenants (name, vertical, vertical_version, timezone, status, plan_key, trial_ends_at)
  values (btrim(p_name), p_vertical, coalesce(v_version, 1), v_timezone, 'trial', 'trial', v_trial_ends_at)
  returning id into v_tenant_id;

  begin
    insert into public.memberships (tenant_id, user_id, role) values (v_tenant_id, p_user_id, 'owner');
  exception when foreign_key_violation then
    raise exception 'create_trial_tenant: unknown user %', p_user_id;
  end;

  perform public.grant_credits(v_tenant_id, v_credits, 'trial_grant', null, v_trial_ends_at);

  for attempt in 1..20 loop
    v_bytes := uuid_send(gen_random_uuid());  -- strong randomness without pgcrypto
    v_code := 'TRIAL-'
      || substr(v_alphabet, 1 + get_byte(v_bytes, 0) % 31, 1)
      || substr(v_alphabet, 1 + get_byte(v_bytes, 1) % 31, 1)
      || substr(v_alphabet, 1 + get_byte(v_bytes, 2) % 31, 1)
      || substr(v_alphabet, 1 + get_byte(v_bytes, 3) % 31, 1);
    insert into public.route_codes as r (code, kind, tenant_id, expires_at)
    values (v_code, 'trial', v_tenant_id, v_trial_ends_at)
    on conflict (code) do update
      set tenant_id = excluded.tenant_id, expires_at = excluded.expires_at
      where r.kind = 'trial' and r.expires_at < now();
    exit when found;
    v_code := null;
  end loop;
  if v_code is null then
    raise exception 'create_trial_tenant: could not find a free route code';
  end if;

  return query select v_tenant_id, v_code, v_trial_ends_at, true;
end
$$;

revoke execute on function public.create_trial_tenant(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.create_trial_tenant(uuid, text, text, text) to service_role;
