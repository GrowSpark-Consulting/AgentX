-- Knowledge-base gaps (0012): record_kb_gap counts repeats and reopens answered gaps; answer_kb_gap
-- writes the FAQ and closes the gap in one transaction. Run: pnpm db:test
begin;
create extension if not exists pgtap with schema extensions;
select plan(35);

-- Fixtures, inserted as the migration owner (bypasses RLS): two businesses, a member each, contacts.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000003a0', 'gaps-a@test.local'),
  ('00000000-0000-0000-0000-0000000003b0', 'gaps-b@test.local');
insert into public.tenants (id, name, vertical) values
  ('7a000000-0000-0000-0000-00000000000a', 'Gaps A', 'test-pack'),
  ('7a000000-0000-0000-0000-00000000000b', 'Gaps B', 'test-pack');
insert into public.memberships (tenant_id, user_id, role) values
  ('7a000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000003a0', 'staff'),
  ('7a000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000003b0', 'owner');
insert into public.contacts (id, tenant_id, phone, name) values
  ('7b000000-0000-0000-0000-0000000000a1', '7a000000-0000-0000-0000-00000000000a', '+919800000301', 'Asha'),
  ('7b000000-0000-0000-0000-0000000000a2', '7a000000-0000-0000-0000-00000000000a', '+919800000302', 'Bala'),
  ('7b000000-0000-0000-0000-0000000000b1', '7a000000-0000-0000-0000-00000000000b', '+919800000303', 'Chitra');

-- record_kb_gap: first ask, repeats, reopening ---------------------------------------------------------

create temp table first_ask as
  select * from public.record_kb_gap('7a000000-0000-0000-0000-00000000000a', '  Is there a gym?  ', 'is there a gym',
    'Asked about amenities', '7b000000-0000-0000-0000-0000000000a1');

select results_eq('select asked_count, status, created from first_ask',
  $$values (1, 'open'::text, true)$$, 'the first ask creates an open gap');
select results_eq(
  $$select question, summary, last_contact_id from public.kb_gaps where id = (select gap_id from first_ask)$$,
  $$values ('Is there a gym?'::text, 'Asked about amenities'::text, '7b000000-0000-0000-0000-0000000000a1'::uuid)$$,
  'it stores the trimmed question, the summary and the contact');

update public.kb_gaps set last_asked_at = now() - interval '1 day' where id = (select gap_id from first_ask);
create temp table second_ask as
  select * from public.record_kb_gap('7a000000-0000-0000-0000-00000000000a', 'Gym available?', 'is there a gym',
    'Asked again', '7b000000-0000-0000-0000-0000000000a2');

select results_eq('select gap_id = (select gap_id from first_ask), asked_count, status, created from second_ask',
  $$values (true, 2, 'open'::text, false)$$, 'a repeat counts on the same gap');
select results_eq(
  $$select question, summary, last_contact_id, last_asked_at = now()
    from public.kb_gaps where id = (select gap_id from first_ask)$$,
  $$values ('Is there a gym?'::text, 'Asked again'::text, '7b000000-0000-0000-0000-0000000000a2'::uuid, true)$$,
  'a repeat keeps the first wording and updates the summary, contact and time');
select is(
  (select asked_count from public.record_kb_gap('7a000000-0000-0000-0000-00000000000a', 'gym?', 'is there a gym', null)),
  3, 'every repeat counts');
select results_eq(
  $$select summary, last_contact_id from public.kb_gaps where id = (select gap_id from first_ask)$$,
  $$values ('Asked again'::text, '7b000000-0000-0000-0000-0000000000a2'::uuid)$$,
  'a repeat without a summary or contact keeps the last ones');

update public.kb_gaps set status = 'answered' where id = (select gap_id from first_ask);
select is(
  (select status from public.record_kb_gap('7a000000-0000-0000-0000-00000000000a', 'Gym?', 'is there a gym', null)),
  'open', 'an answered gap asked again reopens');

create temp table pets as
  select * from public.record_kb_gap('7a000000-0000-0000-0000-00000000000a', 'Pets allowed?', 'pets allowed', null);
update public.kb_gaps set status = 'dismissed' where id = (select gap_id from pets);
select results_eq(
  $$select asked_count, status from public.record_kb_gap('7a000000-0000-0000-0000-00000000000a', 'Pets?', 'pets allowed', null)$$,
  $$values (2, 'dismissed'::text)$$, 'a dismissed gap stays dismissed but still counts');

select is(
  (select created from public.record_kb_gap('7a000000-0000-0000-0000-00000000000b', 'Is there a gym?', 'is there a gym',
    null, '7b000000-0000-0000-0000-0000000000b1')),
  true, 'another business gets its own gap for the same question');

select throws_ok(
  $$select * from public.record_kb_gap('7a000000-0000-0000-0000-00000000000a', 'Valet?', 'valet', null,
    '7b000000-0000-0000-0000-0000000000b1')$$,
  'P0001', null, 'the contact must belong to the business');
select throws_ok(
  $$select * from public.record_kb_gap('7a000000-0000-0000-0000-00000000000a', 'Valet?', '  ', null)$$,
  'P0001', null, 'question_norm must not be empty');
select throws_ok(
  $$select * from public.record_kb_gap('7a000000-0000-0000-0000-00000000000a', repeat('q', 301), 'valet', null)$$,
  'P0001', null, 'the question is at most 300 characters');
select throws_ok(
  $$select * from public.record_kb_gap('7a000000-0000-0000-0000-00000000000a', 'Valet?', 'valet', repeat('s', 501))$$,
  'P0001', null, 'the summary is at most 500 characters');
select throws_ok(
  $$select * from public.record_kb_gap('00000000-0000-4000-8000-000000000000', 'Valet?', 'valet', null)$$,
  'PA404', null, 'an unknown business is not_found');
select is((select count(*) from public.kb_gaps where question_norm = 'valet'), 0::bigint,
  'refused calls record nothing');

-- answer_kb_gap ---------------------------------------------------------------------------------------

create temp table parking as
  select * from public.record_kb_gap('7a000000-0000-0000-0000-00000000000a', 'Parking?', 'parking', null);
create temp table parking_answer as
  select * from public.answer_kb_gap('7a000000-0000-0000-0000-00000000000a', (select gap_id from parking),
    '  Yes, two covered slots.  ', '00000000-0000-0000-0000-0000000003a0');

select results_eq('select question, answer from parking_answer',
  $$values ('Parking?'::text, 'Yes, two covered slots.'::text)$$,
  'it returns the FAQ''s question and the trimmed answer');
select results_eq(
  $$select source_type, title, body, status from public.kb_documents
    where id = (select faq_id from parking_answer) and tenant_id = '7a000000-0000-0000-0000-00000000000a'$$,
  $$values ('manual'::text, 'Parking?'::text, 'Yes, two covered slots.'::text, 'processing'::text)$$,
  'it writes a manual FAQ that starts as processing');
select results_eq(
  $$select status, answered_faq_id = (select faq_id from parking_answer), answered_by, answered_at = now()
    from public.kb_gaps where id = (select gap_id from parking)$$,
  $$values ('answered'::text, true, '00000000-0000-0000-0000-0000000003a0'::uuid, true)$$,
  'it closes the gap with the FAQ, who answered and when');

select throws_ok(
  $$select * from public.answer_kb_gap('7a000000-0000-0000-0000-00000000000a', (select gap_id from parking),
    'Still yes.', '00000000-0000-0000-0000-0000000003a0')$$,
  'PA409', null, 'an answered gap cannot be answered again');
select throws_ok(
  $$select * from public.answer_kb_gap('7a000000-0000-0000-0000-00000000000b', (select gap_id from parking),
    'Yes.', '00000000-0000-0000-0000-0000000003b0')$$,
  'PA404', null, 'another business''s gap is not_found');
select throws_ok(
  $$select * from public.answer_kb_gap('7a000000-0000-0000-0000-00000000000a', '00000000-0000-4000-8000-000000000000',
    'Yes.', '00000000-0000-0000-0000-0000000003a0')$$,
  'PA404', null, 'an unknown gap is not_found');

create temp table lift as
  select * from public.record_kb_gap('7a000000-0000-0000-0000-00000000000a', 'lift?', 'is there a lift', null);
select is(
  (select question from public.answer_kb_gap('7a000000-0000-0000-0000-00000000000a', (select gap_id from lift),
    'Yes, two lifts.', '00000000-0000-0000-0000-0000000003a0', 'Is there a lift?')),
  'Is there a lift?', 'the team can reword the question for the FAQ');

-- Same question as the Parking? FAQ, ignoring case and spaces.
create temp table dup as
  select * from public.record_kb_gap('7a000000-0000-0000-0000-00000000000a', '  PARKING? ', 'parking available', null);
select throws_ok(
  $$select * from public.answer_kb_gap('7a000000-0000-0000-0000-00000000000a', (select gap_id from dup),
    'Yes.', '00000000-0000-0000-0000-0000000003a0')$$,
  '23505', null, 'a question that duplicates an FAQ is refused');
select results_eq(
  $$select g.status, (select count(*) from public.kb_documents d where d.tenant_id = g.tenant_id and d.source_type = 'manual')
    from public.kb_gaps g where g.id = (select gap_id from dup)$$,
  $$values ('open'::text, 2::bigint)$$,
  'after a duplicate the gap stays open and no FAQ is added');

create temp table pets_answer as
  select * from public.answer_kb_gap('7a000000-0000-0000-0000-00000000000a', (select gap_id from pets),
    'Small pets only.', '00000000-0000-0000-0000-0000000003a0');
select is((select status from public.kb_gaps where id = (select gap_id from pets)), 'answered',
  'a dismissed gap can still be answered');

create temp table pool as
  select * from public.record_kb_gap('7a000000-0000-0000-0000-00000000000a', 'Pool?', 'pool', null);
select throws_ok(
  $$select * from public.answer_kb_gap('7a000000-0000-0000-0000-00000000000a', (select gap_id from pool),
    '   ', '00000000-0000-0000-0000-0000000003a0')$$,
  'P0001', null, 'an empty answer is refused');
select throws_ok(
  $$select * from public.answer_kb_gap('7a000000-0000-0000-0000-00000000000a', (select gap_id from pool),
    repeat('a', 2001), '00000000-0000-0000-0000-0000000003a0')$$,
  'P0001', null, 'an answer is at most 2000 characters');
select throws_ok(
  $$select * from public.answer_kb_gap('7a000000-0000-0000-0000-00000000000a', (select gap_id from pool),
    'Yes.', '00000000-0000-0000-0000-0000000003a0', repeat('q', 301))$$,
  'P0001', null, 'a reworded question is at most 300 characters');
select throws_ok(
  $$select * from public.answer_kb_gap('7a000000-0000-0000-0000-00000000000a', (select gap_id from pool),
    'Yes.', '00000000-0000-4000-8000-000000000000')$$,
  'P0001', null, 'an unknown user is refused');
select results_eq(
  $$select g.status, (select count(*) from public.kb_documents d where d.tenant_id = g.tenant_id and d.source_type = 'manual')
    from public.kb_gaps g where g.id = (select gap_id from pool)$$,
  $$values ('open'::text, 3::bigint)$$,
  'refused answers change nothing');

-- Who may call them -----------------------------------------------------------------------------------

select ok(
  not has_function_privilege('authenticated', 'public.record_kb_gap(uuid, text, text, text, uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.answer_kb_gap(uuid, uuid, text, uuid, text)', 'execute'),
  'members cannot call the gap functions directly (the API does)');
select ok(
  not has_function_privilege('anon', 'public.record_kb_gap(uuid, text, text, text, uuid)', 'execute')
  and not has_function_privilege('anon', 'public.answer_kb_gap(uuid, uuid, text, uuid, text)', 'execute'),
  'signed-out visitors cannot call them');
select ok(
  has_function_privilege('service_role', 'public.record_kb_gap(uuid, text, text, text, uuid)', 'execute')
  and has_function_privilege('service_role', 'public.answer_kb_gap(uuid, uuid, text, uuid, text)', 'execute'),
  'server code can call both');

-- The new columns -------------------------------------------------------------------------------------

select throws_ok(
  $$update public.kb_gaps set summary = repeat('s', 501) where id = (select gap_id from pool)$$,
  '23514', null, 'the table keeps the summary to 500 characters too');

delete from auth.users where id = '00000000-0000-0000-0000-0000000003a0';
select ok(
  (select bool_and(answered_by is null) from public.kb_gaps where tenant_id = '7a000000-0000-0000-0000-00000000000a'),
  'deleting a user keeps their answers and clears answered_by');

select * from finish();
rollback;
