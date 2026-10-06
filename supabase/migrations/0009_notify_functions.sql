-- 0009_notify_functions: the database side of notify.send (docs/handover.md, module 5;
-- docs/contracts.md, section 4). service_role only. Errors use custom SQLSTATEs that notify.send
-- maps to API error codes: PA404 not_found, PA409 whatsapp_not_connected.

-- Who and where to send: the conversation's contact and the active WhatsApp connection for its
-- channel. For test messages (p_to set), the contact is found or created for that number and tagged
-- 'test', with a conversation on the business's active connection.
create function public.notify_target(
  p_tenant_id uuid, p_conversation_id uuid default null, p_to text default null
)
returns table (
  connection_id uuid, conversation_id uuid, contact_id uuid, to_phone text, opted_out boolean,
  last_customer_msg_at timestamptz, language text, recent_test_messages int
)
language plpgsql
set search_path = ''
as $$
declare
  v_connection_id uuid;
  v_channel_id uuid;
  v_conversation_id uuid := p_conversation_id;
  v_contact_id uuid;
begin
  if (p_conversation_id is null) = (p_to is null) then
    raise exception 'notify_target: pass either a conversation or a number' using errcode = 'P0001';
  end if;

  if p_conversation_id is not null then
    select c.channel_id, c.contact_id into v_channel_id, v_contact_id
    from public.conversations c
    where c.id = p_conversation_id and c.tenant_id = p_tenant_id;
    if not found then
      raise exception 'notify_target: conversation not found' using errcode = 'PA404';
    end if;
    select w.id into v_connection_id
    from public.whatsapp_connections w
    where w.tenant_id = p_tenant_id and w.channel_id = v_channel_id and w.status = 'active';
  else
    if p_to !~ '^\+[1-9][0-9]{7,14}$' then
      raise exception 'notify_target: % is not an E.164 number', p_to using errcode = 'P0001';
    end if;
    select w.id, w.channel_id into v_connection_id, v_channel_id
    from public.whatsapp_connections w
    where w.tenant_id = p_tenant_id and w.status = 'active'
    order by w.created_at
    limit 1;
  end if;
  if v_connection_id is null then
    raise exception 'notify_target: no active WhatsApp connection' using errcode = 'PA409';
  end if;

  if p_to is not null then
    insert into public.contacts as ct (tenant_id, phone, tags)
    values (p_tenant_id, p_to, array['test'])
    on conflict (tenant_id, phone) do update
      set tags = case when 'test' = any(ct.tags) then ct.tags else array_append(ct.tags, 'test') end
    returning ct.id into v_contact_id;

    select c.id into v_conversation_id
    from public.conversations c
    where c.tenant_id = p_tenant_id and c.contact_id = v_contact_id and c.channel_id = v_channel_id
    order by c.created_at desc
    limit 1;
    if v_conversation_id is null then
      insert into public.conversations (tenant_id, contact_id, channel_id)
      values (p_tenant_id, v_contact_id, v_channel_id)
      returning id into v_conversation_id;
    end if;
  end if;

  return query
    select v_connection_id, c.id, ct.id, ct.phone, ct.opted_out_at is not null,
           c.last_customer_msg_at, ct.language,
           (select count(*)::int from public.audit_logs a
             where a.tenant_id = p_tenant_id and a.action = 'test_message.sent'
               and a.created_at > now() - interval '1 hour')
    from public.conversations c join public.contacts ct on ct.id = c.contact_id
    where c.id = v_conversation_id and c.tenant_id = p_tenant_id;
end
$$;

-- The newest approved version of a template (name_vN) on a connection, in the contact's language
-- when one exists, otherwise English.
create function public.notify_template(p_connection_id uuid, p_base_name text, p_language text default 'en')
returns table (name text, language text, category text)
language sql stable
set search_path = ''
as $$
  select t.name, t.language, t.category
  from public.whatsapp_templates t
  where t.connection_id = p_connection_id
    and t.status = 'approved'
    and t.name ~ ('^' || p_base_name || '_v[0-9]+$')
    and t.language in (coalesce(p_language, 'en'), 'en')
  order by (t.language = coalesce(p_language, 'en')) desc,
           substring(t.name from '_v([0-9]+)$')::int desc
  limit 1
$$;

-- Records a sent message and its audit entry in one transaction. Never stores a phone number in the
-- audit diff.
create function public.notify_record(
  p_tenant_id uuid, p_message_id uuid, p_conversation_id uuid, p_sender text, p_body text,
  p_template_name text, p_provider_msg_id text, p_credits int, p_actor text, p_kind text
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  insert into public.messages
    (id, tenant_id, conversation_id, direction, sender, body, template_name, provider_msg_id,
     delivery_status, credits_charged)
  values
    (p_message_id, p_tenant_id, p_conversation_id, 'out', p_sender, p_body, p_template_name,
     p_provider_msg_id, 'accepted', p_credits);

  insert into public.audit_logs (tenant_id, actor, action, entity, entity_id, diff)
  values (p_tenant_id, p_actor, p_kind || '.sent', 'message', p_message_id,
          jsonb_build_object('kind', p_kind, 'template', p_template_name, 'credits', p_credits));
end
$$;

revoke execute on function public.notify_target(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.notify_template(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.notify_record(uuid, uuid, uuid, text, text, text, text, int, text, text) from public, anon, authenticated;
grant execute on function public.notify_target(uuid, uuid, text) to service_role;
grant execute on function public.notify_template(uuid, text, text) to service_role;
grant execute on function public.notify_record(uuid, uuid, uuid, text, text, text, text, int, text, text) to service_role;
