-- 0018_agent_merge_functions: atomic merges for what the message pipeline writes (docs/contracts.md, section 5).
-- service_role only. Both used to be a read followed by a write of the whole column from the server, which
-- loses data: a member's edit of a lead's answers in the dashboard, a message's other meta, or another run's
-- keys written between the read and the write were overwritten. Each is now one statement, filtered by business.
--
-- 1. merge_lead_fields: adds the patch's keys to leads.fields (a key already there is replaced, every other key
--    is kept), and can move a new lead to engaged in the same statement. True when the lead is the business's.
-- 2. merge_message_agent_meta: adds the keys to messages.meta.agent, leaving the rest of the meta (a tapped
--    button's id) and the other keys of `agent` alone. True when the message is the business's and conversation's.
-- Errors: P0001 invalid input (not an object, or larger than 16 KB).

create function public.merge_lead_fields(p_tenant_id uuid, p_lead_id uuid, p_patch jsonb, p_engage boolean default false)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_rows int;
begin
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'merge_lead_fields: the patch must be a JSON object' using errcode = 'P0001';
  end if;
  if octet_length(p_patch::text) > 16384 then
    raise exception 'merge_lead_fields: the patch is too large' using errcode = 'P0001';
  end if;

  update public.leads l
     set fields = coalesce(l.fields, '{}'::jsonb) || p_patch,
         stage = case when p_engage and l.stage = 'new' then 'engaged' else l.stage end
   where l.id = p_lead_id and l.tenant_id = p_tenant_id;
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end
$$;

create function public.merge_message_agent_meta(p_tenant_id uuid, p_conversation_id uuid, p_message_id uuid, p_agent jsonb)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_rows int;
begin
  if p_agent is null or jsonb_typeof(p_agent) <> 'object' then
    raise exception 'merge_message_agent_meta: the value must be a JSON object' using errcode = 'P0001';
  end if;
  if octet_length(p_agent::text) > 16384 then
    raise exception 'merge_message_agent_meta: the value is too large' using errcode = 'P0001';
  end if;

  update public.messages m
     set meta = coalesce(m.meta, '{}'::jsonb)
                || jsonb_build_object('agent', coalesce(m.meta -> 'agent', '{}'::jsonb) || p_agent)
   where m.id = p_message_id and m.tenant_id = p_tenant_id and m.conversation_id = p_conversation_id;
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end
$$;

-- Server only. Supabase grants new functions to anon and authenticated by default.
revoke execute on function public.merge_lead_fields(uuid, uuid, jsonb, boolean) from public, anon, authenticated;
revoke execute on function public.merge_message_agent_meta(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.merge_lead_fields(uuid, uuid, jsonb, boolean) to service_role;
grant execute on function public.merge_message_agent_meta(uuid, uuid, uuid, jsonb) to service_role;
