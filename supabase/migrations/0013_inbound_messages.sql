-- 0013_inbound_messages: the database side of the WhatsApp webhook POST route (docs/handover.md, module 1,
-- "Webhooks", and the message pipeline). service_role only. Errors use custom SQLSTATEs the route can read:
-- P0001 invalid input, PA404 channel not found for the business, PA409 message id owned by another business.
--
-- 1. messages.kind and messages.meta: what an inbound message is (text, interactive, image, audio, location,
--    document, or unsupported) and what does not fit a column (an interactive reply's button id, the
--    original type of an unsupported message). Both are null on rows that exist now and on outbound rows.
-- 2. One open conversation per contact and channel. Two messages for a new contact arriving at the same
--    time would otherwise each create one. Older duplicates are closed (never deleted) before the index.
-- 3. store_inbound_message: contact, open conversation and message in one transaction. Replays change
--    nothing and return the stored ids.
-- 4. apply_message_status: a delivery status for one business's outbound message, never moving backwards.

-- messages.kind, messages.meta ------------------------------------------------------------------------

alter table public.messages
  add column kind text
    constraint messages_kind_check check (kind in ('text', 'interactive', 'image', 'audio', 'location', 'document', 'unsupported')),
  add column meta jsonb;

-- One open conversation per contact and channel -----------------------------------------------------------

-- Keep the one with the latest activity open and close the rest. Closed conversations keep their messages.
update public.conversations c
   set status = 'closed'
  from (
    select id, row_number() over (
             partition by tenant_id, contact_id, channel_id
             order by coalesce(last_message_at, last_customer_msg_at, created_at) desc, created_at desc, id
           ) as rn
      from public.conversations
     where status = 'open'
  ) d
 where c.id = d.id and d.rn > 1;

create unique index conversations_one_open_idx
  on public.conversations (tenant_id, contact_id, channel_id)
  where status = 'open';

-- store_inbound_message ---------------------------------------------------------------------------------

-- The business comes from the verified connection, never from the payload. p_sent_at is Meta's time; it is
-- capped at now() so a wrong clock cannot reorder the inbox or stretch the 24-hour window. A name is only
-- filled in, never overwritten. A replay (the same provider message id) changes nothing and returns the ids
-- of the stored message, so the caller can queue the same event again.
create function public.store_inbound_message(
  p_tenant_id uuid, p_channel_id uuid, p_phone text, p_name text, p_provider_msg_id text,
  p_kind text, p_body text, p_media jsonb, p_meta jsonb, p_sent_at timestamptz
)
returns table (conversation_id uuid, message_id uuid, inserted boolean)
language plpgsql
set search_path = ''
as $$
declare
  v_contact_id uuid;
  v_conversation_id uuid;
  v_message_id uuid;
  v_existing record;
  v_at timestamptz := least(p_sent_at, now());
begin
  if p_phone is null or p_phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'store_inbound_message: not an E.164 number' using errcode = 'P0001';
  end if;
  if p_kind is null or p_kind not in ('text', 'interactive', 'image', 'audio', 'location', 'document', 'unsupported') then
    raise exception 'store_inbound_message: unknown kind' using errcode = 'P0001';
  end if;
  if p_provider_msg_id is null or p_provider_msg_id = '' or p_sent_at is null then
    raise exception 'store_inbound_message: provider message id and time are required' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.channels ch where ch.id = p_channel_id and ch.tenant_id = p_tenant_id) then
    raise exception 'store_inbound_message: channel not found' using errcode = 'PA404';
  end if;

  -- A replay: answer with what is stored, before touching anything else (a closed conversation must not
  -- get an empty open one because a message arrived twice).
  select m.id as id, m.conversation_id as conversation_id, m.tenant_id as tenant_id into v_existing
    from public.messages m where m.provider_msg_id = p_provider_msg_id;
  if found then
    if v_existing.tenant_id <> p_tenant_id then
      raise exception 'store_inbound_message: message id belongs to another business' using errcode = 'PA409';
    end if;
    return query select v_existing.conversation_id, v_existing.id, false;
    return;
  end if;

  insert into public.contacts as ct (tenant_id, phone, name)
  values (p_tenant_id, p_phone, nullif(btrim(p_name), ''))
  on conflict (tenant_id, phone) do update set name = coalesce(ct.name, excluded.name)
  returning ct.id into v_contact_id;

  select c.id into v_conversation_id
    from public.conversations c
   where c.tenant_id = p_tenant_id and c.contact_id = v_contact_id and c.channel_id = p_channel_id and c.status = 'open';
  if v_conversation_id is null then
    insert into public.conversations (tenant_id, contact_id, channel_id)
    values (p_tenant_id, v_contact_id, p_channel_id)
    on conflict (tenant_id, contact_id, channel_id) where status = 'open' do nothing
    returning id into v_conversation_id;
    if v_conversation_id is null then
      -- Another session created it first (the index made this insert wait for it): use theirs.
      select c.id into v_conversation_id
        from public.conversations c
       where c.tenant_id = p_tenant_id and c.contact_id = v_contact_id and c.channel_id = p_channel_id and c.status = 'open';
    end if;
  end if;

  insert into public.messages
    (tenant_id, conversation_id, direction, sender, kind, body, media, meta, provider_msg_id, created_at)
  values
    (p_tenant_id, v_conversation_id, 'in', 'customer', p_kind, p_body, p_media, coalesce(p_meta, '{}'::jsonb),
     p_provider_msg_id, v_at)
  on conflict (provider_msg_id) do nothing
  returning id into v_message_id;
  if v_message_id is null then
    -- The same message arrived in another session at the same time.
    select m.id as id, m.conversation_id as conversation_id, m.tenant_id as tenant_id into v_existing
      from public.messages m where m.provider_msg_id = p_provider_msg_id;
    if not found or v_existing.tenant_id <> p_tenant_id then
      raise exception 'store_inbound_message: message id belongs to another business' using errcode = 'PA409';
    end if;
    return query select v_existing.conversation_id, v_existing.id, false;
    return;
  end if;

  update public.conversations c
     set last_customer_msg_at = greatest(coalesce(c.last_customer_msg_at, v_at), v_at)
   where c.id = v_conversation_id and c.tenant_id = p_tenant_id;

  return query select v_conversation_id, v_message_id, true;
end
$$;

-- apply_message_status ----------------------------------------------------------------------------------

-- Only outbound messages of the business, and only forwards: accepted < sent < delivered < read. A failure
-- replaces accepted and sent; a later delivered or read replaces a failure (the stronger, later fact).
-- True when a row changed. An unknown message id changes nothing.
create function public.apply_message_status(p_tenant_id uuid, p_provider_msg_id text, p_status text)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_rank numeric := case p_status when 'sent' then 1 when 'failed' then 1.5 when 'delivered' then 2 when 'read' then 3 end;
  v_changed int;
begin
  if v_rank is null then
    raise exception 'apply_message_status: unknown status' using errcode = 'P0001';
  end if;
  update public.messages m
     set delivery_status = p_status
   where m.tenant_id = p_tenant_id
     and m.provider_msg_id = p_provider_msg_id
     and m.direction = 'out'
     and (case m.delivery_status when 'accepted' then 0 when 'sent' then 1 when 'failed' then 1.5
                                 when 'delivered' then 2 when 'read' then 3 else -1 end) < v_rank;
  get diagnostics v_changed = row_count;
  return v_changed > 0;
end
$$;

-- Server only. Supabase grants new functions to anon and authenticated by default.
revoke execute on function public.store_inbound_message(uuid, uuid, text, text, text, text, text, jsonb, jsonb, timestamptz)
  from public, anon, authenticated;
grant execute on function public.store_inbound_message(uuid, uuid, text, text, text, text, text, jsonb, jsonb, timestamptz)
  to service_role;
revoke execute on function public.apply_message_status(uuid, text, text) from public, anon, authenticated;
grant execute on function public.apply_message_status(uuid, text, text) to service_role;
