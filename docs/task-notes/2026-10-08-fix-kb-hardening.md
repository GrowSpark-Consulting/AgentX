# fix/kb-hardening: timeouts, retries, parser limits and text cleaning (review of #49)

Audience: Dev 2 (Shaaz) and Dev 3 (Dhatri).

## 1. What I built and why

Shaaz's review of the knowledge-base PR (#49) found places where one bad file, a slow provider or a
strange character could hang the API, use up its memory, or make a database write fail. This PR closes
all of them. Uploading a normal PDF, Word file or text file works exactly as before. What changes is that
a file that is too big, too long, damaged, password-protected or not UTF-8 is now refused up front with a
plain message, and the embeddings service is called with a time limit and a few careful retries.

Technical summary:

- **Timeouts.** Embeddings: 10 s per try (the WhatsApp adapter's pattern, now a shared helper
  `lib/timeout.ts`). `match_kb_chunks`: 5 s. File parsing: 30 s.
- **Retries (embeddings only).** 429, 5xx, network failures and timeouts: up to 3 tries, waiting 250 ms then
  750 ms (or the provider's `Retry-After` if longer, and if it asks for more than 2 s we stop). 400, 401,
  403 and every other 4xx fail at once. The HTTP status is kept on `EmbeddingsError.upstreamStatus`. The log
  line holds the status only: never the key, the body, the URL or the text.
- **PDF.** Pages are counted before any text is read (limit 200). The document opened for counting is
  destroyed in a `finally`; the text is then read by passing the bytes to unpdf, which frees its own
  document. (This replaces the old code that kept the document open.)
- **Word (.docx).** A small zip reader (`kb/zip.ts`, built on `node:zlib`, no new dependency) reads the
  file, caps the real inflated bytes (20 MB) and the number of entries (1000), and rejects ZIP64,
  multi-disk, encrypted and overlapping-entry archives. It then writes a clean uncompressed copy, and only
  that copy is given to mammoth. A header that lies about the size cannot get past it.
- **Cleaning.** All extracted text loses NUL and other control characters (tab and newline stay), form feed
  and vertical tab become line breaks, and lone surrogates are removed. Text files are decoded strictly as
  UTF-8. The same cleaning (`lib/text.ts`) is applied to what WhatsApp sends us (message text, contact
  name, button id, media id and type), because one NUL would make the insert fail and Meta would resend the
  batch.
- **Chunking.** A chunk can no longer start in the middle of an emoji after the overlap step-back.
- **Config.** `EMBEDDINGS_API_KEY` is now required; `EMBEDDINGS_BASE_URL` must be https (also
  `localhost`). Provider answers are checked for count and for indexes exactly 0..n-1.

## 2. Files changed and what each does

| File | What |
|---|---|
| `backend/src/lib/timeout.ts` (+test) | `withTimeout(run, ms)`: aborts the signal at the deadline and rejects with `TimeoutError`, even if the work ignores the signal. |
| `backend/src/lib/text.ts` (+test) | `stripUnsafeCharacters`: NUL, control characters, C1, lone surrogates. |
| `backend/src/kb/zip.ts` (+test, `zip-fixtures.ts`) | The checked zip reader and the clean zip writer. `zip-fixtures.ts` builds honest and dishonest zips for tests only. |
| `backend/src/kb/extract.ts` (+test) | Limits (5 MB file, 200 pages, 20 MB unzipped, 1000 entries, 1,000,000 characters of text, 30 s), page count with destroy, strict UTF-8, cleaning. |
| `backend/src/kb/embeddings.ts` (+test) | Timeout, retry with backoff, status kept, https and key checks, index check, `redirect: "error"`. |
| `backend/src/kb/chunk.ts` (+test) | Start of the next chunk is moved off a low surrogate. |
| `backend/src/kb/retrieve.ts` (+test) | 5 s timeout on `match_kb_chunks`, abort signal, no retry, class/code-only logging. |
| `backend/src/channels/whatsapp/inbound.ts` | Cleans the customer text, contact name, button id, media id and type before storing. Test in `server/webhook-post.test.ts`. |
| `backend/src/lib/env.ts` (+test), `backend/.env.example` | `EMBEDDINGS_API_KEY` required, `EMBEDDINGS_BASE_URL` https only. |
| `backend/src/server/webhook*.test.ts` | Add a test value for `EMBEDDINGS_API_KEY`. |
| `docs/embeddings-evaluation.md`, `docs/task-notes/2026-10-07-feat-agent-kb-ingestion.md` | Two statements that were no longer true now match the code. |

## 3. How to run / test it locally

```
pnpm typecheck
pnpm lint
pnpm test
pnpm --filter @pakka/backend exec vitest run src/kb src/lib      # just this area
pnpm db:start && pnpm db:test                                    # no migrations here; see the note below
```

`backend/.env.local` needs `EMBEDDINGS_API_KEY` (the API will not start without it).

`pnpm db:test` fails locally in `signup.test.sql` ("salon is not an active pack") if your local database has
`vertical_packs` rows from running the real-estate pack branch. That is local data, not this PR; CI builds
the database from scratch. `pnpm db:reset` gives a clean one.

## 4. Decisions made (and which need review)

- **Limits:** 5 MB file (the route's existing limit, repeated in `extractText`), 200 PDF pages, 20 MB
  unzipped, 1000 zip entries, 1,000,000 characters of extracted text, 30 s of parsing. *Review: Shaaz.*
- **Zip safety by rebuilding:** we inflate each entry ourselves with a hard output cap, then give mammoth a
  rebuilt stored zip. Checking headers alone is not safe, because a header can lie and jszip could disagree
  with a header-based check about what is in the file.
- **Overlapping entries are refused.** Without this, a 5 MB file listing one stream 1000 times took about 26 s
  of blocked CPU.
- **PDF is opened twice** (once to count pages, once to read text). Simpler and safer than keeping a
  document open across steps; cost is bounded by the 200-page limit.
- **Retry policy:** 3 tries, 250 ms / 750 ms backoff, `Retry-After` honoured up to 2 s. Embeddings are
  read-only, so a retry never does anything twice. The Supabase search is not retried.
- **Live reply path:** `embedQuery` can still take up to about 31 s in the worst case (3 tries of 10 s plus
  waits). The agent pipeline should put an overall deadline around retrieval. *Review: Shaaz.*
- **https only, including localhost** for `EMBEDDINGS_BASE_URL`: the key is sent to it.
- **Form feed / vertical tab become newlines** so PDF page breaks do not glue words together.
- **Other 4xx (404, 422) fail at once.** A 401 or 403 (bad key) still shows the user "try again in a
  moment"; ops sees the status in the log.
- **Shaaz's docs are not edited here** (see section 5).

## 5. For Dev 2 (Shaaz)

- **Before deploy:** set `EMBEDDINGS_API_KEY` on Railway for every environment. Without it the API refuses to
  start (the log names the variable, never its value). `EMBEDDINGS_BASE_URL` must be https if you override it.
- **Needs a one-line change in files that are yours/Dhatri's (not touched here):**
  - `frontend/playwright.config.ts`, `apiEnv` (about line 29): add a placeholder `EMBEDDINGS_API_KEY`, or
    `pnpm test:e2e` will not start the API without a real key. CI does not run e2e today.
  - `docs/environments.md` (the variables list, about line 162): add `EMBEDDINGS_API_KEY`.
- **Stale lines in your docs:** `docs/contracts.md:33` (Cohere `embed-multilingual-v3.0`; you are changing it
  to Voyage `voyage-4`) and `docs/kb-contract-checklist.md:18` (says the key is optional and that there is no
  base URL or model variable; both now exist, and the key is required).
- **Supabase calls without a timeout** in files that are yours (`lib/supabase-admin.ts`, `billing/credits.ts`,
  `notify/send.ts`): the supabase-js client has no request timeout. The simplest fix is a `global.fetch`
  wrapper with `AbortSignal.timeout(...)` in `supabase-admin.ts`. Not done here.
- **When you write the upload route (PR 1b):** `extractText` throws `AppError` `validation_failed` with
  `fields.file` for every file problem; `embedDocuments` throws `EmbeddingsError` (`upstream_failed`, with
  `upstreamStatus`). It no longer throws `not_available`. Keep the route's `maxBodyBytes` at 6 MB.
- **Inngest resync:** not needed. **Migrations:** none.
- The model-per-vector migration and the `contracts.md` Voyage text are still yours.

## 6. For Dev 3 (Dhatri)

You can now show the user the exact `fields.file` message for these cases (use it as is):

- over 5 MB: "This file is larger than 5 MB. Split it into smaller files."
- PDF over 200 pages: "This PDF has more than 200 pages. Split it into smaller files."
- Word file too big or too complex (unzips to more than 20 MB or has more than 1000 parts): "This Word file is
  too large or too complex to open safely. Remove large images or split it into smaller files."
- password-protected or unusual Word file: "...password-protected or uses a format we can't open. Open it in Word,
  save a copy as a normal .docx, and upload that."
- text file not in UTF-8: "This text file isn't UTF-8. Save it as UTF-8 ... and upload it again."
- too much text (over 1,000,000 characters): "This file has too much text. Split it into smaller files."
- parsing took too long, scanned or empty, damaged: fixed messages as in `extract.ts`.

Do not assume the wording is final or that these are the only messages: show `fields.file` as it comes, and
keep the 5 MB check in the file picker as a courtesy only (the server checks it).

## 7. Follow-ups / not done in this PR

- Supabase request timeout for the shared client (Shaaz's files, above).
- An overall deadline for retrieval on the live reply path.
- Not tested with a real Google Docs export (none available offline here). Tested with 17 files from
  mammoth's corpus (13 saved by Microsoft Word, 1 by LibreOffice 3.5, 3 generated) and a rewrite of each
  with data descriptors: identical text through our path as through mammoth alone, and the same entry names.
- Bidirectional-override and zero-width characters are not stripped (harmless to Postgres).
- No upload route exists yet, so the limits are covered by unit tests and a manual run against the real
  unpdf and mammoth, not end to end.
