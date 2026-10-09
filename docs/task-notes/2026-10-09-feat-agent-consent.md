# feat/agent-consent: the privacy notice and STOP

Audience: Dev 2 (Shaaz) and Dev 3 (Dhatri).

> **#68 (the reply PR) is merged (9 Oct); this branch was rebased onto `main` and its PR base is `main`.** Nothing else to do before merging.

## 1. What I built and why

Two privacy rules for talking to customers on WhatsApp (India's DPDP law, as in the handover). First, the first time the
assistant answers someone, the reply ends with one short line saying that an AI assistant is answering, how to stop (reply
STOP) and where the privacy policy is. We record that the notice was shown. Second, if a customer writes STOP (or the same
in Tamil, Tanglish or Hindi), they are opted out at once: they get one last message confirming it, and after that the
assistant never writes to them again. This works even in a chat a person is handling and even when a business has switched the
AI replies off: an opt-out never depends on a toggle. The STOP check is a fixed list of phrases, not the AI's guess, because opting
someone out must be certain.

Technical summary (details in `docs/contracts.md`, section 5, "Consent (DPDP)"):

- **Notice**: **off by default** (`tenants.agent_settings.privacyNotice`, a boolean, validated with Zod; missing or anything but `true` means off). When on, `contacts.consent_at` null means the next AI reply carries it. Added after the post-check, after a blank line,
  in the reply's language, with the policy link last (`PRIVACY_POLICY_URL`, optional env var, default
  https://pakkaagent.in/privacy). After the send, `record_notice_shown` sets `consent_at` and writes `consent_logs`
  `notice_shown` in one transaction, once, with the outbound message id.
- **STOP**: a new step `stop-check` (before the model reads anything), and `stop-check-gated` for a turn the gate turned
  away because a person has the chat or the AI is off. If a message of the turn is one of the fixed phrases (the whole
  message), `record_opt_out` sets `opted_out_at` and logs `opted_out`, at most one confirmation goes through the system-notice
  port, a high-priority `opt_out` handoff row and `handoff.opened` tell staff, every message of the turn is marked answered, and the turn ends. The safe line sent after a run gave up checks for
  STOP first, so a customer who said stop never gets that line or a notice. The gate and `notify.send` refuse everything after.
- **Migration 0021** (`record_notice_shown`, `record_opt_out`): each writes the contact and the log in one transaction, so a
  retry can never log twice or set one without the other.

## 2. Files changed and what each does

| File | What it does |
|---|---|
| `supabase/migrations/0021_consent_functions.sql` (+ `supabase/tests/consent_functions.test.sql`) | The two consent writes, atomic, service role only |
| `backend/src/consent/stop-words.ts` | The fixed STOP phrases and `matchStop` |
| `backend/src/agent/pipeline/stop.ts` | The `stop-check` step |
| `backend/src/agent/pipeline/reply.ts` | Adds the notice to a first reply and records it; the safe line after a failed run carries it too |
| `backend/src/agent/pipeline/fixed-texts.ts` | The notice and the opt-out confirmation, in four languages |
| `backend/src/agent/pipeline/store.ts` | `getContact` reads `consent_at`; `recordNoticeShown`, `recordOptOut` |
| `backend/src/agent/pipeline/runtime.ts`, `backend/src/inngest/process-message.ts` | Wiring: the link from env, the new step before understanding |
| `backend/src/lib/env.ts`, `backend/.env.example` | `PRIVACY_POLICY_URL` (optional, https, default) |
| tests, `docs/contracts.md` | Tests for all of it; section 5 and the migration table |

## 3. How to run / test locally

```
pnpm --filter @pakka/backend exec vitest run src/agent src/consent src/inngest src/lib
pnpm typecheck && pnpm lint && pnpm test && pnpm db:test
```

I also ran it against the local database with the real SQL functions: a first reply carries the notice in Tamil and
`consent_at` is set with one `notice_shown` log; a Tamil STOP opts the contact out with one `opted_out` log; a second STOP
changes and logs nothing.

## 4. Decisions made

Need review by Dev 2 (Shaaz):

- **Migration 0021, `consent_functions`** (was 0019; renumbered to 0021 on 9 Oct after Shaaz's 0019 and 0020 landed). Two
  functions, service role only, filtered by business. Without them the contact update and the log would be two separate
  writes that a retry could split.
- **At most one confirmation, sent only by the run that opted the contact out.** If that run fails between the opt-out and
  the confirmation, the retry sees "already opted out" and does not send it (the opt-out must never be undone, and a second
  confirmation would be a second message to someone who said stop). The cost: in that rare case no confirmation goes out.
- **The notice is recorded as shown only when the send is known to have gone out.** If the outcome is unknown, `consent_at`
  stays null and the next reply carries the notice again: a repeated notice costs nothing, a false "shown" in the log would.
- **Ambiguous lone words are off the list (our decision, not Raja's):** *ruko*, रुको, रुकिए, *niruthu* and *niruthunga* (and the
  spellings *nirutthu*, *nirutthunga*) are removed. They often mean "wait" or "stop that for now", and a wrong opt-out silently
  cuts a customer off, while someone who really wants out can always type STOP. Kept: every explicit phrase, "don't message
  me" and "बन्द करो". Longer phrases are not matched either: recall of the list is a product decision. The Tamil-script
  நிறுத்து / நிறுத்துங்கள் / நிறுத்துங்க have the same ambiguity and are still on the list: say if they should go too.
- **A STOP is the WHOLE message being one of the phrases.** "bus stop near the project", "don't stop calling me" and
  "stop by tomorrow at 5" are ordinary messages. A message the model reads as wanting to leave, but that is not one of the
  phrases, gets the STOP hint and is not opted out.
- **Where the STOP list came from** (the approved list, plus two spellings): English: stop, stop all, stopall, unsubscribe,
  opt out, optout, stop messages, stop messaging, stop messaging me, do not message me, dont message me, **don't message
  me** (added: the apostrophe form), remove me, leave me alone. Tanglish:
  message panna vendam, msg panna vendam, message pannadheenga, enakku message vendam. Tamil script: நிறுத்து,
  நிறுத்துங்கள், நிறுத்துங்க, மெசேஜ் அனுப்பாதீர்கள், மெசேஜ் அனுப்பாதீங்க, எனக்கு மெசேஜ் வேண்டாம். Hindi: बंद करो,
  **बन्द करो** (added: the other spelling), बंद करें, मैसेज बंद करो, मैसेज मत भेजो, band karo, message mat bhejo. Not on
  the list on purpose: "cancel" alone (a booking), "vendam" alone, "band" alone.
- **Privacy notice: disabled by default per Raja (9 Oct); switchable per business if legal review requires it.** Nothing is appended and `notice_shown` is never logged while the setting is off (`consent_at` stays null). The code is kept as it was.
- **STOP also opens a handoff (Raja, 9 Oct).** A high-priority handoff row with trigger `opt_out` and `handoff.opened` (event id `handoff_opened:<handoffId>`), so staff see it. The alert wording Raja wants: "Customer opted out. Don't message on WhatsApp unless they write again; a call is safer." The chat's mode is NOT changed (nobody can message the contact anyway; a person only calls). It runs on every run that finds the STOP, so a retry still tells staff (the open handoff is reused). If the chat already had an open handoff (for example `kb_gap`), that one is reused and its event already exists: the opt-out is then visible on the contact, not as a new alert. `opt_out` is added to `HandoffTrigger` in `packages/types`.
- **Single ambiguous words do not opt out (Raja, 9 Oct):** also the Tamil script நிறுத்து, நிறுத்துங்கள், நிறுத்துங்க are off the list (negative tests added). STOP and every explicit phrase still opt out.
- **The STOP confirmation goes through `system_notice`** (Shaaz's #70): free, sent even to a contact who just opted out, inside the 24-hour window only.
- **The notice (when on) goes on every first reply, including a fixed line** (the safe fallback, a clarifying question), and is not
  part of the 600 characters or the post-check. It is added at the end of the text, after a blank line, with the link last.
- **Wording** (mine, `fixed-texts.ts`; Raja can change any line there): notice: "This chat is answered by an AI assistant.
  Reply STOP to opt out. Privacy policy: <link>" and its Tamil, Tanglish and Hindi versions; confirmation: "You've been
  opted out and won't get any more messages from us. Thank you." and its versions.
- **No way back by message**: nothing like "START" exists yet; opting in again is a dashboard or admin action (later).

## 5. For Dev 2 (Shaaz)

- **Migration `0021_consent_functions.sql`** must be on each database before this deploys (as for 0018).
- **New optional env var `PRIVACY_POLICY_URL`** (https, default https://pakkaagent.in/privacy): nothing to set unless the policy
  is elsewhere.
- **The STOP confirmation now uses your `system_notice`** (#70). **Please add the alert for the new `opt_out` handoff trigger** to your `handoff.opened` consumer (#71): high priority, wording "Customer opted out. Don't message on WhatsApp unless they write again; a call is safer." (Raja to confirm Tamil). **Migration number clash:** your #71 also adds `0019` (`notify_staff_target`); whichever of us merges second renumbers to the next free number.
- The `stop-check` step runs before every turn's understanding step: one small database read per turn, and nothing else
  unless the message is a STOP.

## 6. For Dev 3 (Dhatri)

- `contacts.opted_out_at` and `contacts.consent_at` now change from real conversations. `consent_logs` gets `notice_shown`
  (source `first_message`) and `opted_out` (source `stop_keyword`) rows with the message id: a timeline of consent can be
  built from it (members can read their business's rows).
- A contact who sent STOP stays in the inbox with their messages; the assistant stops writing to them, and so does every
  automated message (`notify.send` refuses). Staff replies are not blocked by this PR.

## 7. Follow-ups

- **Done 9 Oct:** the pipeline's own owner-alert call (the staff-alert port) is removed now that Shaaz's `handoff-alert` job (#71) alerts owners from `handoff.opened`: one handoff sends one `handoff.opened` event (id `handoff_opened:<handoffId>`) and no direct alert, so owners get exactly one alert. Tests: `reply.test.ts` (`expectOneAlertEvent`).

- **Dhatri:** the inbox's `TRIGGER_TEXT` map (`frontend/features/inbox/data.ts`) has no `opt_out` entry; it falls back to "opt out". A clearer reason such as "opted out: call instead of messaging" would help staff. I did not touch your file.
- **Shaaz:** `handoff.opened` carries no trigger, so the alert job must read the handoff row to pick the `opt_out` wording.
- If the chat already has an open handoff, the STOP reuses it (no new alert). A STOP never fails because of that, and the contact is opted out either way.
- A failing handoff write in the STOP step still marks the messages answered, then fails the step so the retry opens the handoff; the confirmation is never sent twice.

- Opting in again, deletion requests (`deletion_requested`, `deleted`) and the dashboard's own opt-out (source `dashboard`)
  are not part of this PR.
- Pending reminders or follow-ups for a contact who opts out are not cancelled here (they do not exist yet); when they do,
  they must check `opted_out_at` (`notify.send` already does).
- A STOP typed into a message that is not just the phrase ("stop messaging me, I will call you") is read by the model as
  wanting to leave and gets the STOP hint: the customer must send the word itself. A broader check would need a decision on
  false positives.
