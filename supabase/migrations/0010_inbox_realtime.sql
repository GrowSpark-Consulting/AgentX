-- 0010_inbox_realtime: what the dashboard inbox needs from the database (docs/handover.md, module 9
-- "Inbox: realtime list and chat"; docs/dashboard-screen-contracts.md, Inbox).
--
-- 1. Realtime. The inbox subscribes to row changes on messages, conversations and handoffs. Supabase
--    Realtime only sends changes for tables in the `supabase_realtime` publication, and none were
--    added before this migration. Realtime still applies each subscriber's RLS (tenant_read,
--    is_member), so a member only receives their own business's rows. Nothing here changes a policy.
--
-- 2. conversations.last_message_at. The inbox lists chats by latest activity. Until now that meant
--    reading the newest message of every conversation. This column holds the newest message's
--    created_at, kept by a trigger on messages, so a list can be ordered and paged in the database.
--    Members still can't write conversations; the trigger runs as whoever inserts the message
--    (today only server code: notify_record and, later, the webhook).

-- Realtime publication ----------------------------------------------------------------------------

do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  -- A publication FOR ALL TABLES already includes them (and refuses ADD TABLE).
  if (select puballtables from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;
  foreach t in array array['messages', 'conversations', 'handoffs'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end
$$;

-- conversations.last_message_at -------------------------------------------------------------------

alter table public.conversations add column last_message_at timestamptz;

update public.conversations c
   set last_message_at = m.latest
  from (select conversation_id, max(created_at) as latest from public.messages group by conversation_id) m
 where m.conversation_id = c.id;

create index conversations_tenant_last_message_idx
  on public.conversations (tenant_id, last_message_at desc nulls last);

-- Only moves forward, so a late or replayed insert of an older message never rewinds the list order.
create function public.conversations_touch_last_message() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  update public.conversations c
     set last_message_at = new.created_at
   where c.id = new.conversation_id
     and c.tenant_id = new.tenant_id
     and (c.last_message_at is null or c.last_message_at < new.created_at);
  return null;
end
$$;

create trigger messages_touch_conversation
  after insert or update of created_at on public.messages
  for each row execute function public.conversations_touch_last_message();
