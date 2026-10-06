-- notify.send's database functions (0009). Run: pnpm db:test
begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

insert into public.tenants (id, name, vertical) values
  ('b0000000-0000-0000-0000-000000000001', 'Notify', 'test-pack'),
  ('b0000000-0000-0000-0000-000000000002', 'Notify Other', 'test-pack'),
  ('b0000000-0000-0000-0000-000000000003', 'Not Connected', 'test-pack');
insert into public.channels (id, tenant_id, type) values
  ('b1000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'whatsapp'),
  ('b1000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002', 'whatsapp');
insert into public.whatsapp_connections
  (id, tenant_id, channel_id, method, waba_id, phone_number_id, token_enc, token_type, connected_by, status) values
  ('b2000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001',
   'manual_byo', 'n-waba-1', 'n-pnid-1', 'placeholder', 'system_user', 'admin:test', 'active'),
  ('b2000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000002',
   'manual_byo', 'n-waba-2', 'n-pnid-2', 'placeholder', 'system_user', 'admin:test', 'active');
insert into public.contacts (id, tenant_id, phone, language, opted_out_at) values
  ('b3000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '+919800000001', 'ta', null),
  ('b3000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', '+919800000002', 'en', now());
insert into public.conversations (id, tenant_id, contact_id, channel_id, last_customer_msg_at) values
  ('b4000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'b3000000-0000-0000-0000-000000000001',
   'b1000000-0000-0000-0000-000000000001', now() - interval '1 hour'),
  ('b4000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 'b3000000-0000-0000-0000-000000000002',
   'b1000000-0000-0000-0000-000000000001', null);
insert into public.whatsapp_templates (tenant_id, connection_id, name, language, category, components, status) values
  ('b0000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001', 'reminder_24h_v1', 'en', 'utility', '{}', 'approved'),
  ('b0000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001', 'reminder_24h_v2', 'en', 'utility', '{}', 'approved'),
  ('b0000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001', 'reminder_24h_v3', 'en', 'utility', '{}', 'pending'),
  ('b0000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001', 'reminder_24h_v1', 'ta', 'utility', '{}', 'approved'),
  ('b0000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001', 'nudge_v1', 'en', 'marketing', '{}', 'rejected'),
  ('b0000000-0000-0000-0000-000000000002', 'b2000000-0000-0000-0000-000000000002', 'feedback_v1', 'en', 'marketing', '{}', 'approved');
insert into public.audit_logs (tenant_id, actor, action, created_at) values
  ('b0000000-0000-0000-0000-000000000001', 'staff', 'test_message.sent', now() - interval '10 minutes'),
  ('b0000000-0000-0000-0000-000000000001', 'staff', 'test_message.sent', now() - interval '50 minutes'),
  ('b0000000-0000-0000-0000-000000000001', 'staff', 'test_message.sent', now() - interval '2 hours');

-- notify_target -----------------------------------------------------------------------------
select results_eq(
  $$select connection_id, to_phone, opted_out, last_customer_msg_at, language
    from public.notify_target('b0000000-0000-0000-0000-000000000001', 'b4000000-0000-0000-0000-000000000001')$$,
  $$values ('b2000000-0000-0000-0000-000000000001'::uuid, '+919800000001'::text, false, now() - interval '1 hour', 'ta'::text)$$,
  'a conversation resolves to its contact, window and active connection');
select is((select opted_out from public.notify_target('b0000000-0000-0000-0000-000000000001', 'b4000000-0000-0000-0000-000000000002')),
  true, 'an opted-out contact is reported');
select throws_ok($$select * from public.notify_target('b0000000-0000-0000-0000-000000000002', 'b4000000-0000-0000-0000-000000000001')$$,
  'PA404', null, 'another business''s conversation is not found');
select throws_ok($$select * from public.notify_target('b0000000-0000-0000-0000-000000000003', null, '+919800000009')$$,
  'PA409', null, 'a business with no active connection is reported as not connected');
select throws_ok($$select * from public.notify_target('b0000000-0000-0000-0000-000000000001', null, '98000 00009')$$,
  'P0001', null, 'a number that is not E.164 is rejected');
select throws_ok($$select * from public.notify_target('b0000000-0000-0000-0000-000000000001')$$,
  'P0001', null, 'a conversation or a number is required');

create temporary table t1 on commit drop as
  select * from public.notify_target('b0000000-0000-0000-0000-000000000001', null, '+919800000009');
create temporary table t2 on commit drop as
  select * from public.notify_target('b0000000-0000-0000-0000-000000000001', null, '+919800000009');
select results_eq($$select tags from public.contacts c join t1 on t1.contact_id = c.id$$, $$values (array['test'])$$,
  'a test number becomes a contact tagged test');
select results_eq($$select contact_id, conversation_id from t2$$, $$select contact_id, conversation_id from t1$$,
  'a second test message reuses the same contact and conversation');
select is((select recent_test_messages from t1), 2, 'test messages in the last hour are counted');
create temporary table t3 on commit drop as
  select * from public.notify_target('b0000000-0000-0000-0000-000000000001', null, '+919800000001');
select results_eq($$select tags from public.contacts where id = 'b3000000-0000-0000-0000-000000000001'$$, $$values (array['test'])$$,
  'an existing customer number is tagged test once');

-- notify_template ---------------------------------------------------------------------------
select results_eq($$select name, language from public.notify_template('b2000000-0000-0000-0000-000000000001', 'reminder_24h', 'en')$$,
  $$values ('reminder_24h_v2'::text, 'en'::text)$$, 'the newest approved version is chosen; pending versions are ignored');
select results_eq($$select name, language from public.notify_template('b2000000-0000-0000-0000-000000000001', 'reminder_24h', 'ta')$$,
  $$values ('reminder_24h_v1'::text, 'ta'::text)$$, 'the contact''s language wins over a newer English version');
select is((select count(*) from public.notify_template('b2000000-0000-0000-0000-000000000001', 'nudge', 'en'))
         + (select count(*) from public.notify_template('b2000000-0000-0000-0000-000000000001', 'feedback', 'en')),
  0::bigint, 'rejected templates and other connections'' templates are never used');

-- notify_record -----------------------------------------------------------------------------
select public.notify_record('b0000000-0000-0000-0000-000000000001', 'b5000000-0000-0000-0000-000000000001',
  'b4000000-0000-0000-0000-000000000001', 'ai', 'Hello', null, 'wamid.1', 1, 'ai', 'ai_reply');
select results_eq(
  $$select m.direction, m.sender, m.delivery_status, m.credits_charged, a.action, a.diff ? 'phone'
    from public.messages m join public.audit_logs a on a.entity_id = m.id
    where m.id = 'b5000000-0000-0000-0000-000000000001'$$,
  $$values ('out'::text, 'ai'::text, 'accepted'::text, 1, 'ai_reply.sent'::text, false)$$,
  'a sent message is recorded with its audit entry, without a phone number');

select ok(not has_function_privilege('authenticated', 'public.notify_target(uuid, uuid, text)', 'execute')
      and not has_function_privilege('authenticated', 'public.notify_template(uuid, text, text)', 'execute')
      and not has_function_privilege('authenticated', 'public.notify_record(uuid, uuid, uuid, text, text, text, text, int, text, text)', 'execute'),
  'members cannot call the notify functions');

select * from finish();
rollback;
