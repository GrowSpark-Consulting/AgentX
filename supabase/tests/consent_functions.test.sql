-- The consent writes of the message pipeline (0021): record_notice_shown and record_opt_out each change the contact and
-- write the log in one transaction, once, for the business's own contact only, and are for the server only.
-- Run: pnpm db:test
begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

insert into public.tenants (id, name, vertical) values
  ('7a000000-0000-0000-0000-00000000000a', 'Consent A', 'test-pack'),
  ('7a000000-0000-0000-0000-00000000000b', 'Consent B', 'test-pack');
insert into public.contacts (id, tenant_id, phone, name) values
  ('7b000000-0000-0000-0000-0000000000a1', '7a000000-0000-0000-0000-00000000000a', '+919800000501', 'Asha'),
  ('7b000000-0000-0000-0000-0000000000a2', '7a000000-0000-0000-0000-00000000000a', '+919800000502', 'Bala'),
  ('7b000000-0000-0000-0000-0000000000b1', '7a000000-0000-0000-0000-00000000000b', '+919800000503', 'Chitra');

-- record_notice_shown -------------------------------------------------------------------------------------

select is(public.record_notice_shown('7a000000-0000-0000-0000-00000000000a', '7b000000-0000-0000-0000-0000000000a1', '7c000000-0000-0000-0000-0000000000a1'), true, 'the first notice is recorded');
select isnt((select consent_at from public.contacts where id = '7b000000-0000-0000-0000-0000000000a1'), null, 'and consent_at is set');
select is((select count(*)::int from public.consent_logs where contact_id = '7b000000-0000-0000-0000-0000000000a1' and event = 'notice_shown' and source = 'first_message' and message_id = '7c000000-0000-0000-0000-0000000000a1'), 1, 'and notice_shown is logged with the message that carried it');

select is(public.record_notice_shown('7a000000-0000-0000-0000-00000000000a', '7b000000-0000-0000-0000-0000000000a1', '7c000000-0000-0000-0000-0000000000a2'), false, 'a second notice is not recorded');
select is((select count(*)::int from public.consent_logs where contact_id = '7b000000-0000-0000-0000-0000000000a1' and event = 'notice_shown'), 1, 'and nothing is logged twice');

select is(public.record_notice_shown('7a000000-0000-0000-0000-00000000000a', '7b000000-0000-0000-0000-0000000000a2'), true, 'a notice with no message id (the send''s outcome was unknown) is recorded');
select is((select message_id from public.consent_logs where contact_id = '7b000000-0000-0000-0000-0000000000a2'), null, 'with no message id');

select is(public.record_notice_shown('7a000000-0000-0000-0000-00000000000b', '7b000000-0000-0000-0000-0000000000a1'), false, 'another business cannot record a notice for this contact');
select is(public.record_notice_shown('7a000000-0000-0000-0000-00000000000a', '7b000000-0000-0000-0000-0000000000b1'), false, 'and this business cannot for another business''s contact');
select is((select consent_at from public.contacts where id = '7b000000-0000-0000-0000-0000000000b1'), null, 'which is untouched');

-- record_opt_out ------------------------------------------------------------------------------------------

select is(public.record_opt_out('7a000000-0000-0000-0000-00000000000a', '7b000000-0000-0000-0000-0000000000a1', 'stop_keyword', '7c000000-0000-0000-0000-0000000000a3'), true, 'STOP opts the contact out');
select isnt((select opted_out_at from public.contacts where id = '7b000000-0000-0000-0000-0000000000a1'), null, 'and opted_out_at is set');
select is((select count(*)::int from public.consent_logs where contact_id = '7b000000-0000-0000-0000-0000000000a1' and event = 'opted_out' and source = 'stop_keyword' and message_id = '7c000000-0000-0000-0000-0000000000a3'), 1, 'and opted_out is logged with the message');

select is(public.record_opt_out('7a000000-0000-0000-0000-00000000000a', '7b000000-0000-0000-0000-0000000000a1', 'stop_keyword'), false, 'a second STOP changes nothing: false');
select is((select count(*)::int from public.consent_logs where contact_id = '7b000000-0000-0000-0000-0000000000a1' and event = 'opted_out'), 1, 'and logs nothing more');

select is(public.record_opt_out('7a000000-0000-0000-0000-00000000000b', '7b000000-0000-0000-0000-0000000000a2', 'stop_keyword'), false, 'another business cannot opt this contact out');
select is((select opted_out_at from public.contacts where id = '7b000000-0000-0000-0000-0000000000a2'), null, 'which is untouched');

select throws_ok($$select public.record_opt_out('7a000000-0000-0000-0000-00000000000a', '7b000000-0000-0000-0000-0000000000a2', 'because')$$, 'P0001', null, 'a source the table does not document is refused');

-- 0022: the model read a clear request to stop
select is(public.record_opt_out('7a000000-0000-0000-0000-00000000000a', '7b000000-0000-0000-0000-0000000000a2', 'model_intent', '7c000000-0000-0000-0000-0000000000a4'), true, 'a clear request read by the model opts the contact out (model_intent)');
select is((select count(*)::int from public.consent_logs where contact_id = '7b000000-0000-0000-0000-0000000000a2' and event = 'opted_out' and source = 'model_intent'), 1, 'and it is logged with that source');

-- the server only -----------------------------------------------------------------------------------------

select ok(
  has_function_privilege('service_role', 'public.record_notice_shown(uuid, uuid, uuid)', 'execute')
  and has_function_privilege('service_role', 'public.record_opt_out(uuid, uuid, text, uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.record_notice_shown(uuid, uuid, uuid)', 'execute')
  and not has_function_privilege('anon', 'public.record_notice_shown(uuid, uuid, uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.record_opt_out(uuid, uuid, text, uuid)', 'execute')
  and not has_function_privilege('anon', 'public.record_opt_out(uuid, uuid, text, uuid)', 'execute'),
  'only the service role can run them');

select * from finish();
rollback;
