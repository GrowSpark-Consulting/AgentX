-- Index rules from the 9-day plan (Day 1): tenant_id everywhere, provider_msg_id,
-- phone_number_id, and the knowledge-base vector index. Run: pnpm db:test
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

-- Guard for future migrations: any table with a tenant_id column needs an index that starts with it.
select is(
  (select array_agg(c.relname::text order by c.relname)
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
     join pg_attribute a on a.attrelid = c.oid and a.attname = 'tenant_id' and not a.attisdropped
    where n.nspname = 'public' and c.relkind = 'r'
      and not exists (
        select 1 from pg_index i join pg_attribute ia on ia.attrelid = i.indrelid and ia.attnum = i.indkey[0]
        where i.indrelid = c.oid and ia.attname = 'tenant_id')),
  null,
  'every table with tenant_id has an index that starts with tenant_id');

select ok(
  exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'messages'
            and indexdef ilike 'create unique index%(provider_msg_id)%'),
  'messages.provider_msg_id has a unique index (webhook dedupe)');

select ok(
  exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'whatsapp_connections'
            and indexdef ilike 'create unique index%(phone_number_id)%'),
  'whatsapp_connections.phone_number_id has a unique index (tenant lookup)');

select ok(
  exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'kb_chunks'
            and indexdef ilike '%using hnsw%' and indexdef ilike '%vector_cosine_ops%'),
  'kb_chunks.embedding has an HNSW cosine index');

select * from finish();
rollback;
