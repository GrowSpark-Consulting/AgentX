# Knowledge base: contracts Dev 3 needs from Dev 1

Owner: Dev 3 (questions), Dev 1 (answers). Status on 7 Oct 2026: **PROPOSED, pending Shaaz** (migration, new
table and columns, Realtime, `match_kb_chunks`) **and Raja** (Documents section meaning, who may answer gaps,
write roles). Nothing is agreed until Shaaz and Dhatri have reviewed it. The agreed form goes into
[contracts.md](contracts.md) section 9.

Each item below is Dev 1's proposed answer, not a built feature.

## What exists today (origin/main)

| | Status |
|---|---|
| `kb_documents`, `kb_chunks` | 0001: members read under RLS, cannot write. HNSW index in 0004. No `status` column. |
| KB code, embeddings client | Not built (`backend/src/kb/` is empty). |
| Schema: `status`/`error`/`body`, one FAQ per question, `kb_gaps`, Realtime, `match_kb_chunks` | Built in `0011_knowledge_base` (Shaaz); see [contracts.md](contracts.md) section 9. |
| `EMBEDDINGS_API_KEY` | In the env schema (optional). No provider, base URL or model variable yet. Provider choice is provisional ([embeddings-evaluation.md](embeddings-evaluation.md)). |
| Inngest | Wired on the API; only `ping` registered. |
| `kb_gap` | A `HandoffTrigger` only; no gap table. |

## Where the routes live

On the Railway API (`backend/src/server/routes.ts`), not in `frontend/app/api` (removed in #37), at
`${NEXT_PUBLIC_API_URL}/api/kb/...`. Authorization: `Bearer <Supabase access token>`; the business is named by
`X-Pakka-Tenant`, honoured only for one of the caller's memberships.

**For Dhatri (Dev 3):**
- The tenant comes from the token and the `X-Pakka-Tenant` header, **never the body**.
- Your Playwright mock must mock the **API on port 4000** for the KB routes, as well as Supabase for the RLS
  reads.
- Errors use the `{ error: { code, message, fields? } }` envelope. Too-large and unsupported files are
  `validation_failed` with `fields.file` (limit 5 MB; pdf, docx, txt, md). No new error codes.
- Call routes through `frontend/lib/api/client.ts`.

## Proposed answers

1. **FAQ storage:** `kb_documents` with `source_type = 'manual'`, one row per FAQ (`title` = question, new
   `body` column = answer) plus one chunk. Routes: `POST /api/kb/faqs`, `PATCH|DELETE /api/kb/faqs/:id`,
   `{ q, a }` -> `{ id, q, a }`, q <= 300 and a <= 2000 chars, duplicate question = `conflict`. The list is a
   direct RLS read of `kb_documents`.
2. **Gaps:** new table `kb_gaps` (RLS, unique `(tenant_id, question_norm)`, `asked_count`, `last_asked_at`,
   `last_contact_id`, `status open|answered|dismissed`, `answered_faq_id`). Pipeline step 5 upserts a gap when
   retrieval is below the threshold, the same event that feeds the `kb_gap` handoff after two misses.
   `GET /api/kb/gaps` -> `[{ id, question, askedCount, lastAskedBy }]`, open only, `askedCount` desc,
   `lastAskedBy` = contact name or masked number. `POST /api/kb/gaps/:id/answer { a }` creates the FAQ and
   closes the gap in one transaction; `POST /api/kb/gaps/:id/dismiss` closes it without an answer.
3. **Upload:** `POST /api/kb/documents`, multipart `file` (+ optional `title`), pdf, docx, txt or md, <= 5 MB.
   Response `202 { id, title, sourceType: 'upload', status: 'processing', createdAt }`.
4. **Statuses:** `kb_documents.status` in `processing | ready | failed`, with `error text`. New columns, so a
   migration. FAQs are `ready` on save.
5. **Document list:** keep the direct RLS read: `id, title, source_type, status, created_at`.
6. **Effect on replies:** FAQ saves and gap answers embed inline, so replies see them at once; an embed
   failure leaves the row `failed` and the route answers `upstream_failed`. Uploads are live when `ready`.
7. **Processing:** uploads run in an idempotent Inngest job (`kb/document.uploaded`, keyed on the document id,
   chunks deleted before re-insert). FAQ saves are synchronous.
8. **Refresh:** Realtime on `kb_documents` (added to the publication in the migration), with polling while a
   row is `processing`.
9. **Conflicts:** `status` gets a column (answer 4). The Documents section means knowledge sources
   (`kb_documents`); "documents Maya can send" are customer-facing files, a different feature, deferred
   (**Raja decides**).

Also proposed: `DELETE /api/kb/documents/:id` (chunks cascade). Roles: owner and admin write; staff answering
gaps is **to confirm with Raja**. Replace and file storage (bucket) are out of v1: the file is read, chunked and
discarded.

## Who decides

| | |
|---|---|
| **Shaaz** | The migration (columns, `kb_gaps`, Realtime, `match_kb_chunks`); and `backend/src/server/` (below). |
| **Raja** | The Documents section meaning, who may answer gaps, write roles. |
| **Dhatri** | Review of the routes and shapes; the UI switch-on. |

**Router and upload-limit changes: built** (Shaaz). `:name` path segments reach handlers as `params`,
`PATCH` and `DELETE` are supported (preflight included), and a route's `maxBodyBytes` replaces the 1 MB
default before the body is read. `tenantRoute(handler, { status })` passes `params` and answers 204 when the
service returns nothing. See [contracts.md](contracts.md) section 9. `backend/src/server/` is Shaaz's: ask
before changing it.

## Build order

1. This contract. 2. Migration (next free number at merge time; 0010 is taken by inbox Realtime). 3.
`backend/src/kb` and the embeddings client with a mocked provider. 4. Router and body-limit PR. 5. Upload and the
Inngest job. 6. FAQ routes. 7. Gaps. **6 and 7 may slip to Day 3.**

## What Dev 3 does once these are agreed

1. Add typed reads and writes in `frontend/features/knowledge/kb-content.ts` (Zod-parsed; API calls through
   `lib/api/client.ts`).
2. In `knowledge-screen.tsx`, replace the `unavailable` sources for FAQs and gaps with loaded data and pass
   `onAdd` / `onAnswer`; give `Documents` an upload action and the status.
3. Extend the Playwright mock for the API (port 4000) and `frontend/tests/e2e/support/mock-supabase.mjs` for the
   RLS reads; add tests: FAQ create, edit, delete; answer a gap; upload and its states.
4. Add pgTAP tests for the new table's RLS and run `pnpm db:test` on a machine with Docker.
