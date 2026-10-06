-- 0004_kb_vector_index: nearest-neighbour index for knowledge-base retrieval (9-day plan,
-- Day 1: "indexes (... vector index)").
--
-- Embeddings: Cohere embed-multilingual-v3.0 at 1024 dimensions (docs/embeddings-evaluation.md),
-- compared by cosine distance. Retrieval must order by `embedding <=> $query` (the cosine
-- operator) and filter by tenant_id for this index to be used.

create index kb_chunks_embedding_hnsw_idx on public.kb_chunks
  using hnsw (embedding extensions.vector_cosine_ops);
