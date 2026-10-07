# Knowledge base: contracts Dev 3 needs from Dev 1

Owner: Dev 3. For: Dev 1 (Nithisha). Status on 7 Oct 2026: **open**. Nothing below is decided. Each
answer becomes a contract through a pull request, as for [contracts.md](contracts.md).

The real Knowledge base page (`/dashboard/knowledge`, code in `frontend/features/knowledge/`) already
has its services editor and a read-only documents list. The FAQ, unanswered-question and upload parts
are built in the UI but switched off, because no storage, API or shape exists for them. This list is
what's needed to switch them on.

## What exists today

| | Status | Where |
|---|---|---|
| `kb_documents` | Table; members read under RLS, cannot write | 0001: `id, tenant_id, source_type, source_url, title, created_at` (no status column) |
| `kb_chunks` | Table; members read under RLS, cannot write | 0001, HNSW index in 0004 |
| `POST /api/kb/documents` | HANDOVER, not built: "upload a document, chunk and embed it" | handover.md, API table |
| `POST /api/onboarding/import-site` | HANDOVER, not built (also "Sync website again") | handover.md, API table |
| FAQs | PROPOSED only: `POST\|PATCH /api/kb/faqs`, shape `{ id, q, a }` | dashboard-screen-contracts.md |
| Unanswered questions | PROPOSED only: `GET /api/kb/gaps`, shape `{ id, question, askedCount, lastAskedBy }`; open question 3 ("no table") | dashboard-screen-contracts.md |
| `kb_gap` | Agreed handoff trigger | `@pakka/types` `HandoffTrigger` |

**Conflicts to settle:**

- The PROPOSED `documents.status` (`processing | ready | failed`) has no column in `kb_documents`.
- The prototype's "Documents Maya can send" (files sent to customers, with send counts) aren't the same
  thing as `kb_documents` (sources the AI learns from). Which one is the dashboard's Documents section?

## FAQs

- [ ] Storage model: a new table, `kb_documents` (`source_type = 'manual'`) with chunks, or something else
- [ ] List / read: direct RLS read or an API route; ordering; paging
- [ ] Create: route, request shape, response shape
- [ ] Update: route, request shape, response shape
- [ ] Delete: route and response
- [ ] Validation: required fields, length limits, duplicate questions
- [ ] Tenant behaviour: tenant from the session only; who may write (owner, admin, staff?)
- [ ] Re-embedding: does a save affect AI replies immediately, or after an async job? How does the UI
      know it's done?
- [ ] Error codes the UI should expect (from `ERROR_CODES`)

## Unanswered questions (gaps)

- [ ] Storage: table and columns
- [ ] Creation: which pipeline step records a gap, when, and how repeats are counted
- [ ] List: `GET /api/kb/gaps` or a direct RLS read; filters (open only?), ordering, paging
- [ ] Response shape: confirm or replace `{ id, question, askedCount, lastAskedBy }`; what `lastAskedBy`
      holds (a contact name? masked number?)
- [ ] Answer operation: route, request and response
- [ ] Does answering create an FAQ? Does it close the gap? Is there a "dismiss" without answering?
- [ ] Tenant behaviour and roles (screen inventory proposes staff may answer gaps: to confirm with Raja)
- [ ] Relation to the `kb_gap` handoff trigger, if any

## Documents and upload

- [ ] `POST /api/kb/documents`: request (multipart field names, any other fields such as a title)
- [ ] Accepted file types and maximum size
- [ ] Response shape
- [ ] Processing states and where they live (new column, separate table, job status)
- [ ] Synchronous or asynchronous processing (an Inngest job?)
- [ ] How the UI learns a document is ready or failed: Realtime on a table, polling, or the response
- [ ] Document list: keep the direct RLS read of `kb_documents`, or a route; which fields
- [ ] Delete or replace a document: in scope for v1?
- [ ] Storage: bucket name and access rules, if the file itself is kept

## What Dev 3 does once these are answered

1. Add typed reads and writes in `frontend/features/knowledge/kb-content.ts` (Zod-parsed, tenant from
   the session, the same pattern as `data.ts` for services).
2. In `knowledge-screen.tsx`, replace the `unavailable` sources for FAQs and gaps with loaded data and
   pass `onAdd` / `onAnswer`. `FaqList` and `GapsList` already render ready lists and switch their
   buttons on when given a handler; `Documents` gets an upload action and, if agreed, a status.
3. Extend `frontend/tests/e2e/support/mock-supabase.mjs` with the agreed tables or routes, per test
   account (`POST /__mock/services-account`), and add Playwright tests in
   `frontend/tests/e2e/app/knowledge.spec.ts`: FAQ create, edit, delete; answer a gap; upload with its
   states.
4. Add pgTAP tests for any new table's RLS, and run `pnpm db:test` on a machine with Docker.
