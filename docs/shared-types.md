# Shared types (`@pakka/types`)

Owner: all three developers (shared package). First contracts written by Dev 1 in PR #8.
Related: [handover.md](handover.md) (the specs these schemas come from) ·
[frontend-architecture-map.md](frontend-architecture-map.md)

## 1. What this is

`@pakka/types` (`packages/types`) holds the shared contracts as **Zod schemas plus the TypeScript
types inferred from them**. Each contract is written once, as a schema; the type is
`z.infer<typeof Schema>`. Backend, frontend and tests import the same schema, so a payload that
passes validation always has the matching type.

It ships TypeScript source (`"exports": {".": "./src/index.ts"}`), with no build step. Next.js
compiles workspace packages itself, and Vitest reads the source directly.

| File | Contents |
|---|---|
| `src/whatsapp.ts` | `E164`, `InboundMessageType`, `InboundMessage`, `DeliveryStatus`, `StatusUpdate`, `SendResult` |
| `src/agent.ts` | `HandoffTrigger`, `Extraction` (step 4), `NextAction` (step 5) |
| `src/connection.ts` | `ConnectionMethod`, `TokenType`, `ConnectionStatus`, `WhatsAppConnectionPublic`, `ManualConnectInput` |
| `src/pack.ts` | `PackDefinition` and its parts: `PackField`, `PackFieldType`, `ScoringRule`, `HardFail`, `Scoring`, `PackReminder`, `BookingMode`, `PackCatalog` |
| `src/index.ts` | Re-exports all of the above |

### Deliberately not in it

| Left out | Where it lives | Why |
|---|---|---|
| `ChannelAdapter` interface | `backend/src/channels` | It uses `Request` and is only implemented in backend |
| `OutsideWindowError` | `backend/src/channels` | An error class of the adapter, not a data contract |
| Secret-bearing connection rows (`token_enc`, `app_secret_enc`) | `backend` only | The frontend must never be able to import a type that has secret columns |
| Anything used by one workspace only | That workspace | This package is for shapes used by more than one |

## 2. How to use it

**Add the dependency only in the workspace that first imports it**, and in the same PR:

```bash
pnpm --filter @pakka/backend add @pakka/types@workspace:*
pnpm --filter @pakka/frontend add @pakka/types@workspace:*
```

Today nothing depends on it yet. Use `pnpm --filter ... add`, not `pnpm update`, and check that
`pnpm-lock.yaml` changes only in that workspace's importer block.

```ts
import { InboundMessage, NextAction, type StatusUpdate } from "@pakka/types";

const msg = InboundMessage.parse(candidate); // throws ZodError on bad input
const result = NextAction.safeParse(raw);    // { success, data | error }
```

Tests (from the repo root, or inside the package):

```bash
pnpm --filter @pakka/types test        # vitest run
pnpm --filter @pakka/types typecheck
```

`packages/types` has no lint script or eslint config yet.

## 3. Schema reference

| Schema | File | Key rules |
|---|---|---|
| `E164` | whatsapp | `^\+[1-9]\d{7,14}$`: leading `+`, 8 to 15 digits, no spaces |
| `InboundMessage` | whatsapp | `tenantId` and `channelId` are UUID-shaped (any 8-4-4-4-12 hex, not strict RFC versions); `providerMsgId` non-empty; `from` is E.164; `type` is text, interactive, image, audio, location or document; `timestamp` is an ISO datetime (offset allowed); `contactName`, `text`, `buttonId`, `media {id, mime}` and `routeCode` optional |
| `StatusUpdate` | whatsapp | `status` is sent, delivered, read or failed; ISO `timestamp`; optional E.164 `recipient`; optional `error {code: int, message}` |
| `SendResult` | whatsapp | `{ providerMsgId }`, non-empty |
| `HandoffTrigger` | agent | Core enum: asked_human, complaint, negotiation, hot_lead, kb_gap, stuck, credits_exhausted |
| `Extraction` | agent | `language` en, ta, ta-en, ml, hi or other; `intent` one of the 11 in the handover; `fields` is a record of string to string, number or boolean; `question` and `preferredTime` are nullable but required; `sentiment` positive, neutral, negative or angry; `asksIfHuman` boolean; `confidence` 0 to 1 |
| `NextAction` | agent | Union discriminated on `kind`: answer_and_ask, ask_fields, offer_slots, confirm_booking, reschedule, cancel, handoff, decline_off_topic, close_disqualified, opt_out_ack. `answer_and_ask` allows at most 2 `askFields` (0 is fine); `ask_fields` needs at least 1; `handoff.trigger` is a `HandoffTrigger` |
| `WhatsAppConnectionPublic` | connection | One row of `whatsapp_connections_public`, snake_case. Secret columns are not in the schema, so Zod strips them if a full row is parsed |
| `ManualConnectInput` | connection | Admin form body (camelCase): `tenantId` UUID-shaped, `wabaId`, `phoneNumberId`, `token`, `tokenType` (business or system_user) and `appSecret` all required and non-empty; `displayPhone` and `clientBusinessId` optional |
| `PackDefinition` | pack | `key` lower kebab-case; `version` integer of at least 1; `fields` non-empty; `scoring` required; `bookingType` and `bookingModes` both optional; the lists below default to `[]` |
| `PackField` | pack | `key` lower snake_case; type text, int, boolean, enum, range_inr or date_range_or_month; `enum` needs `options`; `required` defaults to false |
| `ScoringRule` | pack | **Strict object** (unknown keys fail). Needs one of `match`, `equals`, `in` or `gte`; `points` is an integer of at least 0; optional `value` for `match` |
| `HardFail` | pack | **Strict object**. Needs `below` or `match` |
| `Scoring` | pack | `thresholds` is strict, `hot` must be greater than `warm`; `hardFails` defaults to `[]` |
| `PackReminder` | pack | **Strict object**. `anchor` is start, end or quote_sent; `offset` matches `^[+-]\d+[mhd]$` (`-30m`, `+2d`); optional `feature`. `feedback` reuses this shape |
| `BookingMode` | pack | slot, site_visit, field_visit, callback, date_range or quote |
| `PackCatalog` | pack | **Strict object**: `type`, `attributes[]`, `matchOn[]` |

`PackDefinition` lists that default to `[]`: `reminders`, `handoffTriggers`, `templates`,
`kbStarter`, `extraGuardrails`.

## 4. Choices where handover.md was silent

- **`StatusUpdate` and `SendResult` are new shapes.** The handover names them without defining them.
- **ISO timestamps.** `InboundMessage.timestamp` must be an ISO datetime; Meta sends unix seconds, so the parser converts.
- **UUID-shaped ids.** `tenantId`, `channelId` and the connection ids are checked with `z.guid()` (any 8-4-4-4-12 hex), not `z.uuid()`, which also checks the version and variant digits and so rejects the seeded ids such as `d0000000-0000-0000-0000-000000000001`.
- **`HandoffTrigger` is a core enum, but a pack's `handoffTriggers` is a plain string list.** Pack-specific triggers such as `group_above_15` therefore parse. The pipeline owns what to do with an unknown pack trigger.
- **`Extraction.fields` is generic.** Checking its keys against the pack's field schema is the loader's or pipeline's job.
- **`NextAction` limits.** The "max 2 fields" comment in the handover is applied to `answer_and_ask` only. `ask_fields` needs at least 1.
- **New `boolean` pack field type.** Not in the handover's field types; added because the real-estate scoring rule `decision_maker equals true` implies one.
- **Strict scoring, hard-fail, reminder, threshold and catalog objects.** A typo such as `eqauls` fails instead of being silently dropped.
- **Both `bookingType` and `bookingModes` are accepted**, both optional (see section 7).
- **Scoring fields are not cross-checked against `fields`** in the schema. That check belongs to the loader.
- **`WhatsAppConnectionPublic` is snake_case** to match the database view; `ManualConnectInput` is camelCase because it is an API body.
- **`last_check` is `record<string, unknown>`**, because the handover does not fix its shape.
- **`E164` requires a leading `+`.**

## 5. What each developer must follow

**Dev 1 (agent and WhatsApp)**
- The Meta parser normalises raw numbers (Meta sends digits without `+`) to E.164 *before* building an `InboundMessage`, and converts timestamps to ISO.
- The pack loader validates every pack with `PackDefinition`. It derives `bookingModes` from `bookingType` and logs a warning, and it warns when a scoring rule names a field the pack does not declare. (Agreed plan; the loader is not written yet.)
- Validate every LLM output with `Extraction` and every decided action with `NextAction`.

**Dev 2 (booking, jobs, money)**
- Use these shapes for anything that crosses a module boundary, for example `InboundMessage` in `whatsapp/message.received` events, `StatusUpdate` for delivery statuses, `SendResult` for sends. Do not redefine them locally.
- If you need a field added, open a PR here (section 6) rather than extending a copy.

**Dev 3 (dashboard and onboarding)**
- Screens read connections through `WhatsAppConnectionPublic` only.
- `ManualConnectInput` carries a token and an app secret: post it once to the server, never keep it in client state or localStorage, and never echo it back into the UI.
- Never import or recreate a type with `token_enc` or `app_secret_enc`.

## 6. Changing a contract

1. Any change to `packages/types` goes through a pull request; never edit a copy elsewhere.
2. Tag Dev 2 and Dev 3 in the PR (all three own this package), and say which shapes changed.
3. Keep changes backward compatible where possible: add optional fields and new enum values rather than renaming or removing. A breaking change needs every consumer updated in the same PR or an agreed follow-up.
4. Add or update tests in the same PR. `pnpm lint`, `pnpm typecheck` and `pnpm test` must pass.
5. If the change alters a contract in [handover.md](handover.md), update that file in the same PR.
6. Lockfile changes stay inside the importer blocks of the workspaces whose dependencies you changed.

## 7. Open questions for Raja

| Question | Why it matters |
|---|---|
| Is `bookingType` (real-estate example in the handover) or `bookingModes` (tours-travel example) the canonical pack key? | The schema accepts both for now; the loader will derive modes and warn until this is decided |
| Add `decision_maker` to the real-estate `fields`? | The handover's real-estate scoring rule uses `decision_maker`, but the field list does not declare it |

## 8. Status

**Day 1, task 1: done** (PR #8, merged to `main`). 12 files: the four schema modules, `index.ts`, four
test files, `vitest.config.mts`, `package.json` and `pnpm-lock.yaml` (7 lines, `packages/types`
importer only). 51 Vitest tests in `packages/types`; lint, typecheck and test pass across all
workspaces.

**Next (Dev 1, Day 1):** env change (`META_GRAPH_API_VERSION`) and the AES-256-GCM crypto helper;
synthetic webhook fixtures; the parser and HMAC signature check; the webhook route; the
test-number connection seed script; adapter `sendText` and `markRead`; the pack loader in
`backend/src/agent/packs/`. The first of these to import `@pakka/types` adds the dependency in its
own workspace.
