-- 0012_kb_gap_functions: recording and answering knowledge-base gaps (docs/contracts.md, section 9).
-- Shapes from Dev 1 (Nithisha), 7 Oct 2026.
--
-- 1. kb_gaps gains summary (the latest chat summary, at most 500 characters), answered_by and
--    answered_at.
-- 2. record_kb_gap: the agent pipeline records a question it couldn't answer. One upsert per business
--    and normalised question: the first ask inserts, a repeat counts. The app owns the normaliser; SQL
--    only checks that the normalised form isn't empty.
-- 3. answer_kb_gap: a team member answers a gap. The FAQ and the closed gap are written in one
--    transaction; the app then embeds the FAQ and sets it ready.
--
-- Both are service_role only. Errors use the SQLSTATEs the API maps: PA404 not_found, PA409 conflict,
-- P0001 validation_failed. A duplicate FAQ question is the unique index's 23505 (conflict).

alter table public.kb_gaps
  add column summary text constraint kb_gaps_summary_length check (char_length(summary) <= 500),
  add column answered_by uuid references auth.users(id) on delete set null,
  add column answered_at timestamptz;

create index kb_gaps_answered_by_idx on public.kb_gaps (answered_by);

-- record_kb_gap ---------------------------------------------------------------------------------------

-- question keeps the first wording. A repeat adds 1 to asked_count, sets last_asked_at, and replaces
-- the summary and last contact when the call gives them. An answered gap asked again goes back to open
-- (answered_faq_id, answered_by and answered_at stay as a record of the earlier answer); a dismissed gap
-- stays dismissed. created is true on the first ask: asked_count starts at 1 and every repeat adds 1.
create function public.record_kb_gap(
  p_tenant_id uuid, p_question text, p_question_norm text, p_summary text, p_contact_id uuid default null
)
returns table (gap_id uuid, asked_count int, status text, created boolean)
language plpgsql
set search_path = ''
as $$
declare
  v_question text := btrim(p_question);
  v_gap_id uuid;
  v_count int;
  v_status text;
begin
  if v_question is null or v_question = '' or char_length(v_question) > 300 then
    raise exception 'record_kb_gap: question must be 1 to 300 characters';
  end if;
  if p_question_norm is null or btrim(p_question_norm) = '' then
    raise exception 'record_kb_gap: question_norm must not be empty';
  end if;
  if char_length(p_summary) > 500 then
    raise exception 'record_kb_gap: summary must be at most 500 characters';
  end if;
  if not exists (select 1 from public.tenants t where t.id = p_tenant_id) then
    raise exception 'record_kb_gap: unknown tenant %', p_tenant_id using errcode = 'PA404';
  end if;
  if p_contact_id is not null and not exists (
    select 1 from public.contacts c where c.id = p_contact_id and c.tenant_id = p_tenant_id
  ) then
    raise exception 'record_kb_gap: contact % is not in this business', p_contact_id;
  end if;

  insert into public.kb_gaps as g (tenant_id, question, question_norm, summary, last_contact_id)
  values (p_tenant_id, v_question, p_question_norm, p_summary, p_contact_id)
  on conflict (tenant_id, question_norm) do update
    set asked_count = g.asked_count + 1,
        last_asked_at = now(),
        summary = coalesce(excluded.summary, g.summary),
        last_contact_id = coalesce(excluded.last_contact_id, g.last_contact_id),
        status = case when g.status = 'answered' then 'open' else g.status end
  returning g.id, g.asked_count, g.status into v_gap_id, v_count, v_status;

  return query select v_gap_id, v_count, v_status, v_count = 1;
end
$$;

-- answer_kb_gap ---------------------------------------------------------------------------------------

-- Locks the gap, writes the FAQ (source_type 'manual', status 'processing') and closes the gap with who
-- answered and when. p_question rewords the FAQ's question; null or blank keeps the gap's first wording.
-- A dismissed gap can still be answered; an answered one cannot (PA409). If the question duplicates an
-- existing FAQ, the insert raises 23505 and nothing changes: the gap stays open.
create function public.answer_kb_gap(
  p_tenant_id uuid, p_gap_id uuid, p_answer text, p_answered_by uuid, p_question text default null
)
returns table (faq_id uuid, question text, answer text)
language plpgsql
set search_path = ''
as $$
declare
  v_answer text := btrim(p_answer);
  v_question text := nullif(btrim(p_question), '');
  v_gap_question text;
  v_gap_status text;
  v_faq_id uuid;
begin
  if v_answer is null or v_answer = '' or char_length(v_answer) > 2000 then
    raise exception 'answer_kb_gap: answer must be 1 to 2000 characters';
  end if;
  if char_length(v_question) > 300 then
    raise exception 'answer_kb_gap: question must be at most 300 characters';
  end if;
  if p_answered_by is null then
    raise exception 'answer_kb_gap: answered_by is required';
  end if;

  select g.question, g.status into v_gap_question, v_gap_status
  from public.kb_gaps g
  where g.id = p_gap_id and g.tenant_id = p_tenant_id
  for update;
  if not found then
    raise exception 'answer_kb_gap: gap not found' using errcode = 'PA404';
  end if;
  if v_gap_status = 'answered' then
    raise exception 'answer_kb_gap: this gap is already answered' using errcode = 'PA409';
  end if;
  v_question := coalesce(v_question, v_gap_question);

  insert into public.kb_documents (tenant_id, source_type, title, body, status)
  values (p_tenant_id, 'manual', v_question, v_answer, 'processing')
  returning id into v_faq_id;

  begin
    update public.kb_gaps g
       set status = 'answered', answered_faq_id = v_faq_id, answered_by = p_answered_by, answered_at = now()
     where g.id = p_gap_id and g.tenant_id = p_tenant_id;
  exception when foreign_key_violation then
    raise exception 'answer_kb_gap: unknown user %', p_answered_by;
  end;

  return query select v_faq_id, v_question, v_answer;
end
$$;

-- Server only. Supabase grants new functions to anon and authenticated by default.
revoke execute on function public.record_kb_gap(uuid, text, text, text, uuid) from public, anon, authenticated;
revoke execute on function public.answer_kb_gap(uuid, uuid, text, uuid, text) from public, anon, authenticated;
grant execute on function public.record_kb_gap(uuid, text, text, text, uuid) to service_role;
grant execute on function public.answer_kb_gap(uuid, uuid, text, uuid, text) to service_role;
