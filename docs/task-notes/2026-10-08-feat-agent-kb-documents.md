# Task notes: uploading documents to the knowledge base (route and background job)

Branch `feat/agent-kb-documents`. For Dev 2 (Shaaz) and Dev 3 (Dhatri).

## 1. What I built and why

A business owner can now upload a document (a price list, a brochure, a policy) and the assistant will be able to
answer from it. The upload endpoint reads the file, checks it, and saves its text; a background job then cuts the
text into pieces, turns each piece into numbers a search can compare, and marks the document ready. Until it is
ready the assistant does not use it, and if anything goes wrong the document shows as failed with a short message
the owner can act on. The owner can also delete a document, which removes it from the assistant's knowledge.

Technical details:

- **`POST /api/kb/documents`** (browser route, bearer token plus `X-Pakka-Tenant`): multipart `file` plus an
  optional `title`. Owner or admin only (staff get `forbidden`, before the upload is read). The router caps the body
  at 6 MB (413 above that); the service checks the 5 MB file limit itself so the answer has `fields.file`. It reads
  the text with the existing `extractText`, refuses a file that would need more than 500 chunks, stores the text in
  `kb_documents.body` (status `processing`, source `upload`) and sends `kb/document.uploaded`. Answer: 202
  `{ id, title, sourceType: "upload", status: "processing", createdAt }`. A business can keep up to 100 documents
  (FAQs are not counted); the 101st upload is `validation_failed` with `fields.file`.
- **`DELETE /api/kb/documents/:id`**: owner or admin; deletes an upload or imported document and its chunks (never
  an FAQ). 204, or `not_found`. This route is in contracts.md section 9 but was in none of my planned PRs, so it
  is here, next to the upload.
- **The `kb-ingest` job** (Inngest, event `kb/document.uploaded`): one run per document at a time, 3 retries per
  step, and 5 documents at a time in all. Steps: `load` (read the document, cut it into chunks), `embed-0`, `embed-1`,
  ... (32 chunks each, one step per batch, so a failing batch is retried alone), `store` (replace the document's chunks, then mark it `ready`).
  Running the same event twice changes nothing: a ready document is skipped, and the chunks are replaced, never
  added to. If it cannot finish the document becomes `failed` with a short plain `error`.
- **`kb-sweep`** (cron, every 10 minutes): a document still `processing` after 30 minutes becomes `failed` ("This file
  took too long to process. Upload it again."). It covers an upload whose job never started (the server stopped
  between saving and sending, or Inngest did not answer) or never finished, so the list never shows one that spins
  forever. The job's own limit is 15 minutes, so nothing that old is still running.
- **One shared set of building blocks** (`backend/src/kb/store.ts`, `ingest.ts`) that the FAQ routes in a later PR
  will reuse to embed and store an FAQ the moment it is saved.

## 2. Files changed and what each does

| File | What it does |
|---|---|
| `backend/src/kb/documents.ts` | The upload and delete services: role check, form reading, file and title checks, extraction, chunk limit, saving, starting the job |
| `backend/src/kb/store.ts` | Every database call of the knowledge base (service role). Each query names its business; errors are fixed words; each call has a timeout |
| `backend/src/kb/ingest.ts` | The job's logic, written against a minimal `step.run` so it is tested without Inngest |
| `backend/src/kb/events.ts` | The event name, its Zod shape (ids only) and the fixed event id |
| `backend/src/inngest/kb-ingest.ts` | Wires the logic to Inngest: trigger, per-document concurrency, retries, a last-resort failure handler |
| `backend/src/inngest/kb-sweep.ts` | The cron that fails documents stuck in `processing` |
| `backend/src/inngest/functions.ts` | **Shaaz's file:** two lines, registers `kbIngest` and `kbSweep` |
| `backend/src/server/routes.ts` | **Shaaz's file:** two route entries (`/api/kb/documents`, `/api/kb/documents/:id`) and their two small handlers |
| `docs/contracts.md` | The new event (section 5) and what is built (section 9) |
| tests | `kb/documents.test.ts`, `kb/store.test.ts`, `kb/ingest.test.ts`, `inngest/kb-ingest.test.ts`, `server/kb-routes.test.ts`, `test-support/fake-kb-store.ts` |

## 3. How to run / test it locally

```
pnpm --filter @pakka/backend exec vitest run src/kb src/inngest src/server/kb-routes.test.ts   # this PR's tests
pnpm typecheck && pnpm lint && pnpm test                                                        # everything
```

To try it for real (Docker, the local Supabase stack, and a real `EMBEDDINGS_API_KEY`): start the stack
(`pnpm db:start`), override the three Supabase values in the shell with the local ones from `pnpm db:status`, set
`INNGEST_DEV=1`, run `pnpm dev` and `pnpm inngest:dev`, sign in as an owner of a local business, then upload a
file from the Knowledge base screen (or `curl -F file=@price-list.txt` with the bearer token and
`X-Pakka-Tenant`). The document goes `processing`, then `ready`; `select status, error from kb_documents`
and `select count(*) from kb_chunks where document_id = ...` show it. Never run this with `backend/.env.local`'s
Supabase values: that file points at the shared staging project.

## 4. Decisions made

Need review by Dev 2 (Shaaz):

- **The upload is read in the request, not in the job.** The file is not kept (docs/kb-contract-checklist.md), so
  the only place its bytes exist is the request. Reading it there also lets a bad file be refused at once with
  `fields.file`, instead of showing up later as a failed document. The job works from `kb_documents.body`.
- **Extraction time is inside the request** (up to the existing 30 s parser timeout). A slow file holds one HTTP
  request, which Railway allows.
- **If Inngest refuses the event** the document is saved as `failed` ("Upload it again"), but only while it is still
  `processing`, and the route answers `upstream_failed`; the owner can delete it. **If Inngest does not answer in time**
  the result is unknown (the job may already be running), so the upload stands as `processing` and the route answers
  202: the job finishes it, or `kb-sweep` fails it after 30 minutes. Marking it failed would have shown a good
  document as failed and invited a duplicate upload.
- **Known failures are results, not errors.** No text, too much text, and a provider that refuses the request (a
  rejected key or input) end the document `failed` with a fixed message and the job run as successful (nothing to
  retry); a provider outage or rate limit is retried by Inngest. Messages for failures nobody planned for come from
  the error's name, which I could not confirm survives Inngest; if it does not, the message is the generic "Upload
  it again", which is safe.
- **Every database call is cancelled when its deadline passes** (an abort signal), so a call that gave up cannot
  land later and double a retried step's chunks. Replacing the chunks is still several requests, not one
  transaction; that is safe because the document is not `ready` until the last one succeeds.
- **Embed steps are 32 chunks**, so a step's remembered answer is about 300 to 400 KB and a 500-chunk document about
  6 MB in all.
- **A cap of 100 documents per business** (the contract had none), checked before the file is read, and at most 5
  ingest runs at once across all businesses, so a script cannot drive unlimited embedding spend.
- **The chunks are replaced in the last step, not in the first.** Deleting the old chunks first would leave a
  document with none if a later step failed. `match_kb_chunks` reads only `ready` documents, so the moment between
  deleting and inserting is invisible to customers either way.
- **`replaceChunks` checks the document belongs to the business before it writes.** `kb_chunks` only has a foreign
  key on the document's id, so without the check a wrong pair of ids could put one business's chunks under
  another's document.
- **Failure messages** come from a short fixed list (no text, too long, the embeddings service is unavailable, a
  generic "upload it again"). Errors from inside a job step arrive as plain errors with a name and message, so the
  check is by name, and only `AppError`, `EmbeddingsError` and our own non-retriable messages are shown.
- **A last-resort `onFailure` handler** marks a document still `processing` as failed if a run ends in a way the
  job body did not handle (a cancelled or timed-out run).
- **No migration, no new env variable.** Everything uses columns from 0011 and the existing embeddings settings.

Need review by Dev 3 (Dhatri): the response shapes in section 6.

## 5. For Dev 2 (Shaaz)

- **Inngest resync after deploy:** two new functions are registered. In the Inngest dashboard, sync the app (or let
  the deploy do it) and check `kb-ingest` (trigger `kb/document.uploaded`) and `kb-sweep` (cron every 10 minutes)
  appear.
- **Env vars:** none new. The upload needs `EMBEDDINGS_API_KEY` (already required) and the Inngest keys
  (`INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`) that the API already needs.
- **Review your files:** `inngest/functions.ts` (one line) and `server/routes.ts` (two entries; the upload handler
  calls `requireTenant` itself because `tenantRoute` reads JSON for POST and this body is a form).
- **No migration.**
- **The embeddings account is rate-limited hard.** In my test, a one-chunk document embedded fine, but an 80 KB
  document (about 20,000 tokens in one request) got 429 on every try, and calls beyond about 3 a minute got 429
  too. That looks like the provider's free-tier limits (requests and tokens per minute); I could not confirm the
  numbers. A real brochure will hit it. The account needs a payment method or a higher tier before customers
  upload, and it is worth checking now (Raja owns the account). Until then a big upload ends `failed` with "We
  couldn't reach the embeddings service. Try again in a moment."

## 6. For Dev 3 (Dhatri)

- **Upload:** `POST /api/kb/documents` through `frontend/lib/api/client.ts` (`postForm`). Response 202:
  `{ id, title, sourceType: "upload", status: "processing", createdAt }`. The status then changes in the database:
  watch `kb_documents` through Realtime (it is in the publication) and poll while a row is `processing`.
- **Statuses:** `processing` (the job has not finished), `ready`, `failed`. When `failed`, `kb_documents.error` is a
  short plain sentence you can show as it is (for example "We couldn't reach the embeddings service. Try again in a
  moment." or "This document has no text to learn from."). Offer "upload again" and "delete"; there is no retry
  button because the file is not kept.
- **Errors:** the usual envelope. `validation_failed` with `fields.file` (too big, empty, wrong kind, unreadable,
  too much text, not a form upload) or `fields.title` (over 200 characters). `forbidden` for staff. A body over 6 MB
  is a 413 `validation_failed` without `fields`.
- **Title:** optional; with none, the file name without its extension.
- **Delete:** `DELETE /api/kb/documents/:id` answers 204 with no body; `not_found` if it is already gone. It does not
  delete FAQs (use the FAQ route when it lands).
- Do not assume `kb_documents.body` is returned or needed in the list: the list is `id, title, source_type,
  status, created_at` (and `error` for failed rows).

## 7. Follow-ups / not done in this PR

- **FAQ routes and the gaps routes** (PR 8), which reuse `kb/store.ts` and `kb/ingest.ts`.
- **A per-minute upload limit per business.** There is a cap on documents and on concurrent ingest runs, not on
  uploads per minute.
- **Website import** (`POST /api/onboarding/import-site`) is separate and not in this PR.
- **Replacing a document** (upload again to update it) is out of v1: delete and upload.
- **Raising the embeddings provider's rate limit** (see section 5).
