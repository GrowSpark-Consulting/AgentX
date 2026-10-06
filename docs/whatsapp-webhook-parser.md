# WhatsApp webhook parser

Owner: Dev 1. Written for Dev 2 (who builds the webhook route and reads the results) and Dev 3.
Related: [handover.md](handover.md) (module 1 and module 10, "Webhooks") · [contracts.md](contracts.md) ·
[shared-types.md](shared-types.md) · [encryption-and-env.md](encryption-and-env.md)

## 1. What it is

`parseWebhook(body)` in `backend/src/channels/whatsapp/parse.ts` turns a WhatsApp Cloud API webhook body into
plain lists the route can act on. Import it as `@pakka/backend/channels/whatsapp/parse`. It sits beside three
small helpers (all with tests):

| File | Gives you |
|---|---|
| `signature.ts` | `verifySignature(rawBody, header, appSecret)`: true or false, never throws |
| `routing.ts` | `extractUnverifiedRouting(rawBody)`: WABA id and phone number id, to find the connection |
| `phone.ts` | `normalizeE164`, `maskPhone` |
| `parse.ts` | `parseWebhook(body)` |

## 2. Input and result

It takes a body that is **already verified** (signature checked on the raw bytes) and **already JSON-parsed**.
It never throws. It returns four lists:

```ts
type Routing = { phoneNumberId: string; wabaId: string };

type ParsedMessage = Omit<InboundMessage, "tenantId" | "channelId" | "type"> & Routing & {
  type: InboundMessage["type"] | "unsupported";   // "unsupported" is not in @pakka/types
  unsupportedType?: string;                        // Meta's own word, e.g. "sticker"
};                                                 // providerMsgId is the wamid

type ParsedStatus = Omit<StatusUpdate, "error"> & Routing & {
  error?: { code: number; title?: string; message: string };
};

type TemplateStatusUpdate = {                      // a Zod schema in parse.ts
  wabaId: string; metaTemplateId: string; name: string;
  language?: string; timestamp?: string;           // never filled (see section 6)
  event: string;                                   // Meta's event name, unchanged
  reason?: string;                                 // Meta's reason, may be "NONE"
};

type IgnoredItem = {
  field: string;
  reason: "unsupported_field" | "unsupported_status" | "invalid_item" | "malformed_payload";
  wabaId?: string;
  ref?: string;                                    // a wamid, only on invalid_item
};

type ParseResult = { messages: ParsedMessage[]; statuses: ParsedStatus[];
                     templateStatuses: TemplateStatusUpdate[]; ignored: IgnoredItem[] };
```

Numbers come out as E.164 with a leading "+". Unix-second timestamps come out as ISO strings. Text, button and
list replies, image, audio, document and location are mapped. Anything else (reaction, sticker, video, a text
with no body, an image with no MIME type) becomes `type: "unsupported"` and keeps its wamid.

## 3. For Dev 2: how to call it

**Suggested order for the route** (the route does not exist yet, so this is a suggestion, not a contract):

1. Read the raw bytes (`await req.arrayBuffer()`). Keep them: the signature is over these exact bytes.
2. `extractUnverifiedRouting(raw)` to find the connection and its app secret (`META_APP_SECRET`, or a
   `manual_byo` connection's decrypted `app_secret_enc`). **Trust nothing from this step** until step 3 passes.
3. `verifySignature(raw, req.headers.get("x-hub-signature-256"), secret)`. If false, answer an error and stop.
4. `JSON.parse` the same bytes, then `parseWebhook(body)`.
5. Act on the four lists (below), then answer 200 quickly so Meta does not retry.

| List | What to do |
|---|---|
| `messages` | Look up the connection from `phoneNumberId`, add `tenantId` and `channelId`, then validate with `InboundMessage` (not for `unsupported`). The **wamid (`providerMsgId`) is the dedupe key**: `messages.provider_msg_id` is unique, so a repeat changes nothing. |
| `messages` with `type: "unsupported"` | You decide how to store them (for example a placeholder body). The parser keeps the wamid so the customer's message is not lost. |
| `statuses` | Update `messages.delivery_status` by `providerMsgId`. The **dedupe key is `providerMsgId` plus `status`**, because one message gets several statuses. On `failed`, `error` has the code, title and message. |
| `templateStatuses` | Call `set_template_status(metaTemplateId, event, reason)` and pass Meta's **raw `event`**. The SQL maps it and ignores events it does not track, so you do not map anything. |
| `ignored` | Log only `reason`, `field` and `wabaId`, or counts. **Never log contents**: the parser puts no numbers, names or text in these items, and the route should not add them. Mask any phone number you log with `maskPhone`. |

Parsing is safe to repeat: the same body twice gives the same lists, so de-duplication belongs to the database
keys above, not to the parser.

## 4. For Dev 3

Nothing in the UI depends on the parser yet. Screens read template status from `whatsapp_templates` and
messages from `messages`, never from the parser. What may affect you later is the two parser-local types in section 8.

## 5. What the parser never does

- No signature check (that is `verifySignature`, on the raw bytes).
- No database, no network, no Inngest.
- No logging, and no secrets or message text in what it returns for `ignored`.
- No de-duplication.
- It never throws. Bad input gives an empty or partial result, plus `ignored` items.

## 6. Unconfirmed Meta shapes

The fixtures in `backend/src/channels/whatsapp/__fixtures__/` are **synthetic**: written by hand from Meta's
webhook reference with fake numbers, not captured from Meta. Re-check them against a live webhook when the
Meta app is available.

| Shape | How the parser treats it |
|---|---|
| Template status `language` and `timestamp` field names | Never read. The fields stay optional and empty. |
| Interactive replies (`button_reply` / `list_reply` with `id` and `title`) | Assumed from the docs. A different shape is kept as `unsupported`. |
| Coexistence echoes (`smb_message_echoes`) | Not parsed. Ignored as `unsupported_field`, shape not guessed. |
| `message_template_id` as a number or a string | Both accepted. |
| The signature header format `sha256=<hex>` | Confirmed in Meta's documentation (Webhooks, payload signature), but not yet seen on a live webhook. `verifySignature` already follows it. |

## 7. Limits

- **Large template ids.** Meta calls the id an integer. One above 2^53 is rounded by `JSON.parse` before the
  parser sees it, so the parser rejects it as `invalid_item` rather than pass on a wrong id. Reading it from the
  raw bytes is a later task.
- **Echoes are not handled.** The handover needs them before a coexistence number goes live (the owner's own
  messages switch the conversation to human mode).
- Other account fields (`phone_number_quality_update`, `account_update`, `history`, `smb_app_state_sync`) are
  ignored, not parsed.

## 8. Open items (not blocking)

- `TemplateStatusUpdate` and the `"unsupported"` type are parser-local; to be agreed with Dev 2 and Dev 3
  before moving to `@pakka/types`.

**What each developer should do:**

| | Do |
|---|---|
| Dev 2 | Build the route with the order in section 3. Decide how `unsupported` messages are stored. Confirm or change the `TemplateStatusUpdate` shape. |
| Dev 3 | Check that no screen needs these two types. Review them before they move to `@pakka/types`. |
| Dev 1 | The GET verification, the raw-byte reading in the route, echo handling, and moving the types once agreed. |

## 9. Status

Done: signature check, phone helpers and unverified routing (3a); the parser with 10 synthetic fixtures and 72
tests (3b). **Next:** the GET verification, then the route. `ChannelAdapter` send methods are separate work.
