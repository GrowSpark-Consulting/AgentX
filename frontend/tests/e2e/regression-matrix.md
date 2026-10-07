# Frontend regression matrix

What the Playwright suite checks for the real dashboard, onboarding and sign-in, and what it can't check
yet. Every e2e test runs at desktop (1440), tablet (820) and mobile (390) through the projects in
`playwright.config.ts`, against `support/mock-supabase.mjs` and the real API. Paths are relative to
`frontend/tests/e2e/`. Update this file when you add, move or retire a test.

Status: ✅ covered · ⛔ blocked on another team (don't fake it) · ➖ not covered yet

## A. Sign-in and navigation

| Behaviour | Status | Where |
|---|---|---|
| Signed-out visits to dashboard pages go to sign-in, then back | ✅ | `app/auth.spec.ts` (home, messages, templates, WhatsApp, preview); `app/navigation.spec.ts` (inbox, knowledge) |
| Sign-in: field errors, wrong password, safe `next` | ✅ | `app/auth.spec.ts` |
| Sign-up, email confirmation, existing address | ✅ | `app/signup.spec.ts` |
| Google sign-in, cancel, failed exchange | ✅ | `app/google.spec.ts` |
| Password reset | ✅ | `app/password-reset.spec.ts` |
| New account goes to onboarding until it has a business | ✅ | `app/signup.spec.ts`, `app/trial-signup.spec.ts` |
| Nav offers exactly the existing sections; each opens at its own address, no redirect | ✅ | `app/navigation.spec.ts` |
| Business name on every screen; current section marked | ✅ | `app/auth.spec.ts`, `app/navigation.spec.ts` |
| Back / Forward between sections | ✅ | `app/navigation.spec.ts` |
| Session survives reload and new tab; log out | ✅ | `app/auth.spec.ts` |
| No business / several businesses / forged tenant cookie | ✅ | `app/auth.spec.ts`, `app/no-business.spec.ts` |

## B. Inbox (`/dashboard/inbox`)

| Behaviour | Status | Where |
|---|---|---|
| List newest first, AI / Needs human / Human tags, masked numbers | ✅ | `app/inbox.spec.ts` |
| Open a chat: bubbles, senders, handoff strip, 24-hour window | ✅ | `app/inbox.spec.ts` |
| Filters and search | ✅ | `app/inbox.spec.ts` |
| Unread filter switched off (nothing stores read state) | ✅ | `app/inbox.spec.ts` |
| Reply box, Send, AI/Human switch shown but switched off | ✅ | `app/inbox.spec.ts` |
| Realtime: one subscription per member, live inserts and updates, not connected | ✅ | `app/inbox.spec.ts` |
| Empty and error states | ✅ | `app/inbox.spec.ts` |
| Phone: one column at a time with Back; wide: side by side | ✅ | `app/inbox.spec.ts` |
| Loading state | ➖ | no slow account for inbox reads in the mock |
| Sending replies, taking over, marking read | ⛔ | no API yet |

## C. Services (Knowledge base › Services & prices)

| Behaviour | Status | Where |
|---|---|---|
| Table, empty state with Add | ✅ | `app/knowledge.spec.ts` |
| Add, edit, delete with confirmation (Keep it keeps it) | ✅ | `app/knowledge.spec.ts` |
| Validation before saving; nothing sent until valid | ✅ | `app/knowledge.spec.ts` |
| Failed save or delete reported, never shown as done | ✅ | `app/knowledge.spec.ts` |
| Reads and writes scoped to the session's business | ✅ | `app/knowledge.spec.ts` |
| Read error with Try again; dialogs fit the screen | ✅ | `app/knowledge.spec.ts` |

## D. Knowledge and documents

| Behaviour | Status | Where |
|---|---|---|
| Documents newest first, labels, dates; read-only, scoped reads | ✅ | `app/knowledge.spec.ts` |
| Documents empty and error states (rest of page still works) | ✅ | `app/knowledge.spec.ts` |
| "Questions the AI couldn't answer": "Not available yet", no buttons | ✅ | `app/knowledge.spec.ts` |
| FAQs: "Not available yet", Add switched off | ✅ | `app/knowledge.spec.ts` |
| Upload switched off, no file input | ✅ | `app/knowledge.spec.ts` |
| Questions list with answers, FAQ writes, uploads, document status | ⛔ | KB contract PROPOSED (`docs/kb-contract-checklist.md`), pending Shaaz and Raja |

## E. WhatsApp (`/dashboard/whatsapp`, home card)

| Behaviour | Status | Where |
|---|---|---|
| No number, Connecting, Checking, Connected, Needs attention, Disconnected | ✅ | `app/whatsapp.spec.ts` |
| Loading, unavailable (view missing), load error | ✅ | `app/whatsapp.spec.ts` |
| Only public fields rendered (no token or secret) | ✅ | `app/whatsapp.spec.ts` |
| Recheck: owner and admin, switched off with the reason | ✅ | `app/whatsapp.spec.ts` |
| Disconnect: owner only; dialog, confirm switched off, Escape / Keep it close it | ✅ | `app/whatsapp.spec.ts` |
| Disconnect sends no request and claims nothing | ✅ | `app/whatsapp.spec.ts` |
| Staff see the status only; home card has no actions or ids | ✅ | `app/whatsapp.spec.ts` |
| Dialog fits at every width | ✅ | `app/whatsapp.spec.ts` |
| Test message refused without an active number (server side) | ✅ | `app/whatsapp.spec.ts`, `app/messaging.spec.ts` |
| Recheck and Disconnect actually working; Connect WhatsApp | ⛔ | endpoints not on the API (handover module 10, Dev 1; router `:param` support, Dev 2) |

## F. Onboarding (`/onboarding`)

| Behaviour | Status | Where |
|---|---|---|
| Every step, Back, no overflow; completing is a full load to `/dashboard` | ✅ | `onboarding/onboarding.spec.ts` |
| Business step creates exactly one trial | ✅ | `app/trial-signup.spec.ts` |
| WhatsApp step labelled as a preview; ends "isn't connected yet" | ✅ | `onboarding/onboarding.spec.ts` |
| Live step never shows the number as live | ✅ | `onboarding/onboarding.spec.ts` |
| No token or app-secret fields; no made-up portfolio id, webhook URL or verify token | ✅ | `onboarding/onboarding.spec.ts` |
| No test-send, template-count or Meta-status claims | ✅ | `onboarding/onboarding.spec.ts` |
| Real Embedded Signup popup | ⛔ | needs the code-exchange endpoint (Dev 1); parsing is unit-tested in `lib/whatsapp/embedded-signup.test.ts` |

## G. Prototype (`/dashboard/preview`, sample data)

Covered by `dashboard/*.spec.ts` (screens, dialogs, navigation per width). It is sample data and says
so; it is not evidence that a real feature works.

## Known flakes

**7 Oct 2026, not reproduced.** One full run (430 tests, 7.0 min) had 7 failures: password reset, three
signup tests and three prototype `?screen=` checks. All 7 passed when rerun on their own. Investigation:

- Two clean full-suite runs on an idle machine passed 420/420 with the usual 10 skips (5.4 and 4.8
  min). Affected specs together also passed: password reset + signup (28), signup + prototype
  navigation (67), all three (76).
- Not a regression, and no shared-state cause found: the failing tests each use their own
  `uniqueEmail()` account, signing up as an existing address changes nothing in the mock, and logout
  revokes only the token it is given, so the shared owner session survives other tests logging out.
- The error text from the failing run was lost (local retries are 0, and `test-results/` was emptied by
  a later run), so the exact failing assertion is unknown. The failing run was about 30% slower than
  the clean ones, which points to load on the machine at the time.
- No fix was made: none is justified without a reproduction. No test was skipped, disabled, retried or
  given a longer timeout to hide it. A later 8-worker stress run is not evidence: the working tree
  changed while it ran.

If these fail again, keep the run's `test-results/` (or run with `--output` to a folder of your own)
and record the error, worker and duration before rerunning. Two sessions sharing this checkout also
share the E2E ports, `.next/` and `test-results/`: run one suite at a time.

## Not testable from the frontend yet

- Anything behind a missing API: KB writes, WhatsApp connect / recheck / disconnect, inbox replies.
- Database rules (RLS, functions): `pnpm db:test` needs Docker and local Supabase.
- Assistant replies: `fixtures/regression/tanglish-queries.ts` holds 15 representative questions for when
  the reply pipeline exists. It has no answers by design.
