# feat/agent-intent-handoff: a person for angry customers, and opt-outs the model reads

Audience: Dev 2 (Shaaz) and Dev 3 (Dhatri).

> **STACKED on `feat/agent-consent` (PR D). Do not merge before it.** Base tip when this branch was made: the consent PR's
> last commit on 9 Oct (record the SHA with `git merge-base feat/agent-consent feat/agent-intent-handoff`). After PR D is
> squash-merged, move this PR onto `main`:
>
> ```
> git fetch origin
> git rebase --onto origin/main <that SHA> feat/agent-intent-handoff
> git push --force-with-lease origin feat/agent-intent-handoff
> ```
>
> then change the PR's base to `main`.

## 1. What I built and why

Raja (the manager) decided on 9 Oct how the assistant treats customers who are unhappy, who want a person, or who want to
leave. Until now the assistant answered an angry customer like any other and only reacted to the exact word STOP. Now:

- **Angry, a complaint, or wants a person:** the customer gets the polite "a team member will take over" line, the chat
  goes to a person (`conversations.mode = 'human'`, our equivalent of Raja's `ai_paused`), a **high-priority** handoff row
  opens (trigger `asked_human` or `complaint`) and `handoff.opened` is sent. Only asking "are you a bot?" is **not** a
  handover: it is answered.
- **The model reads a clear request to stop** ("don't contact me again", "I'm not interested, leave me alone", in any
  language) with confidence of **0.8 or more**: the customer is opted out exactly like a STOP (the opt-out and its log in one
  transaction, one confirmation, the high-priority `opt_out` handoff). Nothing else is sent and **no credit is spent**.
  "Not interested" also moves the lead to `lost` (a booked, visited or won lead is never touched).
- **Not sure what the customer wants** (could be "wants a person", "not interested" or "stop messages", or a doubtful opt-out
  below 0.8): the customer is asked **once**: a short line in their language, then "Reply 1 to talk to the team, or just
  continue", and "If you'd like us to stop messaging you, just reply STOP." There is no STOP button. A "1" in answer hands
  the chat to a person; anything else carries on normally.
- **Raja's phrase list** (`docs/reference/opt-out-handoff-phrases.md`, 10 phrases in 13 languages) is in the new prompt
  `extraction_v2` as few-shot examples of meaning, never as keywords, and is the source of the test cases.

Why code and not the model: the model only reports the intent and how sure it is. Code decides the threshold, the opt-out
and the handover (the project rule: code decides, the model extracts).

## 2. Files changed and what each does

| File | What |
|---|---|
| `backend/src/agent/prompts/extraction_v2.ts` | New prompt version (v1 untouched): new intent `unclear_exit`, key `notInterested`, the threshold wording, and Raja's phrases as examples (a third cached block, the same for every business) |
| `backend/src/agent/prompts/exit-phrases.ts` (+ test) | Raja's phrases as data; the test keeps it equal to the document, and marks Telugu, Kannada, Bengali, Marathi, Gujarati and Punjabi as needing a native speaker's check |
| `backend/src/agent/prompts/fingerprints.test.ts` | Hash of v2's fixed words (an edit in place now fails the build) |
| `packages/types/src/agent.ts` | `Extraction`: intent `unclear_exit`, optional `notInterested` |
| `backend/src/agent/pipeline/understand.ts` | Uses v2; `unclear_exit` and `opt_out` keep no details, no question and do not engage the lead; the summary carries `notInterested` (only with an opt-out) |
| `backend/src/agent/pipeline/plan.ts` | The new rows of the outcome table, `OPT_OUT_MIN_CONFIDENCE = 0.8` as a named constant |
| `backend/src/agent/pipeline/reply.ts` | The `opt-out` step (no reply, no credit), "1" detection, the previous turn's plan case |
| `backend/src/agent/pipeline/stop.ts` | `completeOptOut`, shared by the STOP phrase and the model's opt-out |
| `backend/src/agent/pipeline/persona.ts` | `handoffTriggers` keys `asked_human` and `complaint` can switch each handover off, like `kb_gap` |
| `backend/src/agent/pipeline/fixed-texts.ts` | `exit_question` in four languages |
| `backend/src/agent/pipeline/store.ts` | `markLeadLost`, `getPreviousPlanCase`; `recordOptOut` takes `model_intent` |
| `supabase/migrations/0022_consent_model_intent.sql` | `record_opt_out` also accepts the source `model_intent` (`consent_logs.source` is free text; only the function's list changed). pgTAP test extended |
| `docs/reference/opt-out-handoff-phrases.md` | Raja's phrase list, committed here |

## 3. How to run / test locally

`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm db:reset && pnpm db:test`. Every row of the outcome table in `plan.ts` is a
test in `plan.test.ts`; the steps are in `reply.test.ts`.

## 4. Decisions made

Decided by Raja on 9 Oct (final):

- Angry, a complaint or wants a human: hand to staff, polite line, high-priority handoff row and `handoff.opened`.
- The model's clear opt-out is the same path as STOP. Threshold: **0.8** (approved), a named constant.
- Unclear intent: ask once; no STOP button; "Reply 1 to talk to the team, or just continue" as plain text until `sendButtons` exists.
- "Not interested" moves the lead to `lost`.
- The phrase list is examples, never keywords.

Mine (check these):

- **Consent log source `model_intent`** (approved by Raja) so a model-read opt-out can be told from a typed STOP. It needed a new
  migration, `0022`, because `record_opt_out` limited the sources. Numbered 0022 (after the consent PR's 0021, which follows Shaaz's 0019 and 0020); check main for a free number again before merging.
- **`handoff.opened` has no trigger in its payload**, so the alert job must read the handoff row to pick its wording: for
  `opt_out` Raja wants "Customer opted out. Don't message on WhatsApp unless they write again; a call is safer."
- **A doubtful opt-out (below 0.8) is never an opt-out.** A wrong opt-out silently cuts a customer off, a question costs one message.
- **"1" only counts right after the question** (the previous turn's plan case is `exit_unclear`), and only as the whole message.
- A business can switch the `asked_human` and `complaint` handovers off (`agent_settings.handoffTriggers`); the message is then answered normally.
- The model's opt-out checks the same rules as STOP: nothing is sent after it except the one confirmation.

## 5. For Dev 2 (Shaaz)

- **Migration `0022_consent_model_intent.sql`** must be on each database before this deploys.
- Your `handoff.opened` job: two new triggers need wording, `asked_human` and `complaint` (both high priority), and `opt_out`
  (above). The opt-out handoff stays open until staff resolve it; a later handover in that chat reuses it.
- No new env var. The extraction prompt is now version 2 (traces say `extraction` version 2); a few hundred more cached tokens per call.
- **Later (Day 3):** when `sendButtons` exists, the `exit_question` line becomes two reply buttons, [Talk to the team] and
  [Continue] (ids to agree), and the "Reply 1" wording goes. The place is marked with a TODO in `fixed-texts.ts`.

## 6. For Dev 3 (Dhatri)

- The inbox now gets chats that move to **human** because the customer was angry or asked for a person: handoff triggers
  `asked_human`, `complaint` and `opt_out` (labels needed for `TRIGGER_TEXT` in `frontend/features/inbox/data.ts`).
- A lead can now become `lost` from a conversation ("not interested").
- `consent_logs.source` can be `model_intent`.

## 7. Follow-ups

- Switch `exit_question` to reply buttons when `sendButtons` exists (Day 3).
- The six languages Raja marked (Telugu, Kannada, Bengali, Marathi, Gujarati, Punjabi) need a native speaker's check before
  they are final test data.
- Real-model accuracy of the intents is not proven by these tests (the model is mocked): the conversation tests' `--live` mode
  (next PR) shows what the real model says for each of Raja's phrases.
- **From the review, left as they are (tell me if you want them changed):** (a) if a business switches `asked_human` off, the
  exit question still says "Reply 1", and a "1" is then answered like an ordinary message; (b) "1" counts only right after the
  question, but a long human-mode stretch in between is not detected (it also needs the customer to send exactly "1");
  (c) the pack's own `handoffTriggers` list is not consulted, only the business's setting (all three packs list both
  triggers); (d) a burst like "stop" then "actually book me" is read as one message, and a clear opt-out cannot be undone
  by message; (e) an angry customer is handed over even when the intent is unrelated, as Raja decided.
- If a chat already has an open handover (for example `kb_gap`), an opt-out reuses it: the opt-out is on the contact and in
  `consent_logs`, but there is no second alert.
