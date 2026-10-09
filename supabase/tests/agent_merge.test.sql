-- Atomic merges for the message pipeline (0018): merge_lead_fields and merge_message_agent_meta keep what else
-- is there, stay inside one business, and are for the server only. Run: pnpm db:test
begin;
create extension if not exists pgtap with schema extensions;
select plan(23);

insert into public.tenants (id, name, vertical) values
  ('8a000000-0000-0000-0000-00000000000a', 'Merge A', 'test-pack'),
  ('8a000000-0000-0000-0000-00000000000b', 'Merge B', 'test-pack');
insert into public.contacts (id, tenant_id, phone, name) values
  ('8b000000-0000-0000-0000-0000000000a1', '8a000000-0000-0000-0000-00000000000a', '+919800000401', 'Asha'),
  ('8b000000-0000-0000-0000-0000000000b1', '8a000000-0000-0000-0000-00000000000b', '+919800000402', 'Bala');
insert into public.leads (id, tenant_id, contact_id, stage, fields) values
  ('8c000000-0000-0000-0000-0000000000a1', '8a000000-0000-0000-0000-00000000000a', '8b000000-0000-0000-0000-0000000000a1', 'new', '{"budget": "70L", "notes": "has a dog"}'),
  ('8c000000-0000-0000-0000-0000000000a2', '8a000000-0000-0000-0000-00000000000a', '8b000000-0000-0000-0000-0000000000a1', 'qualified', '{}'),
  ('8c000000-0000-0000-0000-0000000000b1', '8a000000-0000-0000-0000-00000000000b', '8b000000-0000-0000-0000-0000000000b1', 'new', '{"budget": "50L"}');
insert into public.channels (id, tenant_id, type, status) values
  ('8d000000-0000-0000-0000-0000000000a1', '8a000000-0000-0000-0000-00000000000a', 'whatsapp', 'active');
insert into public.conversations (id, tenant_id, contact_id, channel_id, status) values
  ('8e000000-0000-0000-0000-0000000000a1', '8a000000-0000-0000-0000-00000000000a', '8b000000-0000-0000-0000-0000000000a1', '8d000000-0000-0000-0000-0000000000a1', 'open'),
  ('8e000000-0000-0000-0000-0000000000a2', '8a000000-0000-0000-0000-00000000000a', '8b000000-0000-0000-0000-0000000000a1', '8d000000-0000-0000-0000-0000000000a1', 'closed');
insert into public.messages (id, tenant_id, conversation_id, direction, sender, kind, body, meta) values
  ('8f000000-0000-0000-0000-0000000000a1', '8a000000-0000-0000-0000-00000000000a', '8e000000-0000-0000-0000-0000000000a1', 'in', 'customer', 'interactive', 'Sat 5 pm', '{"buttonId": "slot_1"}'),
  ('8f000000-0000-0000-0000-0000000000a2', '8a000000-0000-0000-0000-00000000000a', '8e000000-0000-0000-0000-0000000000a1', 'in', 'customer', 'text', 'hi', '{}');

-- merge_lead_fields ---------------------------------------------------------------------------------------

select is(public.merge_lead_fields('8a000000-0000-0000-0000-00000000000a', '8c000000-0000-0000-0000-0000000000a1', '{"budget": "80L", "location": "OMR"}', false),
  true, 'merging into the business''s own lead says so');
select is((select fields from public.leads where id = '8c000000-0000-0000-0000-0000000000a1'),
  '{"budget": "80L", "notes": "has a dog", "location": "OMR"}'::jsonb, 'a key already there is replaced, a new one added, every other key kept (a member''s edit survives)');
select is((select stage from public.leads where id = '8c000000-0000-0000-0000-0000000000a1'), 'new', 'the stage is left alone unless asked');

select is(public.merge_lead_fields('8a000000-0000-0000-0000-00000000000a', '8c000000-0000-0000-0000-0000000000a1', '{}', true), true, 'an empty patch with engage is allowed');
select is((select stage from public.leads where id = '8c000000-0000-0000-0000-0000000000a1'), 'engaged', 'engage moves a new lead to engaged');
select is((select fields from public.leads where id = '8c000000-0000-0000-0000-0000000000a1'),
  '{"budget": "80L", "notes": "has a dog", "location": "OMR"}'::jsonb, 'an empty patch changes no answer');

select is(public.merge_lead_fields('8a000000-0000-0000-0000-00000000000a', '8c000000-0000-0000-0000-0000000000a2', '{"budget": "1cr"}', true), true, 'merging into a lead that is further along');
select is((select stage from public.leads where id = '8c000000-0000-0000-0000-0000000000a2'), 'qualified', 'engage never moves a lead that is not new');

select is(public.merge_lead_fields('8a000000-0000-0000-0000-00000000000b', '8c000000-0000-0000-0000-0000000000a1', '{"budget": "1"}', true), false,
  'another business cannot merge into this lead: false');
select is((select fields ->> 'budget' from public.leads where id = '8c000000-0000-0000-0000-0000000000a1'), '80L', 'and nothing changed');
select is(public.merge_lead_fields('8a000000-0000-0000-0000-00000000000a', '8c000000-0000-0000-0000-0000000000b1', '{"budget": "1"}', true), false,
  'this business cannot merge into another business''s lead');
select is((select fields ->> 'budget' from public.leads where id = '8c000000-0000-0000-0000-0000000000b1'), '50L', 'and the other business''s lead is untouched');

select throws_ok($$select public.merge_lead_fields('8a000000-0000-0000-0000-00000000000a', '8c000000-0000-0000-0000-0000000000a1', '["a"]', false)$$, 'P0001', null, 'a patch that is not an object is refused');
select throws_ok($$select public.merge_lead_fields('8a000000-0000-0000-0000-00000000000a', '8c000000-0000-0000-0000-0000000000a1', jsonb_build_object('x', repeat('a', 20000)), false)$$, 'P0001', null, 'a patch over 16 KB is refused');

-- merge_message_agent_meta --------------------------------------------------------------------------------

select is(public.merge_message_agent_meta('8a000000-0000-0000-0000-00000000000a', '8e000000-0000-0000-0000-0000000000a1', '8f000000-0000-0000-0000-0000000000a1', '{"extraction": {"intent": "book"}}'), true,
  'merging into the business''s own message says so');
select is((select meta from public.messages where id = '8f000000-0000-0000-0000-0000000000a1'),
  '{"buttonId": "slot_1", "agent": {"extraction": {"intent": "book"}}}'::jsonb, 'the rest of the meta (the button id) is kept');

select is(public.merge_message_agent_meta('8a000000-0000-0000-0000-00000000000a', '8e000000-0000-0000-0000-0000000000a1', '8f000000-0000-0000-0000-0000000000a1', '{"decision": {"kind": "offer_slots"}}'), true, 'a later step adds its own key');
select is((select meta -> 'agent' from public.messages where id = '8f000000-0000-0000-0000-0000000000a1'),
  '{"extraction": {"intent": "book"}, "decision": {"kind": "offer_slots"}}'::jsonb, 'and the earlier step''s key is still there');

select is(public.merge_message_agent_meta('8a000000-0000-0000-0000-00000000000a', '8e000000-0000-0000-0000-0000000000a2', '8f000000-0000-0000-0000-0000000000a2', '{"x": 1}'), false,
  'a message named with the wrong conversation: false');
select is(public.merge_message_agent_meta('8a000000-0000-0000-0000-00000000000b', '8e000000-0000-0000-0000-0000000000a1', '8f000000-0000-0000-0000-0000000000a2', '{"x": 1}'), false,
  'another business: false');
select is((select meta from public.messages where id = '8f000000-0000-0000-0000-0000000000a2'), '{}'::jsonb, 'and nothing was written');

select throws_ok($$select public.merge_message_agent_meta('8a000000-0000-0000-0000-00000000000a', '8e000000-0000-0000-0000-0000000000a1', '8f000000-0000-0000-0000-0000000000a2', '"text"')$$, 'P0001', null, 'a value that is not an object is refused');

-- the server only -----------------------------------------------------------------------------------------

select ok(
  has_function_privilege('service_role', 'public.merge_lead_fields(uuid, uuid, jsonb, boolean)', 'execute')
  and has_function_privilege('service_role', 'public.merge_message_agent_meta(uuid, uuid, uuid, jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'public.merge_lead_fields(uuid, uuid, jsonb, boolean)', 'execute')
  and not has_function_privilege('anon', 'public.merge_lead_fields(uuid, uuid, jsonb, boolean)', 'execute')
  and not has_function_privilege('authenticated', 'public.merge_message_agent_meta(uuid, uuid, uuid, jsonb)', 'execute')
  and not has_function_privilege('anon', 'public.merge_message_agent_meta(uuid, uuid, uuid, jsonb)', 'execute'),
  'only the service role can run them');

select * from finish();
rollback;
