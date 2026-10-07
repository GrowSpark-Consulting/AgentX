# Task notes: knowledge base, PR 1a (embeddings, text extraction, chunking, retrieval)

Branch `feat/agent-kb-ingestion`. For Dev 2 (Shaaz) and Dev 3 (Dhatri).

## 1. What I built and why

The AI assistant has to answer from a business's own documents. Before it can, the server needs four
building blocks: turn a question or a piece of text into numbers a search can compare, read the text out of
an uploaded file, cut long text into pieces, and find the pieces that best answer a question. This PR adds
those four blocks and nothing else. It adds **no route, no background job and no database change**; the
upload route and the background job that use these blocks come in PR 1b, after this merges.

Technical details:

- **Embeddings client** (`backend/src/kb/embeddings.ts`): Voyage `voyage-4`, 1024 dimensions (matches
  `kb_chunks.embedding vector(1024)`), documents and queries sent with different `input_type`, 64 texts per
  request, every answer checked with Zod (1024 numbers per row, one row per input). A provider error
  becomes `upstream_failed` and never carries the provider's body or the key. A missing
  `EMBEDDINGS_API_KEY` is `not_available` and names the variable; nothing is skipped silently.
- **Text extraction** (`extract.ts`): pdf (`unpdf`), docx (`mammoth`, raw text), txt and md (UTF-8). The type
  comes from the file name and is confirmed from the file's first bytes. A file with no readable text (a
  scan) or one that can't be parsed is `validation_failed` with `fields.file`, with a fixed message (the
  parser's own message can contain paths).
- **Chunking** (`chunk.ts`): about 1000 characters per chunk with 150 overlap, cut at a paragraph, line,
  sentence or space, never inside a surrogate pair. More than 500 chunks is `validation_failed` with
  `fields.file`.
- **Retrieval** (`retrieve.ts`): `retrieveKb(tenantId, query, k = 5)` embeds the query, calls
  `match_kb_chunks(p_tenant_id, p_query, p_k)` and drops rows under `KB_MIN_SIMILARITY` (0.45, provisional).
  Returns `{ chunkId, documentId, title, content, similarity }[]`; `[]` means the knowledge base has no
  answer.

## 2. Files changed and what each does

| File | What it does |
|---|---|
| `backend/src/kb/embeddings.ts` (+test) | Embeddings client and `embeddingsClient()` built from the server env |
| `backend/src/kb/extract.ts` (+test) | `fileKind(name)`, `extractText({ name, bytes })` |
| `backend/src/kb/chunk.ts` (+test) | `chunkText(text)` and the size, overlap and maximum constants |
| `backend/src/kb/retrieve.ts` (+test) | `retrieveKb` and `KB_MIN_SIMILARITY` |
| `backend/src/lib/env.ts` (+test) | New `EMBEDDINGS_BASE_URL` (default `https://ai.mongodb.com/v1`) and `EMBEDDINGS_MODEL` (default `voyage-4`) |
| `backend/.env.example` | The two new variables, commented out with their defaults |
| `backend/package.json`, `pnpm-lock.yaml` | `unpdf` 1.8.1 and `mammoth` 1.13.0, pinned exactly |

## 3. How to run / test it locally

```
pnpm --filter @pakka/backend exec vitest run src/kb src/lib/env.test.ts   # this PR's tests
pnpm typecheck && pnpm lint && pnpm test                                  # everything
pnpm db:reset && pnpm db:test                                             # database tests (Docker)
```

The unit tests mock the embeddings provider and the database; no key is needed and no real API is called.
To try real embeddings, set `EMBEDDINGS_API_KEY` in `backend/.env.local` (the key is an Atlas model API key).
After `git pull`, run `pnpm db:reset` first: a database left at an older migration makes `pnpm db:test`
fail (it happened to me with 0012).

## 4. Decisions made

Need review by Dev 2 (Shaaz):

- **New dependencies** in `backend/`: `unpdf` (MIT, 2.5 MB installed) and `mammoth` (BSD-2-Clause, about
  6.6 MB with its dependencies). `pnpm audit --prod` shows no high or critical findings and **one moderate**:
  `sprintf-js` <= 1.1.3 (denial of service), reached through `mammoth > argparse > sprintf-js`. It is used by
  mammoth's command-line tool, not by `extractRawText`, which is all we call. Accepted for now, no pnpm
  override.
- **Embeddings endpoint**: the default `EMBEDDINGS_BASE_URL` is the MongoDB Atlas endpoint for Voyage
  models, because our key is an Atlas model API key. A Voyage-direct key would need
  `https://api.voyageai.com/v1`.
- **Voyage only**: no Cohere fallback in this PR (a follow-up).

Need review by Dev 3 (Dhatri): none for this PR. It has no route and no response shape.

Decided, for information:

- `KB_MIN_SIMILARITY = 0.45` is a starting guess, to be tuned with the 15-query eval set.
- `p_query` is sent as the JSON text of the vector (`[0.1,0.2,...]`), which pgvector accepts.
- Isolation between businesses and "ready documents only" are enforced inside `match_kb_chunks` and are
  covered by `supabase/tests/knowledge_base.test.sql` (`pnpm db:test`). The unit tests here only check that
  `retrieveKb` passes the tenant through.
- Not tested against the real provider: the unit tests mock it. The real `unpdf` and `mammoth` were run once
  by hand on a small PDF and a Tamil docx under `tsx` and returned the right text.

## 5. For Dev 2 (Shaaz)

- **Deploy:** add `unpdf` and `mammoth` (they install with `pnpm install`). Nothing else changes at runtime
  until PR 1b uses them.
- **Env on Railway:** `EMBEDDINGS_API_KEY` must be set before PR 1b ships. `EMBEDDINGS_BASE_URL` and
  `EMBEDDINGS_MODEL` have defaults and need setting only to override them.
- **Inngest resync:** not needed for this PR (no new function). PR 1b adds `kb/document.uploaded`, which will
  need a resync after deploy.
- **Migrations:** none. `backend/src/server/` is untouched.
- Before touching related code: `retrieveKb` takes its `tenantId` from the caller, so callers must pass a
  tenant from a verified context (`requireTenant`, or the webhook's connection row), never from a request
  body or event data a user could influence.

## 6. For Dev 3 (Dhatri)

Nothing to build from this PR; there is no new route or shape. Don't assume uploads work yet: the
`POST /api/kb/documents` route comes in PR 1b. The contract in `docs/contracts.md` section 9 is still
PROPOSED and unchanged by this PR.

## 7. Follow-ups / not done in this PR

- PR 1b: `POST /api/kb/documents`, the `kb/document.uploaded` Inngest function, and `kb_documents.body`
  storage of the extracted text (kept after the document is ready, so it can be re-embedded later).
- Cohere `embed-multilingual-v3.0` as a fallback provider.
- Tune `KB_MIN_SIMILARITY` and re-run the embeddings comparison with real business content.
- Decide whether to add a pnpm override for the `sprintf-js` finding if mammoth's CLI path ever matters.
