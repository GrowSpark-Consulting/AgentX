-- Inbox tables: tenant isolation, member write lockdown, Realtime publication and last_message_at
-- (0010). Run: pnpm db:test
begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

-- Fixtures, inserted as the migration owner (bypasses RLS): two businesses, one owner each, one
-- conversation per business with a message from each sender and one handoff.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000001a0', 'inbox-a@test.local'),
  ('00000000-0000-0000-0000-0000000001b0', 'inbox-b@test.local');
insert into public.tenants (id, name, vertical) values
  ('c0000000-0000-0000-0000-00000000000a', 'Inbox A', 'test-pack'),
  ('c0000000-0000-0000-0000-00000000000b', 'Inbox B', 'test-pack');
insert into public.memberships (tenant_id, user_id, role) values
  ('c0000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000001a0', 'owner'),
  ('c0000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000001b0', 'owner');
insert into public.contacts (id, tenant_id, phone, name) values
  ('c1000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-00000000000a', '+919800000101', 'Customer A'),
  ('c1000000-0000-0000-0000-00000000000b', 'c0000000-0000-0000-0000-00000000000b', '+919800000102', 'Customer B');
insert into public.channels (id, tenant_id, type) values
  ('c2000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-00000000000a', 'whatsapp'),
  ('c2000000-0000-0000-0000-00000000000b', 'c0000000-0000-0000-0000-00000000000b', 'whatsapp');
insert into public.conversations (id, tenant_id, contact_id, channel_id, last_customer_msg_at) values
  ('c3000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-00000000000a',
   'c1000000-0000-0000-0000-00000000000a', 'c2000000-0000-0000-0000-00000000000a', '2026-10-07 09:00+05:30'),
  ('c3000000-0000-0000-0000-00000000000b', 'c0000000-0000-0000-0000-00000000000b',
   'c1000000-0000-0000-0000-00000000000b', 'c2000000-0000-0000-0000-00000000000b', '2026-10-07 09:00+05:30');
insert into public.messages (id, tenant_id, conversation_id, direction, sender, body, created_at) values
  ('c4000000-0000-0000-0000-0000000000a1', 'c0000000-0000-0000-0000-00000000000a', 'c3000000-0000-0000-0000-00000000000a',
   'in', 'customer', 'Hi from A', '2026-10-07 09:00+05:30'),
  ('c4000000-0000-0000-0000-0000000000a2', 'c0000000-0000-0000-0000-00000000000a', 'c3000000-0000-0000-0000-00000000000a',
   'out', 'ai', 'Reply to A', '2026-10-07 09:01+05:30'),
  ('c4000000-0000-0000-0000-0000000000b1', 'c0000000-0000-0000-0000-00000000000b', 'c3000000-0000-0000-0000-00000000000b',
   'in', 'customer', 'Hi from B', '2026-10-07 09:00+05:30');
insert into public.handoffs (id, tenant_id, conversation_id, trigger, priority) values
  ('c5000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-00000000000a', 'c3000000-0000-0000-0000-00000000000a', 'asked_human', 'high'),
  ('c5000000-0000-0000-0000-00000000000b', 'c0000000-0000-0000-0000-00000000000b', 'c3000000-0000-0000-0000-00000000000b', 'complaint', 'high');

-- Realtime publication and last_message_at (0010) -------------------------------------------------

select is(
  (select array_agg(tablename::text order by tablename) from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename in ('messages', 'conversations', 'handoffs')),
  array['conversations', 'handoffs', 'messages'],
  'messages, conversations and handoffs are in the supabase_realtime publication');

select is(
  (select last_message_at from public.conversations where id = 'c3000000-0000-0000-0000-00000000000a'),
  '2026-10-07 09:01+05:30'::timestamptz,
  'last_message_at follows the newest message');

insert into public.messages (tenant_id, conversation_id, direction, sender, body, created_at) values
  ('c0000000-0000-0000-0000-00000000000a', 'c3000000-0000-0000-0000-00000000000a', 'in', 'customer', 'Late replay',
   '2026-10-07 08:00+05:30');
select is(
  (select last_message_at from public.conversations where id = 'c3000000-0000-0000-0000-00000000000a'),
  '2026-10-07 09:01+05:30'::timestamptz,
  'an older message never moves last_message_at back');
-- Remove the replay so the counts below stay simple.
delete from public.messages where body = 'Late replay';

-- Owner A, the way PostgREST and Realtime act for a signed-in dashboard user ----------------------

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000001a0","role":"authenticated"}', true);

select results_eq('select id from public.conversations',
  array['c3000000-0000-0000-0000-00000000000a'::uuid], 'a member reads their own conversations');
select is((select count(*) from public.messages), 2::bigint, 'a member reads their own messages');
select results_eq('select name from public.contacts', array['Customer A'], 'a member reads their own contacts');
select results_eq('select id from public.handoffs',
  array['c5000000-0000-0000-0000-00000000000a'::uuid], 'a member reads their own handoffs');
select ok((select last_message_at is not null from public.conversations), 'a member can read last_message_at');

select is((select count(*) from public.conversations where tenant_id = 'c0000000-0000-0000-0000-00000000000b'),
  0::bigint, 'a member cannot read another business''s conversations');
select is((select count(*) from public.messages where conversation_id = 'c3000000-0000-0000-0000-00000000000b'),
  0::bigint, 'a member cannot read another business''s messages');
select is((select count(*) from public.contacts where tenant_id = 'c0000000-0000-0000-0000-00000000000b'),
  0::bigint, 'a member cannot read another business''s contacts');
select is((select count(*) from public.handoffs where tenant_id = 'c0000000-0000-0000-0000-00000000000b'),
  0::bigint, 'a member cannot read another business''s handoffs');

-- No member write policies on these tables (0001/0002): inserts fail, updates and deletes match no rows.
select throws_ok(
  $$insert into public.conversations (tenant_id, contact_id, channel_id)
    values ('c0000000-0000-0000-0000-00000000000a', 'c1000000-0000-0000-0000-00000000000a', 'c2000000-0000-0000-0000-00000000000a')$$,
  '42501', null, 'a member cannot create a conversation');
select throws_ok(
  $$insert into public.messages (tenant_id, conversation_id, direction, sender, body)
    values ('c0000000-0000-0000-0000-00000000000a', 'c3000000-0000-0000-0000-00000000000a', 'out', 'staff', 'forged')$$,
  '42501', null, 'a member cannot insert a message (sends go through notify.send)');
select throws_ok(
  $$insert into public.handoffs (tenant_id, conversation_id, trigger, priority)
    values ('c0000000-0000-0000-0000-00000000000a', 'c3000000-0000-0000-0000-00000000000a', 'stuck', 'low')$$,
  '42501', null, 'a member cannot open a handoff');
select throws_ok(
  $$insert into public.messages (tenant_id, conversation_id, direction, sender, body)
    values ('c0000000-0000-0000-0000-00000000000b', 'c3000000-0000-0000-0000-00000000000b', 'in', 'customer', 'forged')$$,
  '42501', null, 'a member cannot insert into another business''s conversation');

-- Attempts that RLS turns into no-ops; checked after switching back to the owner below.
update public.conversations set mode = 'human', last_message_at = now();
update public.messages set body = 'edited';
update public.handoffs set resolved_at = now();
delete from public.messages;
delete from public.conversations where id = 'c3000000-0000-0000-0000-00000000000b';

-- Owner B sees only B ------------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000001b0","role":"authenticated"}', true);

select results_eq('select id from public.conversations',
  array['c3000000-0000-0000-0000-00000000000b'::uuid], 'the other business sees only its own conversation');
select results_eq('select body from public.messages', array['Hi from B'], 'the other business sees only its own messages');

-- Signed out ----------------------------------------------------------------------------------------

reset role;
set local role anon;
select is((select count(*) from public.conversations), 0::bigint, 'signed-out visitors see no conversations');
select is((select count(*) from public.messages), 0::bigint, 'signed-out visitors see no messages');
select is((select count(*) from public.handoffs), 0::bigint, 'signed-out visitors see no handoffs');

-- Back as the migration owner: the write attempts above changed nothing ------------------------------

reset role;
select is((select mode from public.conversations where id = 'c3000000-0000-0000-0000-00000000000a'),
  'ai', 'a member cannot switch a conversation''s mode directly');
select is((select count(*) from public.messages where body = 'edited'), 0::bigint, 'a member cannot edit messages');
select is((select count(*) from public.messages), 3::bigint, 'a member cannot delete messages');
select ok((select resolved_at is null from public.handoffs where id = 'c5000000-0000-0000-0000-00000000000a'),
  'a member cannot resolve a handoff directly');
select ok(exists (select 1 from public.conversations where id = 'c3000000-0000-0000-0000-00000000000b'),
  'a member cannot delete another business''s conversation');

select * from finish();
rollback;
