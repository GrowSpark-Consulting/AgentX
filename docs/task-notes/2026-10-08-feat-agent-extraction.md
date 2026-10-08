# Task notes: understanding the customer's message (extraction, lead details, knowledge-base search)

Branch `feat/agent-extraction`. For Dev 2 (Shaaz) and Dev 3 (Dhatri).

## 1. What I built and why

The assistant can now read what a customer wrote. For every message the AI will answer, it asks the fast model what
the customer is saying (are they asking something, giving details, asking for a person, complaining), checks the
model's answer in plain code, keeps the details the customer gave (budget, area, timeline and so on) on their lead,
and looks up the customer's question in the business's knowledge base. If the model's answer is unusable it asks
once more, then falls back to asking the customer a clarifying question. Nothing is sent to the customer yet: the
deciding and writing steps come in the next PRs, so a deployed run now reads, understands and records, but is silent.

Technical details:

- **`understandTurn`** (`agent/pipeline/understand.ts`) continues from the turn that `process-message` prepared. Steps:
  `extract` (loads the business's pack; none or invalid is `no_pack`), `save-fields`, `retrieve`.
- **Extraction (Haiku 4.5, `extraction_v1`)**: the model gets the pack's fields, the customer's messages of the
  burst, the last four messages before them (customer, AI and staff) and what the lead already has. Its answer is
  parsed (a code fence is tolerated), validated with the `Extraction` Zod schema, and its `fields` are limited to the
  pack's own keys with each value checked against the pack's own type for that field; the rest are dropped and only
  counted. The question is tidied, cut to 300 characters (the knowledge-base gap limit) and is in English for the
  search; the reply stays in the customer's language.
- **One retry, then the clarifying-question fallback**: an answer that is not valid is asked for once more with the
  reason; a second bad answer, or the model refusing, ends as `fallback`. An answer cut off or empty is asked for again
  as it was. A model that cannot be reached (the client has already tried 3 times) is reported as `model_unavailable`
  by the step itself, so Inngest does not repeat the same calls; the turn's deadline passing (`aborted`) is retried;
  a key or request the provider rejects is not retried (it is a bug to look at). The text sent to the model is capped
  at 4000 characters (the end of a long burst is kept).
- **Lead**: the extracted details are merged into `leads.fields` in one database statement (`merge_lead_fields`), so a
  member's edit in the dashboard made in between is not lost. They are re-checked against the pack as it is now, only
  changed values are sent, a low-confidence reading (< 0.5) fills a gap but does not replace an answer, text values are
  tidied and cut to 200 characters, and fields the pack no longer has are left alone, never written. A `new` lead
  becomes `engaged`; an `opt_out` message does neither.
- **Knowledge base**: `retrieveKb` for the English question, only for the intents `question`, `give_details` and
  `book`. Outcomes: `found` (with the chunks), `none` (nothing above the threshold: a gap, recorded in PR 8),
  `unavailable` (the search failed: an outage, not a gap), `skipped`.
- **The extraction lives in the database, not in Inngest**: it is kept on the newest message of the turn at
  `messages.meta.agent`. Step results carry only small facts (intent, language, confidence, the keys of the details
  found), because Inngest stores every step's result and a customer's words and details should not live there.

## 2. Files changed and what each does

| File | What it does |
|---|---|
| `backend/src/agent/pipeline/understand.ts` | Step 4: extraction with one retry, saving the lead's details, the knowledge-base search |
| `supabase/migrations/0018_agent_merge_functions.sql` (+ `supabase/tests/agent_merge.test.sql`) | `merge_lead_fields` and `merge_message_agent_meta`: atomic merges, service role only, filtered by business |
| `backend/src/agent/pipeline/extraction.ts` | Turns the model's text into a checked `Extraction` (JSON, Zod, only pack fields, per-field types, tidy question) |
| `backend/src/agent/pipeline/store.ts` | New reads and writes: pack overrides, the lead's state, the two merges (through the new functions), the batch's texts, recent history, `meta.agent` |
| `backend/src/agent/pipeline/runtime.ts` | The real dependencies, and a per-process cache of pack definitions (a published version never changes) |
| `backend/src/inngest/process-message.ts` | **Same function as PR 4**: now continues into step 4 after the gate |
| `docs/contracts.md` | Step 4 and `messages.meta.agent` (section 5) |
| tests | `understand`, `extraction`, `runtime`, the store's new methods, and the in-memory store the tests share |

## 3. How to run / test it locally

```
pnpm --filter @pakka/backend exec vitest run src/agent/pipeline src/inngest   # this PR's tests
pnpm typecheck && pnpm lint && pnpm test && pnpm db:test                      # everything
```

To see it run for real (local Supabase, the Inngest dev server, a real `ANTHROPIC_API_KEY` and `EMBEDDINGS_API_KEY`
in `backend/.env.local`, with the three Supabase values overridden in the shell as before): store a message as the
webhook does, send `whatsapp/message.received` with its ids to the dev server. The API log shows
`[pipeline] understood (<intent>; search <outcome>)`; `select stage, fields from leads` and
`select meta from messages` show what was kept. Each run costs about a fifth of a cent in model calls.

## 4. Decisions made

Need review by Dev 2 (Shaaz):

- **Where the extraction is kept: `messages.meta.agent`** on the newest message of the turn. The alternatives were
  Inngest's step results (the customer's words and details would sit in Inngest's storage) or a new table (a
  migration). `meta` already exists on messages for exactly this kind of per-message detail (it holds a tapped
  button's id). It is written by the server only; the inbox reads `messages` through Realtime, so an update to a
  message's meta sends a change event, which Dhatri's inbox ignores unless it reads `meta`.
- **Two small database functions (migration 0018), please check the number and the shape.** A first version read
  `leads.fields` / `messages.meta` and wrote the whole column back, which loses a member's dashboard edit, a tapped
  button's id or another run's keys written in between. `merge_lead_fields` and `merge_message_agent_meta` do the merge
  in one statement, filtered by business, service role only, with a 16 KB size guard. 0018 was the next number on
  `main` when I wrote it; renumber if another migration landed first.
- **A model that is down is `model_unavailable`, not a clarifying question.** The handover's "retry once, then
  clarifying question" is about unusable answers. An outage is a different customer experience: PR 6 turns it into
  the safe "let me confirm that with the team" and a handover, with the turn's overall deadline. The step returns it
  itself instead of throwing: the client already retried, and a step retry would pay for the same calls again.
- **A knowledge-base search that is down degrades to `unavailable`** instead of failing the turn: an outage of the
  embeddings account must not stop a customer's message from being read. The reply step treats it as "check with the
  team", and it is not recorded as a gap.
- **`custom_scoring` is not asked here.** Reading a message needs the business's labels, hidden and added fields; the
  Pro-plan scoring overrides matter only to the scoring step (Day 3), which will pass the flag.
- **The pack's definition is cached per process**, the business's overrides are read on every turn.
- **The lead's language is not updated.** `contacts.language` feeds `notify.send`'s template choice (`en`, `ta`);
  the extraction's codes (`ta-en`) do not match template languages, so mapping them is its own small decision for the
  notification side (follow-up).
- **What the lead keeps:** only the pack's own fields. The model can name any key; a value the pack's type refuses
  (an option that is not offered, text for a number) is dropped, never stored.
- **Intents that search the knowledge base:** `question`, `give_details`, `book`. A greeting, a cancellation, a
  complaint, a request for a person or a discount is not a question for it.

Need review by Dev 3 (Dhatri): the new `messages.meta.agent` (below).

## 5. For Dev 2 (Shaaz)

- **One migration, `0018_agent_merge_functions.sql`** (two functions, service role only): run it before this deploys
  (`supabase db push` as for the others). No env var and no new Inngest function: it is the same `process-message`
  function as PR 4, so no resync is needed unless the sync is stale.
- **From this deploy on, a customer message costs model calls** even though nothing is sent yet: one fast-model call
  (about $0.002) and one embeddings call for a question. Make sure `ANTHROPIC_API_KEY` and `EMBEDDINGS_API_KEY` are set
  on every Railway environment, and the embeddings account's rate limit is raised (the account answered 429s to
  documents of a few pages; a question is one short call, so it works, but a busy tenant would hit the limit).
- Watch `[pipeline] understood (...)`, `fallback (...)`, `model_unavailable` and `no_pack` in the log: they carry no
  message text.

## 6. For Dev 3 (Dhatri)

- **A lead's `fields` now fill in**, with the pack's own keys and the pack's types (for example
  `{ "budget": "80L", "config": "2BHK", "location": "Velachery", "timeline": "0-3m" }`), and the lead moves from `new`
  to `engaged` when the customer writes and is understood. Values are whatever the customer said (`budget` can be
  `"80L"` or a number), so show them as text.
- **`messages.meta.agent`** on inbound messages holds `{ extraction: { intent, language, fields, question,
  preferredTime, sentiment, asksIfHuman, confidence }, droppedFields, at }` or `{ extractionFailed, at }`. It is for
  the agent's later steps and for debugging: please do not show it to customers or rely on its shape in the UI yet.
- Nothing is sent to customers by this PR.

## 7. Follow-ups / not done in this PR

- **Open risk, PR 6 must close it:** `model_unavailable`, `fallback` and `no_pack` end the run as a normal result. Nothing
  answers the customer in those cases yet (the run does not retry for minutes either, because the client already waited).
  PR 6 turns them into a holding reply or a handover. Until PR 6 ships, a deployed run reads and records but is silent anyway.
- Notes: `meta.agent` keys are merged, so a success clears `extractionFailed` and a failure clears `extraction`
  (read null as absent). A media-only message is `no_text`: not engaged. History is the last four with text before the
  burst's first message. `confidence` is the model's own word, so it is not a trust boundary against injection.

- **PR 6 wires the turn's deadline** (`signal`) into `understandDeps`; until then the model call has the client's own
  timeout only.
- **PR 8's gap recording must be idempotent** (a retried or replayed run sees `none` again).
- **Opt-out by keywords is PR 7.** Here the model's `opt_out` intent only stops the lead from being engaged or filled.

- The decide and reply steps (Day 3 and PR 6), which read the extraction from `messages.meta.agent`, and the knowledge
  base gap recording (PR 8) for the `none` outcome.
- **Prompt tuning with Raja's real Tamil and Tanglish chats.** In my live test the model put no question for
  "site visit pannalama?" (intent `book`), so nothing was searched for the visit timings; whether a booking request
  should carry a question is a prompt decision to make with real chats.
- Mapping the extraction's language codes to `contacts.language` for template sends.
