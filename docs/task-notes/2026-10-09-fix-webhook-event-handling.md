# fix/webhook-event-handling: template, quality and account events from Meta

Audience: Dev 2 (Shaaz) and Dev 3 (Dhatri).

## 1. What I built and why

Meta sends our webhook more than messages. It also tells us when a message template is approved or rejected, when a
number's quality or messaging limit changes, and when something happens to the WhatsApp account. Until now the
webhook read those events and then dropped them. With this change a template's status really updates (so the
Templates screen shows "Approved" without anyone touching the database), the number's messaging limit is kept on its
connection, and the other events are written to the log by name so we can see them. A field we have never heard of is
counted in the log and never makes the webhook fail. The webhook still answers Meta with 200 whenever it has done its
part, and with 500 when our own side fails (the database, or an answer from it we cannot read); Meta then sends the event again, which is safe.

Technical summary:

- **Template status:** for each `message_template_status_update`, the business is found from the connection that has
  that WhatsApp account (never from the payload). `set_template_status` is not tenant-scoped (it takes Meta's id
  only), so the handler first asks whether that business has a template with that id, and only then calls it, passing
  Meta's raw event. An unknown template, another business's template, or a status the function does not know is logged
  and ignored. The same event twice changes nothing.
- **Quality and account updates:** `phone_number_quality_update` and `account_update` are now parsed (event name,
  limit, rating; plain identifiers only) and logged by name with the connection id (no phone numbers, no secrets).
  With exactly one connection on the account, `messaging_limit` (and `quality_rating`, if the payload carries one) are
  updated on that connection, filtered by business and connection id. Meta names the number by its display number, not
  its id, so with several connections on one account nothing is guessed: the event is logged as `ambiguous`.
- **Unknown fields:** counted by name in the summary log line (`fields=name:count`); never an error.
- **What it waits for:** the handler is written against injected dependencies. Tests show that for a message it waits
  for the database store and then the queue's send, and for a template event for the account lookup, the ownership
  check and the status function, one after the other, that it calls no network client, and that it uses no other
  dependency. (They cannot prove that nothing else is awaited anywhere; the dependencies are the only things the
  handler is given.)
- **A message that keeps failing does not hold back the template and quality events** of the same batch: they run
  anyway (they are idempotent and repeat on Meta's retry).
- **Meta's reason** for a rejected template is cleaned and cut to 500 characters before it is stored.

## 2. Files changed and what each does

| File | What it does |
|---|---|
| `backend/src/channels/whatsapp/parse.ts` | New `qualityUpdates` and `accountUpdates` lists in `ParseResult` |
| `backend/src/channels/whatsapp/inbound-db.ts` | `findConnectionsByWaba`, `templateBelongsToTenant`, `setTemplateStatus` (the RPC), `updateConnectionHealth` |
| `backend/src/channels/whatsapp/inbound.ts` | Optional second argument `deps` (default: the real ones); handles the three new event kinds; `fields=` in the log |
| `backend/src/channels/whatsapp/inbound.test.ts` | New: the three events, ambiguity, tenant checks, 500 on database failure, what the handler awaits |
| `parse.test.ts`, `server/webhook-post.test.ts` | Updated for the new lists and the new database functions |
| `docs/whatsapp-webhook-parser.md` | The two new lists |

`server/routes.ts` is unchanged (the route still calls `handleWhatsAppWebhook(request)`).

## 3. How to run / test locally

```
pnpm --filter @pakka/backend exec vitest run src/channels src/server   # this PR's tests
pnpm typecheck && pnpm lint && pnpm test && pnpm db:test                # everything
```

## 4. Decisions made

- **`set_template_status` is called only after an ownership check** (tenant plus Meta's template id), because the SQL
  function filters by Meta's id alone. Shaaz: if you would rather the function took the tenant, say so; this check
  then becomes a no-op.
- **Account events decide the business from the connection, not the payload:** a WhatsApp account claimed by two
  businesses is ignored (logged as unknown), never guessed.
- **Quality updates:** Meta's payload field names are unconfirmed (the connection docs say so too). Only plain
  identifiers are kept, and anything else becomes `unknown`.

## 5. For Dev 2 (Shaaz)

- No env var, migration or Inngest change. `routes.ts` is untouched.
- The handler now calls your `set_template_status` through the service role, after the ownership check above.
- `whatsapp_connections.messaging_limit` / `quality_rating` are now kept up to date from Meta's events (they existed
  since 0003 and were never written).

## 6. For Dev 3 (Dhatri)

- `whatsapp_connections_public` already exposes `quality_rating` and `messaging_limit`. They now change when Meta says
  so. Values are Meta's words (for example `TIER_1K`, `GREEN`), so show them as text.
- A template's `status` moves from `pending` to `approved` / `rejected` (with `rejection_reason`) without a refresh by
  anyone; the Templates screen can rely on Realtime or a reload.

## 7. Follow-ups

- **Known limitation: out-of-order events.** `set_template_status` and the health update have no timestamp or
  ordering guard, so a late, repeated `PENDING` after `APPROVED` (or an old quality event) can overwrite a newer
  value. A real fix needs a timestamp from the payload (the parser has never seen a real one) or a guard in
  `set_template_status` (Shaaz's SQL).
- Unknown templates, other businesses' templates and accounts no connection of ours has are counted in the summary log
  line (`templates_not_ours`, `accounts_unmatched`), with no line per event. There is no cap on events per request.
- The account lookup does not look at the connection's status: a disconnected number on the same account makes a
  quality update `ambiguous`. That is intended for now.

- **Real captured Meta payloads (scrubbed) get added as fixtures** after staging receives real messages. Until then
  every fixture is synthetic, and the field names of quality and account updates are the documented ones.
- Echoes, history and app-state events (coexistence) are still ignored and only counted by name.
- If a business ever has several numbers on one WhatsApp account, a quality update cannot be attributed to a number
  until Meta's payload is seen to carry the number's id.
