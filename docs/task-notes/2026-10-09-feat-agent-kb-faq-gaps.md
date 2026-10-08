# feat/agent-kb-faq-gaps: FAQ and "questions the AI couldn't answer" routes

Audience: Dev 2 (Shaaz) and Dev 3 (Dhatri).

## 1. What I built and why

A business owner can now teach the assistant directly. They write a question and its answer (a FAQ), and the assistant
can use it in its very next reply. When the assistant couldn't answer a customer's question, that question shows up in
a list (most asked first); a team member can type the answer right there, which turns it into a FAQ, or dismiss it if
it isn't worth answering. This is the backend for the Knowledge screen's FAQ and "Questions the AI couldn't answer"
sections that Dhatri has already built against these routes.

Technical summary (all exactly as docs/contracts.md section 9):

- `POST /api/kb/faqs { q, a }` → 201 `{ id, q, a }`; `PATCH /api/kb/faqs/:id { q?, a? }` → `{ id, q, a }`;
  `DELETE /api/kb/faqs/:id` → 204. Owner or admin.
- `GET /api/kb/gaps` → `[{ id, question, askedCount, lastAskedBy }]` (open only, most asked first, at most 100).
  `POST /api/kb/gaps/:id/answer { a }` → `{ faq: { id, q, a } }`; `POST /api/kb/gaps/:id/dismiss` → 204 (no body).
  Owner, admin or staff.
- **One embed-and-store, shared with the ingest job** (`kb/embed-store.ts`): FAQs and gap answers are embedded inline,
  in the request, so the reply step finds them at once. The ingest job now calls the same functions for its batches and
  its final store step; its behaviour and tests are unchanged.
- **Embedding failure** → the FAQ row is kept as `failed` (never searched) and the route answers `upstream_failed`;
  sending the same question again, or a PATCH, retries (a POST of a question whose earlier save failed reuses that row
  instead of answering `conflict`). **Duplicate question** (the database's `23505`) → `conflict`.
- **`normaliseQuestion`** (`kb/question.ts`) is the key a gap is counted under, for the next PR (the reply step) to
  record gaps with. Tamil and Hindi vowel signs are kept; punctuation, symbols, emoji and zero-width characters go.

## 2. Files changed and what each does

| File | What it does |
|---|---|
| `backend/src/kb/faqs.ts` | The six services: create, update, delete a FAQ; list, answer, dismiss a gap. Roles, Zod validation, cleaning |
| `backend/src/kb/embed-store.ts` | `embedBatch`, `storeChunks`, `embedAndStore`: the shared embed-and-store |
| `backend/src/kb/question.ts` | `normaliseQuestion`, the gap key |
| `backend/src/kb/store.ts` | New store methods: `insertFaq`, `getFaq`, `updateFaq`, `deleteFaq`, `listOpenGaps`, `dismissGap`, `answerGap` (the RPC) |
| `backend/src/kb/ingest.ts` | Uses `embedBatch` / `storeChunks` (same behaviour) |
| `backend/src/server/routes.ts` | **Five route entries and their handlers only** (Shaaz's file; nothing else changed) |
| `backend/src/server/app.test.ts` | The two "missing route" tests used `/api/kb/gaps` as their example of a route that does not exist; they now use `/api/not-built-yet` (Shaaz's file, test only) |
| tests | `faqs`, `embed-store`, `question`, `store` (new methods), `server/kb-faq-routes`, and the in-memory store the tests share |
| `docs/contracts.md` | Section 9: the built FAQ and gap behaviour |

## 3. How to run / test locally

```
pnpm --filter @pakka/backend exec vitest run src/kb src/server   # this PR's tests
pnpm typecheck && pnpm lint && pnpm test && pnpm db:test          # everything
```

I also ran the real store against the local database (not mocked): the gaps list with the contact name and masked
number, a duplicate FAQ (`conflict`), the same question in another business (allowed), answering a gap (FAQ becomes
`ready`, gap closed), answering twice (`conflict`), another business's gap (`not_found`), an answer that is too long
(`validation_failed`), and dismiss.

## 4. Decisions made

- **A FAQ is embedded as its question followed by its answer**, one text, so a customer who asks the question matches
  it even when the answer does not repeat the words.
- **A failed embed keeps the FAQ** (as `failed`) instead of deleting it, so the owner's typing is never lost and a second
  save retries. After an edit whose embed fails, the old chunks stay but the FAQ is not `ready`, so it is not searched
  (an old answer is never served for text the owner has already changed) until a save works.
- **Two saves at once:** after embedding, a save checks the FAQ still has the text it embedded and stores nothing if it
  changed, and a late failure only marks a FAQ `failed` if it is still `processing`. A very small window remains
  between that check and the store; the next save of the FAQ repairs it.
- **`kb-sweep` no longer fails FAQs** (it failed anything `processing` for 30 minutes by `created_at`, with an upload's
  wording). A FAQ lost between its edit and its embed (a crash) stays `processing`, not searched, until it is saved again.
- **Dismiss works on a dismissed gap (harmless repeat) but not on an answered one** (`not_found`).
- **`POST .../dismiss` does not read a body** (the browser sends none); it authenticates itself like the upload route.
- **`lastAskedBy`** is the contact's name, else the masked number from `maskPhone` (`+9198xxxxxx21`), else `null`.
  Dhatri's tests use a different mask style in a sample; she shows whatever string comes.
- **List limit 100.** The screen is a to-do list, not an export.

## 5. For Dev 2 (Shaaz)

- **No env var, migration or Inngest change.** It uses your `answer_kb_gap` and the existing `kb_documents` / `kb_gaps`.
- `routes.ts`: five entries added after the document routes, using your router's `:id` segments and `tenantRoute`. The
  dismiss route uses `requireTenant` directly because `tenantRoute` reads a JSON body on POST.
- `app.test.ts`: two assertions changed from `/api/kb/gaps` to `/api/not-built-yet` as the example missing route.
- The embeddings account's rate limit still matters: a FAQ save is one embeddings call.

## 6. For Dev 3 (Dhatri)

- All shapes are the ones your `kb-api.ts` already parses. Errors are the usual envelope: `conflict` (409) for a duplicate
  question or an answered gap, `upstream_failed` (502) when embedding failed (the FAQ is kept; saving again retries),
  `validation_failed` (422) with `fields.q` / `fields.a`, `not_found` (404), `forbidden` (403 for staff on FAQ routes).
- A FAQ row's `status` (`processing`, `ready`, `failed`) is on `kb_documents`; after a save that returned an error it is
  `failed`. After an edit it is `processing` for a moment, then `ready`.
- **Retrying a failed save:** the same POST again works (it is not a `conflict` while the earlier one is `failed`), or PATCH
  the FAQ. After a **failed gap answer** the gap is already answered (it has left the open list) and the FAQ exists as
  `failed`: the owner retries by editing that FAQ in the FAQ list. Please check the screen shows a `failed` FAQ with a way to save again.
- `answerGap` returns the new FAQ as `{ faq: { id, q, a } }` with no status; it is `ready` when the call succeeds.

## 7. Follow-ups

- The reply step (next PR) records gaps (`record_kb_gap` with `normaliseQuestion`) and opens the `kb_gap` handoff after
  two misses in a row in one conversation.
- No optimistic locking on FAQ edits (the last text saved wins; see "Two saves at once").
- The gap's question is stored as the pipeline gives it, and `answer_kb_gap` copies it into the FAQ title, so the pipeline (next
  PR) must clean it the same way (`oneLine`: control characters out, one line) before `record_kb_gap`.
- A staff member sending a body that is not JSON to a FAQ route gets 422, not 403 (the body is read before the role check).
- Raja is still to confirm the FAQ and document write roles (section 9 header): owner and admin for now.
