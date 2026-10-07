# Task notes: seed script for our own WhatsApp test/demo number

Branch `feat/agent-connection-seed`. For Dev 2 (Shaaz) and Dev 3 (Dhatri).

## 1. What I built and why

The webhook can now receive customer messages, but a message is only stored if the number it arrived on is
connected to a business in our database. Our own test number (and later the shared demo number) belongs to our
own Meta app, not to a client, so none of the existing connection types describe it truthfully. This PR adds a
fourth type, `platform`, and a small command that connects one of our own numbers to a chosen business on a
developer's machine. After running it once, a test message sent to the number shows up in the `messages` table.

Technical details:

- **New method `platform`** on `whatsapp_connections` (migration 0014, which widens the check constraint). It
  means: our own number, signed with `META_APP_SECRET`, token is our system-user token (`token_type
  system_user`). Rows are created only by the seed script.
- **The webhook is now an allow-list.** `inbound.ts` used to refuse only `manual_byo`; it now accepts exactly
  `embedded_signup`, `assisted` and `platform`, so a method added in future is not trusted until someone lists it.
  `manual_byo` is still treated as an unknown number.
- **The command:** `pnpm seed:connection -- <flags>`. It connects one number to one business as an `active`
  `platform` connection (`connected_by = 'system:seed'`), creating or reusing the business's generic WhatsApp
  channel row. Safe to run twice: it finds the row by `phone_number_id` and updates the same row (same id).
- **The token** comes only from `META_SYSTEM_USER_TOKEN` in the environment, never from a flag (a flag would be
  saved in shell history; pnpm even echoes the command line). It is encrypted with `ENCRYPTION_KEY`, bound to the
  connection id and business, exactly as the adapter expects to decrypt it.
- **Local only.** The script refuses unless the database host is `127.0.0.1`, `localhost` or `[::1]`, and refuses
  anything it cannot parse. `--allow-remote` is the one deliberate override.
- **Graph check, on by default.** Before anything is written it asks Meta for the number's verified name and
  display number (one GET at the pinned Graph version, token in the header only). A rejected token, a different
  number, a bad answer or a network failure stops the script with nothing written. It fills `verified_name` and
  `display_phone` from the answer. `--skip-check` turns it off.
- **It never overwrites a real client connection.** A number already connected to another business, or in any way
  other than `platform`, is refused.
- **Output** is only the business, the masked display number, the connection id, the status and (if set) the
  token's expiry date. Errors are fixed text: no token, no Meta error text, no Postgres message.

## 2. Files changed and what each does

| File | What it does |
|---|---|
| `supabase/migrations/0014_connection_method_platform.sql` | Adds `platform` to the `whatsapp_connections.method` check |
| `backend/src/channels/whatsapp/seed-connection.ts` | The logic: argument parsing, the local-only guard, the Graph check, the seed, the printed lines. Database and network are injected |
| `backend/src/channels/whatsapp/seed-connection-db.ts` | The real database calls (service role). Updates are filtered by business; errors carry only the Postgres code |
| `backend/src/scripts/seed-connection.ts` | The command-line wrapper |
| `backend/src/channels/whatsapp/inbound.ts` | The webhook's method check: deny-list became an allow-list including `platform` |
| `packages/types/src/connection.ts` | `ConnectionMethod` gains `platform` |
| `frontend/components/dashboard/whatsapp-connection-panel.tsx` | **One line (Dhatri's file):** the label for `platform`, "Spark Agent number" |
| `backend/package.json`, `package.json` | The `seed:connection` script (and a root alias) |
| `docs/whatsapp-connection-contract.md` | The method list and a note on `platform` |
| tests | `seed-connection.test.ts`, `webhook-post.test.ts` (+3), `packages/types` `connection.test.ts` (+1), `supabase/tests/connection_method.test.sql` |

## 3. How to run / test it locally

```
pnpm db:reset && pnpm db:test                                    # applies 0014 and runs the SQL tests (Docker)
pnpm --filter @pakka/backend exec vitest run src/channels/whatsapp/seed-connection.test.ts
pnpm typecheck && pnpm lint && pnpm test                         # everything
```

To seed our own number locally, put these names in `backend/.env.local` (values from the Meta app and your local
Supabase; never commit the file): `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ENCRYPTION_KEY`, `META_SYSTEM_USER_TOKEN`,
`WHATSAPP_DEMO_PHONE_NUMBER_ID`, `WHATSAPP_DEMO_WABA_ID` (and `META_APP_SECRET` for the webhook itself). Then:

```
pnpm seed:connection -- --route-code DEMO-SALON                                  # a seeded demo business, by its route code
pnpm seed:connection -- --tenant <uuid> --token-expires-at 2026-10-09T10:00:00Z   # Meta's temporary token lasts about a day
pnpm seed:connection -- --route-code DEMO-SALON --skip-check --display-phone +91XXXXXXXXXX   # offline
```

Flags: `--tenant <uuid>` or `--route-code <code>` (exactly one), `--phone-number-id`, `--waba-id` (default to the
`WHATSAPP_DEMO_*` variables), `--display-phone`, `--token-expires-at <ISO date and time>`, `--skip-check`,
`--allow-remote`. It prints the business, the masked number, the connection id, the status and the expiry date.

The command was exercised for its refusals only (no environment: it stops and names the missing variables; a
`--token` flag: refused). A full run against a real number was not done in this PR: it needs the Meta values above.

## 4. Decisions made

Need review by Dev 2 (Shaaz):

- **Migration 0014** (a schema change: a check constraint, no data changes). Renumber if 0014 is taken at merge.
- **`platform` is a new connection method**, chosen over mislabelling our numbers as `embedded_signup` or `assisted`
  (false, and the dashboard would say "Connected with Facebook") or `manual_byo` (signed with a different secret,
  and treated as unknown by the webhook).
- **The webhook's method rule is now an allow-list** (`embedded_signup`, `assisted`, `platform`).
- **`connected_by = 'system:seed'`** for rows the script writes (alongside `admin:<id>` and user ids).
- **The business is chosen by uuid or by route code**, never by an industry name: the route code is looked up in
  `route_codes`, so no industry appears in code.
- **The token is read only from `META_SYSTEM_USER_TOKEN`**; no new environment variable was added.
- **The Graph check runs before any write and is on by default**; its result is not stored in `last_check`, which
  stays reserved for the connection checks in the contract.
- **`--token-expires-at` is optional.** Without it `token_expires_at` stays null (a token that does not expire).
  An expiry already in the past is refused.

Need review by Dev 3 (Dhatri):

- **One line in her file**, `whatsapp-connection-panel.tsx`: the label map is exhaustive over the connection
  method, so `platform: "Spark Agent number"` had to be added or typecheck fails. Please check the wording.
- **`ConnectionMethod` in `@pakka/types` gains `platform`.**

## 5. For Dev 2 (Shaaz)

- **Migrate:** apply 0014 (`pnpm db:reset` locally). Existing rows are unaffected.
- **Nothing to deploy for the script**: it is a developer tool, run from a machine. Do not run it against staging
  or production; it refuses a non-local database unless `--allow-remote` is passed.
- **Shared demo number:** the handover routes it by a route code in the customer's first message. That routing is
  not built, and the webhook uses the connection's own business. A seeded shared demo number therefore sends every
  message to the one business it was seeded for. Fine for our own test number; route-code routing is a follow-up.
- **No Inngest change**, no resync.
- Anything that lists connection methods (a future admin screen, the manual-connect route) should know
  `platform` exists and is not self-serve.

## 6. For Dev 3 (Dhatri)

- A `platform` connection appears in `whatsapp_connections_public` like any other, with `method = 'platform'`.
  Show it with the label "Spark Agent number". It is our own number: do not offer disconnect or recheck for it
  (those routes are for the client's own connections).
- It can only exist on businesses a developer seeded (the demo businesses in local and staging). A real client
  never has one.
- Do not assume `display_phone` and `verified_name` are always set: with `--skip-check` and no `--display-phone`
  they are null.
- Do not assume `token_expires_at` is null: for our test number it may be a date a day away, and the number stops
  sending when the temporary token ends.

## 7. Follow-ups / not done in this PR

- Route-code routing for the shared demo number (the first message's `DEMO-` or `TRIAL-` code picks the business).
- A full run of the script against our real Meta number, once the variables above are in `backend/.env.local`.
- `manual_byo` signature verification (separate PR, with the manual-connect route).
- A permanent token for our own number (the system-user token) so `--token-expires-at` is no longer needed.
- A staging runbook for connecting the shared demo number there, if wanted; the script refuses remote databases
  by design.
