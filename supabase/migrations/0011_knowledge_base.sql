-- 0011_knowledge_base: storage for the dashboard's Knowledge base and for retrieval (docs/contracts.md,
-- section 9 and decision 14; docs/kb-contract-checklist.md). The contract is Dev 1's proposal (#38);
-- this is its migration part.
--
-- 1. kb_documents gains status (processing | ready | failed), error and body (an FAQ's answer). Rows
--    that exist now already have their chunks, so they become ready; new rows start as processing
--    until the ingest job or the FAQ route has stored their chunks.
-- 2. One FAQ per question per business: a second manual row with the same question (ignoring case and
--    surrounding spaces) is refused, so the FAQ route can answer `conflict` even for two saves at once.
-- 3. kb_gaps: questions the AI couldn't answer, one row per business and normalised question. Members
--    read their business's rows; only server code writes them.
-- 4. Realtime: kb_documents joins supabase_realtime, so the dashboard sees a document become ready.
-- 5. match_kb_chunks: the nearest chunks of a business's ready documents (service_role only).

-- kb_documents: status, error, body -----------------------------------------------------------------

alter table public.kb_documents
  add column status text not null default 'ready'
    constraint kb_documents_status_check check (status in ('processing', 'ready', 'failed')),
  add column error text,
  add column body text;

alter table public.kb_documents alter column status set default 'processing';

create unique index kb_documents_faq_question_idx
  on public.kb_documents (tenant_id, lower(btrim(title)))
  where source_type = 'manual';

-- kb_gaps ---------------------------------------------------------------------------------------------

create table public.kb_gaps (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  question text not null,                          -- as the customer first asked it
  question_norm text not null check (question_norm <> ''),  -- the pipeline's normalised form
  asked_count int not null default 1 check (asked_count > 0),
  last_contact_id uuid references public.contacts(id) on delete set null,
  last_asked_at timestamptz not null default now(),
  status text not null default 'open' check (status in ('open', 'answered', 'dismissed')),
  answered_faq_id uuid references public.kb_documents(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (tenant_id, question_norm)
);

-- The dashboard's list: open gaps, most asked first.
create index kb_gaps_open_idx on public.kb_gaps (tenant_id, asked_count desc) where status = 'open';
create index kb_gaps_last_contact_id_idx on public.kb_gaps (last_contact_id);
create index kb_gaps_answered_faq_id_idx on public.kb_gaps (answered_faq_id);

alter table public.kb_gaps enable row level security;
create policy tenant_read on public.kb_gaps
  for select to authenticated using (public.is_member(tenant_id));

-- Realtime --------------------------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  -- A publication FOR ALL TABLES already includes it (and refuses ADD TABLE).
  if (select puballtables from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'kb_documents'
  ) then
    alter publication supabase_realtime add table public.kb_documents;
  end if;
end
$$;

-- match_kb_chunks -------------------------------------------------------------------------------------

-- The k nearest chunks (cosine) of one business's ready documents, most similar first. The HNSW index
-- (0004) finds candidates before the tenant and status filters, so iterative scanning keeps searching
-- until k rows pass them; relaxed order can return them slightly out of order, so the outer query
-- sorts them again. similarity = 1 - cosine distance. k is capped at 50.
create function public.match_kb_chunks(p_tenant_id uuid, p_query extensions.vector(1024), p_k int default 5)
returns table (chunk_id uuid, document_id uuid, title text, content text, similarity double precision)
language sql stable
set search_path = ''
set hnsw.iterative_scan = relaxed_order
as $$
  with nearest as materialized (
    select c.id, c.document_id, d.title, c.content,
           c.embedding operator(extensions.<=>) p_query as distance
    from public.kb_chunks c
    join public.kb_documents d on d.id = c.document_id and d.tenant_id = p_tenant_id
    where c.tenant_id = p_tenant_id
      and d.status = 'ready'
      and c.embedding is not null
    order by c.embedding operator(extensions.<=>) p_query
    limit least(greatest(coalesce(p_k, 5), 1), 50)
  )
  select id, document_id, title, content, 1 - distance
  from nearest
  order by distance
$$;

-- Server only. Supabase grants new functions to anon and authenticated by default.
revoke execute on function public.match_kb_chunks(uuid, extensions.vector, int) from public, anon, authenticated;
grant execute on function public.match_kb_chunks(uuid, extensions.vector, int) to service_role;
