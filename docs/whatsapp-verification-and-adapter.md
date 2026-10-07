# WhatsApp webhook verification and adapter

Owner: Dev 1. Written for Dev 2 and Dev 3.
Related: [whatsapp-webhook-parser.md](whatsapp-webhook-parser.md) · [encryption-and-env.md](encryption-and-env.md) ·
[contracts.md](contracts.md) · [environments.md](environments.md)

# Part 1: Webhook GET verification

## 1.1 What Meta calls and what we answer

Meta checks a callback URL with `GET /api/webhooks/whatsapp?hub.mode=...&hub.verify_token=...&hub.challenge=...`.
If the mode is `subscribe` and the token is ours, we answer **200 with the challenge as plain text** and nothing
else. Every other case is **403 with an empty body**. The code is
`backend/src/channels/whatsapp/verify-challenge.ts`; the API service serves it at
`/api/webhooks/whatsapp` (`backend/src/server/routes.ts`), `GET` for the check and `POST` for deliveries
(`channels/whatsapp/inbound.ts`, see `docs/task-notes/2026-10-08-feat-agent-webhook-post.md`); other methods get a 405.

## 1.2 The token and the setup

| | |
|---|---|
| Variable | `META_WEBHOOK_VERIFY_TOKEN`, one platform-wide value for our Meta app, read through `serverEnv()` |
| Staging callback URL | `https://<staging API host>/api/webhooks/whatsapp`: the Railway domain, or `https://api-staging.pakkaagent.in/api/webhooks/whatsapp` once that DNS points at Railway |
| Railway (staging env) | **Dev 2** owns the Railway environment ([environments.md](environments.md)) and sets `META_WEBHOOK_VERIFY_TOKEN` there |
| Meta app and DNS | **Raja** sets the webhook callback URL and the same verify token in the Meta app, and adds the DNS (his Day 1 list) |

The API host comes from [environments.md](environments.md). **Both setups must happen before Meta can verify
the callback**, and neither is confirmed yet. The values must match: the token in Railway and the token in the
Meta app. **Do not subscribe the app to the `messages` field until the POST route is merged**, or Meta's
deliveries will get errors. The callback check only needs the GET.

## 1.3 Behaviour worth knowing

- The token is compared in constant time (SHA-256 digests, then `timingSafeEqual`), so tokens of different
  lengths never throw.
- An empty or missing configured token always refuses, even if the request token is also empty.
- The challenge must be 1 to 256 printable ASCII characters. A repeated parameter counts as missing.
- Nothing is logged except one fixed line, `webhook verification: environment invalid`, when `serverEnv()`
  throws (the answer is still 403). The token and the challenge are never logged or returned.
- Other methods (PUT, PATCH, DELETE) answer 405 with `allow: GET, POST`; that is **unconfirmed** until seen on
  staging. The POST handler verifies `META_APP_SECRET` only; `manual_byo` signatures are a follow-up.

**Open item:** clients on `manual_byo` set their own verify token in their own Meta app, which will not match
ours. A decision for Raja before `manual_byo` goes live.

# Part 2: WhatsApp adapter (`sendText` and `markRead`)

## 2.1 What it is

The send side of module 1, in `backend/src/channels/whatsapp/adapter.ts`, with the error mapping in
`meta-errors.ts`. It calls Meta's Graph API at `META_GRAPH_API_VERSION` (default `v26.0`) on
`POST /{phone_number_id}/messages`, through an injected `fetch`. The tests use no network.

```ts
type SendConnection = { tenantId: string; connectionId: string; phoneNumberId: string; tokenEnc: string }; // server-only
type AdapterDeps = { fetch?: typeof fetch; timeoutMs?: number;       // default 10 000
                     env?: Pick<ServerEnv, "ENCRYPTION_KEY" | "META_GRAPH_API_VERSION"> };  // default serverEnv()
type AdapterError = { code: ErrorCode; retryable: boolean; outcomeUnknown: boolean; message: string;
                      meta?: { code?: number; subcode?: number; httpStatus?: number } };
type AdapterResult<T> = { ok: true; value: T } | { ok: false; error: AdapterError };

sendText(connection, to, body, deps?): Promise<AdapterResult<SendResult>>        // SendResult = { providerMsgId }
markRead(connection, wamid, deps?):    Promise<AdapterResult<{ success: true }>>
```

Both return a result and never throw. `to` is normalised to E.164 and sent with its `+` (Meta supports it and
recommends it). The text must be 1 to 4096 characters. A bad number, text, phone number id or wamid gives
`validation_failed` before any network call.

## 2.2 For Dev 2

**How it plugs in.** `notify.send` asks a `SenderFactory` (registered with `registerSender`, see
`backend/src/notify/sender.ts`) for a `MessageSender` bound to one connection. `MessageSender` has `sendText`
and `sendTemplate`, and `notify.send` expects it to **throw** on failure. So a later wrapper must load the
connection, call this adapter, and throw on `ok: false`. Not built yet: the wrapper, `sendTemplate`, the
connection loader and `registerSender` at startup. `notify.send` already checks the 24-hour window and picks
free text or a template; the adapter does not.

**Errors.** The Meta code wins; the HTTP status is only the fallback. Only existing codes are used.

| Meta | Our code | `retryable` |
|---|---|---|
| 131047 (24-hour window closed) | `outside_window` | no |
| 4, 80007, 130429, 131048, 131056; HTTP 429 | `rate_limited` | yes |
| 0, 3, 10, 190, 200 to 299, 131005, 133010; HTTP 401 | `whatsapp_not_connected` | no |
| 100, 131008, 131009, 131021, 131026, 132000, 132012 | `validation_failed` | no |
| 1, 2, 131000, 131016, 135000; HTTP 5xx | `upstream_failed` | yes |
| 131042, 131045, 368, 131050, 131051, 132001, 132015, 132016 | `upstream_failed` | no |
| Anything else | `upstream_failed` | no |

`outcomeUnknown: true` means the message may have gone out: a timeout, a network failure, or a 200 answer that
could not be read. Timeout and network failure are also `retryable: true`. Error messages are fixed strings;
Meta's own text is never passed on, and `meta` holds integers only.

**Two open questions (sent to Shaaz):**
1. `notify.send` turns every sender failure into a generic `upstream_failed` and refunds. Can it pass the error
   code and the `retryable` flag through, so `outside_window`, `rate_limited` and a broken token are not lost?
2. A timeout may mean Meta accepted the message, yet `notify.send` refunds when the sender throws. Refund, or hold
   for reconciliation? (To be agreed with Raja too.)

## 2.3 Token handling

The tenant's token is decrypted **per call** with the `token_enc` context
(`whatsapp_connections:token_enc:<tenant_id>:<connection_id>`, see [encryption-and-env.md](encryption-and-env.md)).
It goes only into the `Authorization` header and is never stored, logged, or put in a result or an error. A
tampered, wrong-key or copied `token_enc` gives `whatsapp_not_connected` without calling fetch; a missing
`ENCRYPTION_KEY` gives `internal`.

## 2.4 What it never does

- No retries: a retry after a timeout could send twice.
- No database reads or writes (so it cannot mark a connection `failed` when a token has expired).
- No 24-hour window check, and it does not call `notify.send`. Nothing else may send messages.
- No logging.

## 2.5 Unconfirmed Meta details

Not shown on the Meta pages read, so treated loosely: the error JSON shape (`error.code`, `error_subcode` and so
on), which HTTP status goes with which code, a `Retry-After` header, an idempotency key for sends (none is
used), and code `131030` (recipient not in the allowed list). `preview_url: false` is our choice, and Meta's
default is unconfirmed. Confirmed on Meta's pages: the endpoint and headers, `+` accepted in `to`, the success
shapes (`messages[0].id`, `{"success": true}`), and the error codes in the table above.

# What each developer should do

| | Do |
|---|---|
| Dev 1 | The `MessageSender` wrapper, `sendTemplate`, the connection loader, `registerSender` at startup, and marking a connection `failed` on an expired token. The POST webhook handler, added as `POST` on `/api/webhooks/whatsapp` in `backend/src/server/routes.ts` (the request's raw body is available for the signature check). |
| Dev 2 | Answer the two open questions above, then wire the registered factory into `notify.send`. Set `META_WEBHOOK_VERIFY_TOKEN` in the Railway staging environment (it must match the token Raja enters in the Meta app). |
| Dev 3 | Nothing in the UI depends on this yet. Screens may later see `outside_window`, `rate_limited`, `whatsapp_not_connected`, `validation_failed` and `upstream_failed`, but until question 1 is settled `notify.send` still answers a generic `upstream_failed`. |
| Raja | Set the webhook callback URL and the verify token in the Meta app, add the staging DNS, and decide the `manual_byo` verify-token question. Both his setup and Dev 2's Railway variable are needed before Meta can verify the callback. |

# Status

Done: the webhook GET verification and the adapter with `sendText` and `markRead`. Tests:
`verify-challenge.test.ts` (right and wrong mode, token and challenge, empty or missing token, different token
lengths, the log line, no token in any response), the route test `backend/src/server/webhook.test.ts`
(GET and POST only, other methods 405; 200 and 403; no CORS headers), `webhook-post.test.ts` (the POST route),
`adapter.test.ts` (exact request, token handling, errors, timeouts, validation, `markRead`) and
`meta-errors.test.ts` (the mapping table). The POST webhook route is built. **Next:** the `MessageSender` wrapper
and `sendTemplate`, then the connection loader and `registerSender`.
