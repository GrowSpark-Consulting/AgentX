-- 0021_consent_functions: the two consent writes the message pipeline makes, each in one transaction (docs/handover.md,
-- "Consent (DPDP)"). service_role only, filtered by business.
--
-- 1. record_notice_shown: the first AI reply to a contact carries a privacy notice. Sets contacts.consent_at (only if it
--    is still null) and writes consent_logs `notice_shown` (source first_message) together, so the notice is logged
--    exactly once however often the pipeline retries. True when this call recorded it.
-- 2. record_opt_out: the customer sent STOP (or an equivalent). Sets contacts.opted_out_at (only if it is still null)
--    and writes consent_logs `opted_out` together. True when this call opted the contact out; false for a contact that
--    already was (nothing is written twice) or is not the business's.
-- Errors: P0001 for a source that is not one of the four the table documents.

create function public.record_notice_shown(p_tenant_id uuid, p_contact_id uuid, p_message_id uuid default null)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_rows int;
begin
  update public.contacts c
     set consent_at = now()
   where c.id = p_contact_id and c.tenant_id = p_tenant_id and c.consent_at is null;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return false;
  end if;
  insert into public.consent_logs (tenant_id, contact_id, event, source, message_id)
  values (p_tenant_id, p_contact_id, 'notice_shown', 'first_message', p_message_id);
  return true;
end
$$;

create function public.record_opt_out(p_tenant_id uuid, p_contact_id uuid, p_source text, p_message_id uuid default null)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_rows int;
begin
  if p_source is null or p_source not in ('stop_keyword', 'dashboard', 'admin', 'first_message') then
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

-- Server only. Supabase grants new functions to anon and authenticated by default.
revoke execute on function public.record_notice_shown(uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.record_opt_out(uuid, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.record_notice_shown(uuid, uuid, uuid) to service_role;
grant execute on function public.record_opt_out(uuid, uuid, text, uuid) to service_role;
