# Task notes: WhatsApp webhook POST route (inbound messages and delivery statuses)

Branch `feat/agent-webhook-post`. For Dev 2 (Shaaz) and Dev 3 (Dhatri).

## 1. What I built and why

Until now our server could answer Meta's check that the webhook address is ours, but it could not receive what
customers write. This PR adds that. When a customer sends a WhatsApp message, Meta posts it to our server. The
server now checks the post really came from Meta, finds which business the number belongs to, saves the contact,
the conversation and the message, and then raises a "message received" event so the assistant can work on it
later. It also records delivery ticks (sent, delivered, read, failed) on the messages we sent. Nothing replies
to the customer yet: that is the next piece (`process-message`).

Technical details:

- **Signature first.** The body is read once as raw bytes and checked against `X-Hub-Signature-256` (HMAC-SHA256,
  constant-time) with `META_APP_SECRET` before it is decoded or trusted. Missing or invalid gives 401 and nothing
  is stored.
- **The business comes only from `whatsapp_connections`**, looked up by the receiving `phone_number_id` (and the
  account id must match the connection's `waba_id`). Nothing in the payload names a tenant. Every later query
  carries that tenant.
- **Unknown or unusable numbers answer 200** (so Meta does not retry for days), store nothing, and log a count:
  an unknown number, a `manual_byo` connection (see section 4), or a connection that is not `active`
  (`pending`, `validating`, `failed`, `disconnected`).
- **Storing** is one SQL function, `store_inbound_message` (migration 0013): upsert the contact, find or create
  the one open conversation, insert the message (on conflict on `provider_msg_id` nothing happens), set
  `last_customer_msg_at`. A replay returns the stored ids.
- **Event.** `whatsapp/message.received` with `{ tenantId, conversationId, messageId }`, id
  `message_received:<messageId>`. No text, number or wamid.
- **Statuses** go through `apply_message_status`: outbound messages of that business only, never moving
  backwards (accepted, sent, delivered, read; a failure replaces accepted and sent).
- **Answers.** 200 when everything in the delivery is stored and queued; 500 if the database or Inngest fails
  (Meta retries, and the dedupe makes that safe). A signed body that is not JSON gets 200 (retrying cannot help).
- **Logs** are one line per delivery with counts only (`[whatsapp-webhook] messages= stored= duplicates= statuses=
  templates= ignored= unknown= inactive= failed=`, plus Postgres error codes if any). No numbers, names, text,
  message ids, secrets or database error text.

## 2. Files changed and what each does

| File | What it does |
|---|---|
| `supabase/migrations/0013_inbound_messages.sql` | `messages.kind` and `messages.meta`; closes older duplicate open conversations and adds the one-open-conversation index; `store_inbound_message` and `apply_message_status` (service role only) |
| `backend/src/channels/whatsapp/inbound.ts` | The handler: signature, parse, route to the connection, store, queue the event, answer |
| `backend/src/channels/whatsapp/inbound-db.ts` | The database calls: connection lookup and the two functions. Errors carry only the Postgres code |
| `backend/src/server/routes.ts` | Adds `POST` to the existing `/api/webhooks/whatsapp` entry (and its import). Nothing else in `server/` changed |
| `backend/src/server/webhook-post.test.ts` | Route tests with an in-memory fake of the database rules (signature, storing, replay, tenants, statuses, failures, logs, 1 MB limit) |
| `backend/src/server/webhook.test.ts` | The old "POST is 405" test now checks PUT, PATCH and DELETE give 405 with `allow: GET, POST` |
| `supabase/tests/inbound_messages.test.sql` | pgTAP: dedupe, tenant isolation, name rule, closed conversations, the index, kinds, status ranking, bad input |
| `docs/whatsapp-verification-and-adapter.md` | Status lines updated (POST now exists) |

## 3. How to run / test it locally

```
pnpm db:reset && pnpm db:test                                  # applies 0013 and runs the SQL tests (Docker)
pnpm --filter @pakka/backend exec vitest run src/server        # the route tests
pnpm typecheck && pnpm lint && pnpm test                       # everything
```

The route tests use no network and no database: the database boundary is replaced by an in-memory fake and
Inngest by a spy. The SQL rules the fake copies are tested for real in `inbound_messages.test.sql`.

Checked by hand on the local database (scripts not committed): (a) migration 0013 run over seeded duplicate open
conversations closed the older ones, kept the one with the latest activity open, deleted nothing and built the
index; (b) two sessions storing messages for the same new contact at the same time, for an existing contact with
no open conversation, and the same message delivered twice at once, each ended with one contact, one open
conversation and the right number of messages.

To try it against a real Meta app you need `META_APP_SECRET` in `backend/.env.local` and an `active` row in
`whatsapp_connections` for the receiving `phone_number_id`.

## 4. Decisions made

Need review by Dev 2 (Shaaz):

- **Migration 0013 is a schema change.** New nullable `messages.kind` (checked: text, interactive, image, audio,
  location, document, unsupported) and `messages.meta` (jsonb). A unique partial index on
  `conversations (tenant_id, contact_id, channel_id) where status = 'open'`, built after closing (never
  deleting) older duplicate open conversations, keeping the one with the latest activity. Renumber if 0013 is
  taken at merge time.
- **Conversation status values** are `open` and `closed`. `open` is the column default and what `notify_target`
  relies on; `closed` is new and nothing creates it yet. No check constraint is added (follow-up).
- **Event id is the message uuid** (`message_received:<messageId>`), not the wamid: wamids are commonly
  base64 and can embed the sender's number, which should not reach Inngest. It is still one-to-one with the wamid.
- **The event is sent again on a replay.** A replay may be Meta's retry after the first send failed. Inngest drops a
  true duplicate by id, but only within its dedupe window (about 24 hours).
- **`created_at` of an inbound message is Meta's timestamp**, capped at now, so a retry does not reorder the
  inbox and a wrong clock cannot stretch the 24-hour window.
- **`manual_byo` connections are treated as unknown in this PR** (200, nothing stored, a count in the log): their
  messages are signed with the client's own app secret, which is not verified here yet.
- **A missing `META_APP_SECRET` answers 500**, not 401, so a misconfigured deployment is visible. A missing or
  malformed signature header is 401 before that is checked.
- **Contact names are only filled in, never overwritten**, so a name a person edited in the dashboard stays.

Need review by Dev 3 (Dhatri): the `kind` and `meta` shapes in section 6, and showing `unsupported` messages
(they have no body).

## 5. For Dev 2 (Shaaz)

- **Migrate.** Apply 0013 (`pnpm db:reset` locally). On a database that already has two open conversations for
  one contact and channel, the older one is closed so the index can be built. Closed conversations keep their
  messages.
- **Set `META_APP_SECRET` on Railway** before Meta is pointed at the server. Without it every POST answers 500.
  `META_WEBHOOK_VERIFY_TOKEN` is already needed for the GET check.
- **No Inngest function consumes `whatsapp/message.received` yet.** This PR only sends it, so no resync is
  needed now, but the events will pile up unhandled until `process-message` exists. When it is built it needs a
  resync after deploy.
- **`process-message` must skip a message it has already processed.** The event can be sent more than once for
  one message (a replay, or a retry more than about 24 hours later), and Inngest only drops duplicates within its
  window. Make the first step check whether the message was already handled.
- **After deploy**, the Meta app can be pointed at the Railway URL (`/api/webhooks/whatsapp`) and subscribed to
  the `messages` field. Meta's deliveries will then be stored.
- `backend/src/server/` has one change: `POST` added to the existing webhook entry in `routes.ts`, as agreed.
  The route is not `browser`, so there is no CORS, and it keeps the default 1 MB body limit.
- Logs from this route are counts only. If a delivery fails you will see `failed=` and the Postgres error codes
  in `error_codes=`, never the error text.
- A body can name more than one number. Each item is routed on its own; one failing item does not stop the others,
  and the whole delivery answers 500 so Meta retries (already-stored items are no-ops).

## 6. For Dev 3 (Dhatri)

The inbox can now see real inbound rows (Realtime already covers `messages` and `conversations`). What an
inbound `messages` row looks like:

- `direction = 'in'`, `sender = 'customer'`, `created_at` = the time Meta gave, `delivery_status` null.
- `kind`, `body`, `media`, `meta` by kind:

| `kind` | `body` | `media` | `meta` | What the inbox should show |
|---|---|---|---|---|
| `text` | the text | null | `{}` | the text |
| `interactive` | the title of the button or list row the customer chose | null | `{ "buttonId": "..." }` | the title (it is the customer's reply) |
| `image` | the caption, or null | `{ "id", "mime" }` | `{}` | an image placeholder plus the caption |
| `document` | the caption, or null | `{ "id", "mime" }` | `{}` | a file placeholder plus the caption |
| `audio` | null | `{ "id", "mime" }` | `{}` | a "voice message" placeholder (the assistant will ask the customer to type) |
| `location` | `"<lat>,<lng> <name> <address>"` | null | `{}` | the text, or a map link if you want one |
| `unsupported` | **null** | null | `{ "unsupportedType": "sticker" }` (Meta's own word) | "Message type not supported" with the type |

- Outbound rows and rows from before this change have `kind` and `meta` null.
- `delivery_status` on messages we sent moves through `accepted`, `sent`, `delivered`, `read` or `failed`, never
  backwards.
- One open conversation per contact and channel (`status = 'open'`). Nothing closes a conversation yet.

Do not assume:

- `media` holds Meta's media id and mime type only. The file is **not downloaded yet**, so there is no URL to
  show an image.
- A failed delivery's error code is not stored; only `delivery_status = 'failed'`.
- Nothing replies to the customer yet. A new message appears in the inbox with no assistant reply.
- Messages from the owner's own phone (coexistence echoes) are not handled yet.

## 7. Follow-ups / not done in this PR

- `process-message` (the Inngest function that consumes `whatsapp/message.received`) and the assistant's replies.
- `manual_byo` verification with the connection's `app_secret_enc`, bundled with the manual-connect route PR.
  Until then those connections are treated as unknown.
- Coexistence echoes (`smb_message_echoes`): store as `sender = 'staff'` and switch the conversation to human
  mode.
- Template-status events: call `set_template_status` (parsed already, logged only for now). Quality and
  account-update events: logged only.
- Consent: the consent notice on the first reply and STOP handling (the consent module, in the pipeline).
- Downloading image and document media to Supabase Storage.
- Storing the error code of a failed delivery.
- A check constraint on `conversations.status`.
- `routeCode` (DEMO-/TRIAL- codes on the shared number) and tenant routing for the shared demo number.
- Re-check the synthetic fixtures and the signature header against a live Meta webhook once the app is reachable.
