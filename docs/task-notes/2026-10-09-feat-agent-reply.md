# feat/agent-reply: the assistant answers (reply, post-check, send, handover)

Audience: Dev 2 (Shaaz) and Dev 3 (Dhatri).

> **#65 is merged (9 Oct); this branch was rebased onto `main` and its PR base is `main`.** For the record, the base tip when it was made:
> `641ba9386877c3389e72632ce840074ece57c2db`. After #65 is squash-merged, move this PR onto `main`:
>
> ```
> git fetch origin
> git rebase --onto origin/main 641ba9386877c3389e72632ce840074ece57c2db feat/agent-reply
> git push --force-with-lease origin feat/agent-reply
> ```
>
> then change the PR's base to `main` (nothing else needs doing). `backend/src/kb/question.ts` (and its test) are a
> byte-for-byte copy of the same files in `feat/agent-kb-faq-gaps`; if that PR is merged first, the rebase finds them
> already there and drops them.

## 1. What I built and why

The assistant now answers. When a customer writes, it reads the message (the previous PR), looks in the business's
knowledge base, and sends one reply: a short answer in the customer's own language (English, Tamil, Tanglish or Hindi)
using only what the business's knowledge base says. Before anything is sent, code checks the reply: every price, date and
time in it must be in the knowledge-base text it was given, or the reply is written again once, and if it is still
wrong the customer gets the safe line "Let me confirm that with the team". Nobody is left without an answer: when the
assistant did not understand, it asks a short question; when the knowledge base has nothing it says it will check with the
team, and records the question so the owner can answer it; when it fails to answer two questions in a row in the same
chat, or the business is out of credits, the chat is handed to a person. Every reply is sent through `notify.send` and
costs one credit.

Technical summary (details in `docs/contracts.md`, section 5, "Step 7"):

- **`plan.ts` is the table of outcomes**, one row per way step 4 can end (below). Plain code, no model.
- **Reply** (`reply.ts`, steps `plan`, `reply`, `handoff`): Sonnet 5.5 with `reply_v1` (persona and business name from
  `tenants`, tone, customer language, last 10 messages, the facts); the post-check (`postcheck.ts`); one regeneration; then
  the safe fallback. Everything that is not "answer from the facts" is a fixed line (`fixed-texts.ts`), with no model call.
- **Send**: `notify.send(tenantId, "ai_reply", { conversationId, text })` after a fresh look at the chat's mode and the
  contact's opt-out; **the `message.answered` rows for every message of the turn are written in the same step**.
- **Credits**: `insufficient_credits` sends no AI reply, switches the chat to human, opens a `credits_exhausted` handoff,
  sends `handoff.opened`, and asks the two ports for the free holding message and the owner alert.
- **One clock** (`turn-deadline.ts`): target 10 s, hard stop 25 s across understanding, search, reply and send. The first
  step records the start; each invocation works out what is left. At the hard stop the model calls stop and the customer
  gets the safe line. This also wires the deadline into the extraction (the open item from #65): when time is up it
  reports `model_unavailable` instead of retrying.
- **A run that gave up** (`onFailure`) sends one safe line if the customer is still unanswered (`give-up.ts`).

**The table (what the customer gets):**

| Step 4 ended with | The customer gets | Also |
|---|---|---|
| time ran out (25 s) | safe fallback | |
| understood, answer found in the knowledge base | the model's answer from the facts (post-checked) | miss count back to 0 |
| understood, nothing found (a gap) | safe fallback | gap recorded; miss count +1 |
| ... second miss in a row in this chat | handover line | handoff `kb_gap` (if the business has it on) |
| understood, the search could not run | safe fallback | no gap, no handoff |
| understood, nothing to look up (greeting, details) | the model's reply without facts | miss count back to 0 |
| understood, off topic | the model's polite decline | |
| understood, about leaving (`opt_out`) | the STOP hint | |
| not understood (no text, bad answer twice, declined) | a clarifying question | |
| the language model could not be reached | safe fallback | |
| no usable pack | safe fallback | handoff `stuck` so a person looks |
| out of credits (any of the above) | nothing from the AI | human mode, `credits_exhausted` handoff (high), event, holding message and alert through the ports |
| chat is no longer the assistant's, or opted out | nothing | |

## 2. Files changed and what each does

| File | What it does |
|---|---|
| `backend/src/agent/pipeline/plan.ts` | The table above, as a pure function |
| `backend/src/agent/pipeline/reply.ts` | The `plan`, `reply` and `handoff` steps; `answerAfterFailure` |
| `backend/src/agent/pipeline/postcheck.ts` | ₹ amounts (by value), dates, times, length, question count |
| `backend/src/agent/pipeline/fixed-texts.ts` | The fixed lines in four languages |
| `backend/src/agent/pipeline/persona.ts` | Reads `persona`, `tone` and the knowledge-gap toggle from `agent_settings`, never trusted |
| `backend/src/agent/pipeline/turn-deadline.ts` | The turn's clock |
| `backend/src/agent/pipeline/ports.ts` | The system-notice port (now real, through notify.send's `system_notice`) and the staff-alert port (still waiting for Dev 2's kind) |
| `backend/src/agent/pipeline/give-up.ts` | The safe line after a run gave up |
| `backend/src/agent/pipeline/store.ts` | New: `getTenantReplyInfo`, `getPreviousMisses`, `recordKbGap`, `openHandoff`, `setConversationMode` |
| `backend/src/agent/pipeline/understand.ts` | Time being up is reported (`model_unavailable`), not retried |
| `backend/src/agent/pipeline/runtime.ts` | `replyDeps`: `notify.send`, `writeAudit`, Inngest's send, the ports |
| `backend/src/inngest/process-message.ts` | The `started` step, the clock, step 7, `onFailure` answers |
| `backend/src/kb/question.ts` | Copy of PR B's normaliser (see the box at the top) |
| tests, `docs/contracts.md` | Tests for all of the above; section 5 |

## 3. How to run / test locally

```
pnpm --filter @pakka/backend exec vitest run src/agent src/inngest   # this PR's tests
pnpm typecheck && pnpm lint && pnpm test && pnpm db:test              # everything
```

I also ran the reply step against the local database with the real Sonnet and a fake sender: an English and a Tanglish
price question (both answered from the facts in about 3 to 4 s), a miss (safe line), a second miss in the same chat
(handover line, `kb_gap` handoff, chat to `human`, `handoff.opened`), the gap rows, the audit rows.

## 4. Decisions made

Need review by Dev 2 (Shaaz):

- **The answered rows are written in the same step as the send, with three tries and no throw.** A failure to write them
  is logged and never thrown: throwing would retry the step and send the reply again. The cost is that a message with no
  row could be answered twice by a later event; the log line has the message id.
- **A send whose outcome is unknown is treated as answered** (`outcomeUnknown`): never resent. A retryable failure throws
  (the step retries); any other failure is `not_sent` and logged.
- **`notify.send` does not check the chat's mode** (contracts section 4 lists `conversation_not_ai`; the code has no such
  reason), so the reply step re-reads the mode and the opt-out right before sending. There is a window of a few
  milliseconds between that read and the send.
- **Fixed lines (clarifying question, safe fallback, handover line, STOP hint) go out as `ai_reply` and cost one credit.**
  Only the out-of-credits holding message and the STOP confirmation are meant to be free, and they wait for your kinds.
- **The `kb_gap` handoff is two misses in a row in the same chat** (Raja/handover wording), counted per chat on
  `messages.meta.agent.kbMisses`, not the business-wide `asked_count`.
- **A late `onFailure` safe line costs a credit** like any reply.

Need review by Dev 3 (Dhatri): `persona` and `tone` are read as keys of `tenants.agent_settings`, exactly as in
`docs/dashboard-screen-contracts.md` ("Agent settings"): `persona` (a short name), `tone` (`friendly` or `formal`),
`handoffTriggers[]` with `{ key, enabled }` (the knowledge-gap one is `kb_gap` or `gap`). The `PATCH /api/agent/settings`
route is marked "PROPOSED, Dev 1" there and is **not built yet**; until it is, the screen can write the column directly
(RLS allows members to update `agent_settings`).

Fixed-text wording (Tamil, Tanglish, Hindi) is mine, in `fixed-texts.ts`; Raja can change any line by editing that file.

## 5. For Dev 2 (Shaaz)

- **No env var and no migration.** Same `process-message` function: resync Inngest only if it is stale. The function now has
  more steps (`started`, `plan`, `reply`, `handoff`).
- **Every reply now costs one credit through `notify.send`** (the `ai_reply` kind). From this deploy on, a customer's message
  on a connected number is answered for real. Make sure `ANTHROPIC_API_KEY` is set (Sonnet 5.5, about a cent per reply).
- **Update 9 Oct: item 1 of the list further down is DONE** (your #70, `system_notice`): the holding message now goes through it (`createSystemNoticePort` in `ports.ts`, tested in `ports.test.ts`). Items 2 and 3 are still open (your #71): when it lands, only the staff-alert port in `ports.ts` changes, and the `handoff.opened` event the reply step already sends (id `handoff_opened:<handoffId>`) is what your job reads.
- **What I need you to add to `notify`** (I did not touch your files; only `backend/src/agent/pipeline/ports.ts` changes when
  you do):
  1. **A free system kind** (suggested name `system_notice`): 0 credits, `sender: "system"`, `audience: "conversation"`, no
     feature gate, and **not blocked by the contact's opt-out** (the STOP confirmation is sent after they opted out; the
     out-of-credits holding message must also go out when credits are zero). Free text inside the 24 hours; outside it,
     `skipped / outside_window`. Used for two texts: `credits_holding` and `opt_out_confirmation` (my fixed text comes in the call).
  2. **A `staff_alert` kind** to the owner (and staff who want it): kinds I will ask for are `credits_exhausted`,
     `handoff_opened` and `setup_problem`. Raja is to send the wording.
  3. A consumer for **`handoff.opened`** `{ tenantId, handoffId, conversationId }` (sent for `kb_gap`, `credits_exhausted`
     and `stuck`): it should call the staff alert.
  Until items 2 and 3 land the staff-alert port logs `awaiting_notify_kind` and the rest of the handover (the row, the switch to human, the event,
  the audit) still happens.
- The reply step calls `writeAudit` (`message.answered`, `handoff.opened`) and `record_kb_gap` through the service role.

- **The holding message is sent only by the run that opened the handoff** (`opened.created`), so a retry never sends it twice. If a run crashes between the row and the send, no holding line goes out; staff still see the handoff.

## 6. For Dev 3 (Dhatri)

- **A customer now gets answers.** AI messages appear in the inbox as `messages` rows (`sender: "ai"`) through `notify.send`.
- **New rows in `handoffs`** (`trigger`: `kb_gap`, `credits_exhausted`, `stuck`; `priority`: `high` for credits, else `normal`;
  `resolved_at` null while open) and `conversations.mode` goes to `human` at the same moment. The inbox rule "needs human =
  an open handoff" now fires.
- **`kb_gaps`** fill from real questions (the Knowledge screen's list). Their text is the English question the extraction produced.
- `messages.meta.agent` gains `kbMisses`, `gapRecorded`, `planCase` and `reply`: internal, do not show.
- `audit_logs` gets `message.answered` rows (actor `ai`) and `handoff.opened`: not for the UI.

## 7. Follow-ups

- **Send and record are not atomic.** If the process dies after `notify.send` and before anything is written, a retry could
  send a second reply. The `reply` marker (written right after the send) and the second look right before the send make
  this very unlikely; the real fix is an idempotency key in `notify.send` (Shaaz). A claim row before the send was
  considered and rejected: a crash after the claim would leave the customer in silence.
- **A business with no credits still pays for the model call** (the credit check is inside `notify.send`, after the reply is
  written), and until the system kind exists its customers get no holding message. Documented, small.
- **`handoffs` has no unique index** for one open handoff per chat; `openHandoff` is select-then-insert, safe while one run
  handles a conversation at a time. A partial unique index on `(conversation_id) where resolved_at is null` would make it
  database-enforced (a migration; proposed, not included).
- **If `record_kb_gap` succeeds and the marker write fails, a retry counts the gap twice** (the count only feeds the
  dashboard's most-asked list).
- The post-check does not read amounts written in words ("seventy eight lakh"), percentages ("90% off"), phone numbers or
  links; the prompt forbids inventing offers and the price beside a discount is what is caught.
- Month names in Tamil or Hindi, and a time with no am/pm ("at 5"), are not checked.
- **Consent notice and STOP** (next PR, stacked on this one). Until it merges, a customer's STOP is read by the model as the
  intent `opt_out` and answered with the STOP hint; it does not opt them out.
- **The decide step** (Day 3) will return a `NextAction` that replaces the fixed action; `plan.ts` is where it plugs in.
- The post-check is strict: a reply that repeats a figure the customer gave ("your ₹80L budget") but is not in the facts
  falls back. Months written in Tamil or Hindi are not read as dates. Weekdays and "tomorrow" are not checked.
- The gap's question is stored as extracted (one line, cleaned), as `answer_kb_gap` copies it into the FAQ title.
- A sweep for customer messages nobody answered is still not built (for a failure that could not even send the safe line).
