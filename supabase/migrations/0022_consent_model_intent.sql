-- 0022_consent_model_intent: record_opt_out also accepts the source `model_intent`: the customer did not type a STOP
-- phrase, but the model read a clear request to stop and the code (confidence at least 0.8) opted them out
-- (Raja's decision, 9 Oct). consent_logs.source is free text, so only the function's list of sources changes.
-- Same signature, so the grants of 0021 stay; they are repeated here so nothing depends on that.

create or replace function public.record_opt_out(p_tenant_id uuid, p_contact_id uuid, p_source text, p_message_id uuid default null)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_rows int;
begin
  if p_source is null or p_source not in ('stop_keyword', 'model_intent', 'dashboard', 'admin', 'first_message') then
    raise exception 'record_opt_out: unknown source' using errcode = 'P0001';
  end if;
  update public.contacts c
     set opted_out_at = now()
   where c.id = p_contact_id and c.tenant_id = p_tenant_id and c.opted_out_at is null;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return false;
  end if;
  insert into public.consent_logs (tenant_id, contact_id, event, source, message_id)
  values (p_tenant_id, p_contact_id, 'opted_out', p_source, p_message_id);
  return true;
end
$$;

revoke execute on function public.record_opt_out(uuid, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.record_opt_out(uuid, uuid, text, uuid) to service_role;
