-- Template status table (0007). Run: pnpm db:test
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

insert into auth.users (id, email) values
  ('f0000000-0000-0000-0000-00000000000a', 'tpl-owner-a@test.local'),
  ('f0000000-0000-0000-0000-00000000000b', 'tpl-owner-b@test.local');
insert into public.tenants (id, name, vertical) values
  ('f1000000-0000-0000-0000-00000000000a', 'Templates A', 'test-pack'),
  ('f1000000-0000-0000-0000-00000000000b', 'Templates B', 'test-pack');
insert into public.memberships (tenant_id, user_id, role) values
  ('f1000000-0000-0000-0000-00000000000a', 'f0000000-0000-0000-0000-00000000000a', 'owner'),
  ('f1000000-0000-0000-0000-00000000000b', 'f0000000-0000-0000-0000-00000000000b', 'owner');
insert into public.channels (id, tenant_id, type) values
  ('f2000000-0000-0000-0000-00000000000a', 'f1000000-0000-0000-0000-00000000000a', 'whatsapp'),
  ('f2000000-0000-0000-0000-00000000000b', 'f1000000-0000-0000-0000-00000000000b', 'whatsapp');
insert into public.whatsapp_connections
  (id, tenant_id, channel_id, method, waba_id, phone_number_id, token_enc, token_type, connected_by) values
  ('f3000000-0000-0000-0000-00000000000a', 'f1000000-0000-0000-0000-00000000000a', 'f2000000-0000-0000-0000-00000000000a',
   'manual_byo', 'tpl-waba-a', 'tpl-pnid-a', 'placeholder', 'system_user', 'admin:test'),
  ('f3000000-0000-0000-0000-00000000000b', 'f1000000-0000-0000-0000-00000000000b', 'f2000000-0000-0000-0000-00000000000b',
   'manual_byo', 'tpl-waba-b', 'tpl-pnid-b', 'placeholder', 'system_user', 'admin:test');
insert into public.whatsapp_templates
  (id, tenant_id, connection_id, name, language, category, components, meta_template_id, updated_at) values
  ('f4000000-0000-0000-0000-00000000000a', 'f1000000-0000-0000-0000-00000000000a', 'f3000000-0000-0000-0000-00000000000a',
   'reminder_24h_v1', 'en', 'utility', '{"body":"Reminder: {{1}}"}', 'meta-a1', now() - interval '1 day'),
  ('f4000000-0000-0000-0000-00000000000b', 'f1000000-0000-0000-0000-00000000000b', 'f3000000-0000-0000-0000-00000000000b',
   'reminder_24h_v1', 'en', 'utility', '{"body":"Reminder: {{1}}"}', 'meta-b1', now() - interval '1 day');

select ok((select relrowsecurity from pg_class where oid = 'public.whatsapp_templates'::regclass),
  'whatsapp_templates has row level security');
select throws_ok(
  $$insert into public.whatsapp_templates (tenant_id, connection_id, name, language, category, components)
    values ('f1000000-0000-0000-0000-00000000000a', 'f3000000-0000-0000-0000-00000000000a', 'reminder_24h_v1', 'en', 'utility', '{}')$$,
  '23505', null, 'a template name and language is unique per WhatsApp account');
select throws_ok(
  $$insert into public.whatsapp_templates (tenant_id, connection_id, name, language, category, components)
    values ('f1000000-0000-0000-0000-00000000000a', 'f3000000-0000-0000-0000-00000000000a', 'promo_v1', 'en', 'promo', '{}')$$,
  '23514', null, 'the category must be utility, marketing or authentication');

-- Meta status updates ------------------------------------------------------------------------
select is(public.set_template_status('meta-a1', 'APPROVED'), true, 'an approval is recorded');
select results_eq($$select status, rejection_reason, updated_at from public.whatsapp_templates where meta_template_id = 'meta-a1'$$,
  $$values ('approved'::text, null::text, now())$$, 'the template is approved and updated_at moves');
select is(public.set_template_status('meta-a1', 'REJECTED', '  Variables at the start  '), true, 'a rejection is recorded');
select results_eq($$select status, rejection_reason from public.whatsapp_templates where meta_template_id = 'meta-a1'$$,
  $$values ('rejected'::text, 'Variables at the start'::text)$$, 'the rejection reason is kept, trimmed');
select is(public.set_template_status('meta-a1', 'REINSTATED'), true, 'a reinstatement is recorded');
select results_eq($$select status, rejection_reason from public.whatsapp_templates where meta_template_id = 'meta-a1'$$,
  $$values ('approved'::text, null::text)$$, 'a reinstated template is approved again and the reason is cleared');
select is(public.set_template_status('meta-a1', 'FLAGGED'), false, 'a status we do not track changes nothing');
select is(public.set_template_status('meta-unknown', 'APPROVED'), false, 'an unknown template changes nothing');

set local role service_role;
select is(public.set_template_status('meta-b1', 'approved'), true, 'the server role can update a status');
reset role;

-- Members read their own templates and write nothing ------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f0000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select results_eq('select name from public.whatsapp_templates', array['reminder_24h_v1'],
  'a member sees only their own business''s templates');
select throws_ok(
  $$insert into public.whatsapp_templates (tenant_id, connection_id, name, language, category, components)
    values ('f1000000-0000-0000-0000-00000000000a', 'f3000000-0000-0000-0000-00000000000a', 'mine_v1', 'en', 'utility', '{}')$$,
  '42501', null, 'members cannot create templates directly');
reset role;
set local role anon;
select is((select count(*) from public.whatsapp_templates), 0::bigint, 'signed-out visitors see no templates');
reset role;

select ok(not has_function_privilege('authenticated', 'public.set_template_status(text, text, text)', 'execute'),
  'members cannot change a template status');

select * from finish();
rollback;
