# Task notes: the message pipeline skeleton (`process-message`, steps 2 and 3)

Branch `feat/agent-process-message`. For Dev 2 (Shaaz) and Dev 3 (Dhatri).

## 1. What I built and why

When a customer writes, the assistant now starts handling the message: it finds out who wrote, finds or creates their
lead (so the business sees an enquiry in its leads board whoever ends up replying), and decides whether the AI should
answer at all. If a person has taken over the chat, the customer opted out, the AI auto-reply is switched off, or the
message is a photo or voice note, the AI stays out and the message simply waits in the inbox for staff. This PR does
not send anything yet: the steps that read the message, write the reply and send it come in the next PRs, so a
deployed run today only reads and records the lead.

Technical details:

- **`process-message`** (Inngest, trigger `whatsapp/message.received`): one conversation at a time (concurrency key
  `conversationId`, limit 1); messages from one conversation within 3 seconds, never longer than 15, start one run
  (debounce on the conversation, which keeps only the last event). The run answers a **batch**: the customer's
  unanswered messages from the 15 seconds before that event (the newest 10), together. The event is only where to look.
- **Steps, each a `step.run`:** `resolve` (message, conversation, contact, business), `batch` (which messages to
  answer; an empty batch means they were all answered), `lead` (find or create the open lead), `gate`. A failure
  retries that step only (3 retries), and a resumed run does not repeat finished steps.
- **The gate**, in plain code, for the conversation: opted out, then a chat a person has (`conversations.mode` is not
  `ai`), then `isEnabled(tenant, 'ai_auto_reply')` off; then for each message: one that is not text or a tapped
  list/button reply (a photo, a voice note) is left for staff and the rest are answered. A turned-away message changes
  nothing and is not lost.
- **One open lead per contact:** any lead not won or lost counts as open; the oldest is reused; otherwise one is made
  (`stage new`). A business has one pack, so one need.
- **Idempotent:** a message that was answered is skipped however many times its event arrives (see decisions: the
  marker is an audit row, which the reply step will write for every message it answers).

## 2. Files changed and what each does

| File | What it does |
|---|---|
| `backend/src/agent/pipeline/process-message.ts` | The pipeline core (`runTurn`), against a minimal `step.run`; returns the `TurnContext` the next steps start from |
| `backend/src/agent/pipeline/gate.ts` | Step 3 as a pure function |
| `backend/src/agent/pipeline/store.ts` | Every database call of the pipeline (service role): tenant on every query, fixed-word errors, a deadline and abort on every call |
| `backend/src/agent/pipeline/events.ts` | The event name and its Zod shape (ids only), and the audit action that marks a message answered |
| `backend/src/inngest/process-message.ts` | Wires the core to Inngest: trigger, concurrency, debounce, retries |
| `backend/src/inngest/functions.ts` | **Shaaz's file:** two lines, registers `processMessage` |
| `docs/contracts.md` | The pipeline and the answered marker (section 5) |
| tests | `gate`, `store`, `process-message` (core) under `agent/pipeline/`, `inngest/process-message.test.ts`, `test-support/fake-pipeline-store.ts` |

## 3. How to run / test it locally

```
pnpm --filter @pakka/backend exec vitest run src/agent/pipeline src/inngest   # this PR's tests
pnpm typecheck && pnpm lint && pnpm test && pnpm db:test                      # everything
```

To see it run for real: start the local stack (`pnpm db:start`), override the three Supabase values in the shell with
the local ones from `pnpm db:status` (never `backend/.env.local`'s, which point at staging), set `INNGEST_DEV=1`, run
the API and `pnpm inngest:dev`. Store a message as the webhook does (`select * from store_inbound_message(...)`), then
send `whatsapp/message.received` with its ids to the dev server. The API log shows one line per run, for example
`[pipeline] ready` or `[pipeline] gated_off (not_ai_mode)`, and `select * from leads` shows the lead.

## 4. Decisions made

Need review by Dev 2 (Shaaz):

- **The "already answered" marker is an audit row, not "an outbound message after it".** I planned the latter and
  found a flaw while writing the tests: an inbound message's `created_at` is Meta's send time (migration 0013). A
  customer who sends a second message while the first is being answered (4 seconds later, say) gets a stored time
  earlier than our reply to the first, so "a reply exists after it" would be true and the second message would be
  dropped silently. Instead the reply step (PR 6) writes an `audit_logs` row after sending
  (`action message.answered`, `entity message`, `entity_id` the message id, `actor ai`) through `writeAudit`, and this
  PR reads it. No migration: the audit table's `(tenant_id, created_at)` index serves the lookup, which also filters
  on the message's own time.
- **The gate works on the batch, not on the event's message.** My first version gated on the message the debounce
  kept, and the review caught what that does: a customer who sends a text and then a photo within 3 seconds gets a run
  anchored on the photo, the gate turns it away, and the text is never answered. Now the conversation-level checks
  run first and then each message is checked on its own: the text is answered, the photo waits for staff. Likewise a
  repeated or late event for an already-answered message no longer hides newer unanswered ones (an empty batch is the
  only reason to skip). The order of reasons changed to: opted out, a person's chat, the feature off, then nothing
  readable.
- **The answered rows are looked up from a day before the message's time.** The audit row's time is our clock and a
  message's is Meta's; a day of slack stops a Meta clock that runs ahead from hiding the row, and keeps the query on the
  existing `(tenant_id, created_at)` index. The reply step must write one row per message of the batch, in the same step
  as the send, and re-check the chat's mode and the opt-out flag right before sending (contracts.md, section 5).
- **Database errors:** a refusal that waiting cannot fix (permission, a bad statement, a row of the wrong shape) is
  non-retriable, so a bug is not repeated three times; an unreachable or busy database is retried.
- **A run that fails after its retries is lost** (nothing re-drives it). `onFailure` logs the message id; a sweep for
  customer messages nobody answered (like `kb-sweep` for documents) is a follow-up.
- **The lead is made before the gate**, even when the AI will not answer (a person has the chat, the feature is off),
  because a customer who wrote is a lead the business wants to see. It is also made for an opted-out customer's
  message (the lead record is not a message to them).
- **Messages the agent cannot read** (photos, voice notes, documents, locations) are gated off for now and wait in the
  inbox; a polite "please type" reply is a later PR.
- **Step results carry no personal data.** Inngest stores every step's result, so a result is ids, flags and small
  facts (the language code, the pack key and version): never a message's text, a phone number, a name or the
  business's name. A test checks the remembered values.
- **No migration for "one open lead per contact".** It is kept by the code (find, then create) and the one-at-a-time
  concurrency per conversation. That is not airtight: a contact whose old conversation was closed and a new one opened
  could have runs in both at once, and the database has no rule against two open leads. The airtight fix is
  `create unique index leads_one_open_per_contact on leads (tenant_id, contact_id) where stage not in ('won','lost')`
  plus catching the unique violation and re-reading; I did not add it because it fails on any existing duplicates and
  is a shared migration. Worth checking staging for duplicates first. `leadCreated` is a hint, not a count (a retried run
  that finds its first attempt's lead reports false).
- **Not loading the pack here.** The pack is needed from step 4 (PR 5), which reads it by the `vertical` and
  `verticalVersion` this step returns.

Need review by Dev 3 (Dhatri): nothing to review.

## 5. For Dev 2 (Shaaz)

- **Inngest resync after deploy:** one new function, `process-message`; check it appears with trigger
  `whatsapp/message.received`, concurrency 1 per conversation and a 3 second debounce.
- **For your reply and notify work (PR 6 builds the caller):** after the AI's reply is sent, write the answered marker
  (`message.answered`, above). If `notify.send` should do it itself for the `ai_reply` kind, say so and I will not.
- **No env var, no migration.** Nothing is sent to customers by this PR; a deployed run creates leads and logs one
  line (`[pipeline] <status> (<reason>)`).
- **Webhook replays:** the webhook already sends the event for a replay with a fixed id; the pipeline treats a
  repeated message as harmless.

## 6. For Dev 3 (Dhatri)

- A lead now appears (stage `new`, `fields {}`) for every contact that messages a business, including when the AI is
  off or a person has the chat. The leads board will show leads with no answers collected yet; do not assume
  `leads.fields` has anything in it. Later PRs fill `fields`, `score` and `temperature` and move the stage to
  `engaged`.
- Nothing else changes for the inbox: gated-off messages are exactly what staff see today.

## 7. Follow-ups / not done in this PR

- Steps 4 to 8 (extraction, retrieval, reply, post-check, send): PRs 5 and 6, which need the language-model client from
  PR 3 (`feat/agent-llm-foundation`, not merged when this was written).
- Writing the `message.answered` audit row (PR 6) and the consent steps (PR 7: the STOP keyword is checked before the
  gate decides, and the opt-out flag is read here already).
- A unique index for one open lead per contact (above), and a sweep for customer messages nobody answered.
- The reply step (PR 6) must write the answered rows, re-check mode and opt-out before sending, and only ever send for
  the readable messages of `turn.messageIds`.
- A consent check on opted-out contacts that offers a way to resubscribe is PR 7's; today the gate simply never lets
  them through.
- A "please type" reply for voice notes and photos.
