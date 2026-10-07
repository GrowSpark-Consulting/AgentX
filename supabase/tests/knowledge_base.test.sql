-- Knowledge base (0011): document status, one FAQ per question, kb_gaps isolation and member write
-- lockdown, Realtime, and match_kb_chunks. Run: pnpm db:test
begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

-- A 1024-dimension vector with 1 at positions a and b.
create function pg_temp.vec(a int, b int default null) returns extensions.vector
  language sql immutable
as $$
  select array_agg(case when g = a or g = b then 1 else 0 end order by g)::real[]::extensions.vector
  from generate_series(1, 1024) g
$$;

-- Fixtures, inserted as the migration owner (bypasses RLS): two businesses with one owner each.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000002a0', 'kb-a@test.local'),
  ('00000000-0000-0000-0000-0000000002b0', 'kb-b@test.local');
insert into public.tenants (id, name, vertical) values
  ('e0000000-0000-0000-0000-00000000000a', 'KB A', 'test-pack'),
  ('e0000000-0000-0000-0000-00000000000b', 'KB B', 'test-pack');
insert into public.memberships (tenant_id, user_id, role) values
  ('e0000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000002a0', 'owner'),
  ('e0000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000002b0', 'owner');
insert into public.contacts (id, tenant_id, phone, name) values
  ('e1000000-0000-0000-0000-00000000000a', 'e0000000-0000-0000-0000-00000000000a', '+919800000201', 'Customer A');

-- A: an FAQ and a brochure (ready), a draft upload still processing. B: its own FAQ.
insert into public.kb_documents (id, tenant_id, source_type, title, body, status) values
  ('e2000000-0000-0000-0000-0000000000a1', 'e0000000-0000-0000-0000-00000000000a', 'manual', 'Parking?', 'Yes, 2 slots.', 'ready'),
  ('e2000000-0000-0000-0000-0000000000a2', 'e0000000-0000-0000-0000-00000000000a', 'upload', 'Brochure', null, 'ready'),
  ('e2000000-0000-0000-0000-0000000000a3', 'e0000000-0000-0000-0000-00000000000a', 'upload', 'Draft', null, 'processing');
insert into public.kb_chunks (id, tenant_id, document_id, content, embedding) values
  ('e3000000-0000-0000-0000-0000000000a1', 'e0000000-0000-0000-0000-00000000000a', 'e2000000-0000-0000-0000-0000000000a1', 'Parking: 2 slots', pg_temp.vec(1)),
  ('e3000000-0000-0000-0000-0000000000a2', 'e0000000-0000-0000-0000-00000000000a', 'e2000000-0000-0000-0000-0000000000a2', 'Brochure page 1', pg_temp.vec(1, 2)),
  ('e3000000-0000-0000-0000-0000000000a3', 'e0000000-0000-0000-0000-00000000000a', 'e2000000-0000-0000-0000-0000000000a2', 'Brochure page 2', pg_temp.vec(2)),
  ('e3000000-0000-0000-0000-0000000000a4', 'e0000000-0000-0000-0000-00000000000a', 'e2000000-0000-0000-0000-0000000000a3', 'Draft text', pg_temp.vec(1));
insert into public.kb_gaps (id, tenant_id, question, question_norm, asked_count, last_contact_id, status) values
  ('e4000000-0000-0000-0000-0000000000a1', 'e0000000-0000-0000-0000-00000000000a', 'Is there a gym?', 'is there a gym', 3,
   'e1000000-0000-0000-0000-00000000000a', 'open'),
  ('e4000000-0000-0000-0000-0000000000a2', 'e0000000-0000-0000-0000-00000000000a', 'Pets allowed?', 'pets allowed', 1, null, 'dismissed'),
  ('e4000000-0000-0000-0000-0000000000b1', 'e0000000-0000-0000-0000-00000000000b', 'Valet?', 'valet', 1, null, 'open');

-- kb_documents: status and FAQ questions ------------------------------------------------------------

insert into public.kb_documents (id, tenant_id, source_type, title) values
  ('e2000000-0000-0000-0000-0000000000a4', 'e0000000-0000-0000-0000-00000000000a', 'upload', 'New upload');
select is((select status from public.kb_documents where id = 'e2000000-0000-0000-0000-0000000000a4'),
  'processing', 'a new document starts as processing');

select throws_ok(
  $$insert into public.kb_documents (tenant_id, source_type, title, status)
    values ('e0000000-0000-0000-0000-00000000000a', 'upload', 'X', 'done')$$,
  '23514', null, 'status is processing, ready or failed');

select throws_ok(
  $$insert into public.kb_documents (tenant_id, source_type, title, body, status)
    values ('e0000000-0000-0000-0000-00000000000a', 'manual', '  parking? ', 'No.', 'ready')$$,
  '23505', null, 'a business cannot have the same FAQ question twice (case and spaces ignored)');

select lives_ok(
  $$insert into public.kb_documents (tenant_id, source_type, title)
    values ('e0000000-0000-0000-0000-00000000000a', 'upload', 'Parking?')$$,
  'an upload may share a title with an FAQ');

select lives_ok(
  $$insert into public.kb_documents (id, tenant_id, source_type, title, body, status)
    values ('e2000000-0000-0000-0000-0000000000b1', 'e0000000-0000-0000-0000-00000000000b', 'manual', 'Parking?', 'No.', 'ready')$$,
  'another business may ask the same FAQ question');
insert into public.kb_chunks (tenant_id, document_id, content, embedding) values
  ('e0000000-0000-0000-0000-00000000000b', 'e2000000-0000-0000-0000-0000000000b1', 'B parking', pg_temp.vec(1));

-- kb_gaps constraints ---------------------------------------------------------------------------------

select throws_ok(
  $$insert into public.kb_gaps (tenant_id, question, question_norm)
    values ('e0000000-0000-0000-0000-00000000000a', 'Is there a GYM', 'is there a gym')$$,
  '23505', null, 'one gap per business and normalised question');
select throws_ok(
  $$insert into public.kb_gaps (tenant_id, question, question_norm, status)
    values ('e0000000-0000-0000-0000-00000000000a', 'Pool?', 'pool', 'closed')$$,
  '23514', null, 'gap status is open, answered or dismissed');
select throws_ok(
  $$insert into public.kb_gaps (tenant_id, question, question_norm, asked_count)
    values ('e0000000-0000-0000-0000-00000000000a', 'Pool?', 'pool', 0)$$,
  '23514', null, 'asked_count is at least 1');

-- Realtime --------------------------------------------------------------------------------------------

select ok(exists (
  select 1 from pg_publication_tables
  where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'kb_documents'),
  'kb_documents is in the supabase_realtime publication');

-- match_kb_chunks -------------------------------------------------------------------------------------

select results_eq(
  $$select chunk_id from public.match_kb_chunks('e0000000-0000-0000-0000-00000000000a', pg_temp.vec(1), 5)$$,
  array['e3000000-0000-0000-0000-0000000000a1', 'e3000000-0000-0000-0000-0000000000a2', 'e3000000-0000-0000-0000-0000000000a3']::uuid[],
  'only the business''s ready chunks, most similar first (processing documents and other businesses left out)');
select results_eq(
  $$select round(similarity::numeric, 3) from public.match_kb_chunks('e0000000-0000-0000-0000-00000000000a', pg_temp.vec(1), 5)$$,
  array[1.000, 0.707, 0.000]::numeric[],
  'similarity is 1 minus the cosine distance');
select is(
  (select count(*) from public.match_kb_chunks('e0000000-0000-0000-0000-00000000000a', pg_temp.vec(1), 2)),
  2::bigint, 'k limits the rows');
select is(
  (select count(*) from public.match_kb_chunks('e0000000-0000-0000-0000-00000000000a', pg_temp.vec(1), 0)),
  1::bigint, 'k is at least 1');
select is(
  (select title from public.match_kb_chunks('e0000000-0000-0000-0000-00000000000a', pg_temp.vec(1), 1)),
  'Parking?', 'each chunk comes with its document title');

select ok(not has_function_privilege('authenticated', 'public.match_kb_chunks(uuid, extensions.vector, integer)', 'execute'),
  'members cannot call match_kb_chunks');
select ok(not has_function_privilege('anon', 'public.match_kb_chunks(uuid, extensions.vector, integer)', 'execute'),
  'signed-out visitors cannot call match_kb_chunks');
select ok(has_function_privilege('service_role', 'public.match_kb_chunks(uuid, extensions.vector, integer)', 'execute'),
  'server code can call match_kb_chunks');

-- Owner A, the way PostgREST acts for a signed-in dashboard user --------------------------------------

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000002a0","role":"authenticated"}', true);

select results_eq('select question from public.kb_gaps order by question',
  array['Is there a gym?', 'Pets allowed?'], 'a member reads their own gaps');
select is((select count(*) from public.kb_gaps where tenant_id = 'e0000000-0000-0000-0000-00000000000b'),
  0::bigint, 'a member cannot read another business''s gaps');
select throws_ok(
  $$insert into public.kb_gaps (tenant_id, question, question_norm)
    values ('e0000000-0000-0000-0000-00000000000a', 'Pool?', 'pool')$$,
  '42501', null, 'a member cannot create a gap');
select is((select body from public.kb_documents where id = 'e2000000-0000-0000-0000-0000000000a1'),
  'Yes, 2 slots.', 'a member reads an FAQ''s answer');

-- Attempts that RLS turns into no-ops; checked after switching back to the owner below.
update public.kb_documents set status = 'ready' where id = 'e2000000-0000-0000-0000-0000000000a3';
update public.kb_gaps set status = 'answered';

reset role;
set local role anon;
select is((select count(*) from public.kb_gaps), 0::bigint, 'signed-out visitors see no gaps');

-- Back as the migration owner ---------------------------------------------------------------------------

reset role;
select is((select status from public.kb_documents where id = 'e2000000-0000-0000-0000-0000000000a3'),
  'processing', 'a member cannot change a document''s status directly');
select is((select count(*) from public.kb_gaps where status = 'answered'), 0::bigint,
  'a member cannot close a gap directly');

update public.kb_documents set status = 'failed', error = 'unreadable PDF' where id = 'e2000000-0000-0000-0000-0000000000a2';
select results_eq(
  $$select chunk_id from public.match_kb_chunks('e0000000-0000-0000-0000-00000000000a', pg_temp.vec(1), 5)$$,
  array['e3000000-0000-0000-0000-0000000000a1']::uuid[], 'a failed document''s chunks are left out');

delete from public.contacts where id = 'e1000000-0000-0000-0000-00000000000a';
select ok((select last_contact_id is null from public.kb_gaps where id = 'e4000000-0000-0000-0000-0000000000a1'),
  'deleting a contact keeps the gap and clears last_contact_id');

update public.kb_gaps set status = 'answered', answered_faq_id = 'e2000000-0000-0000-0000-0000000000a1'
  where id = 'e4000000-0000-0000-0000-0000000000a1';
delete from public.kb_documents where id = 'e2000000-0000-0000-0000-0000000000a1';
select ok((select answered_faq_id is null from public.kb_gaps where id = 'e4000000-0000-0000-0000-0000000000a1'),
  'deleting an FAQ keeps the answered gap and clears answered_faq_id');

select * from finish();
rollback;
