import { inngest } from "../../inngest/client";
import { serverEnv } from "../../lib/env";
import { AppError } from "../../lib/errors";
import { stripUnsafeCharacters } from "../../lib/text";
import { applyMessageStatus, findConnections, storeInboundMessage, WebhookDbError, type ConnectionRow, type StoreInboundArgs } from "./inbound-db";
import { parseWebhook, type ParsedMessage } from "./parse";
import { verifySignature } from "./signature";

// POST /api/webhooks/whatsapp: Meta delivering messages and delivery statuses (docs/handover.md, "Message
// pipeline" and module 10, "Webhooks"). Order matters:
//   1. the signature, over the exact bytes received, before anything in the body is read or trusted;
//   2. the business, only from whatsapp_connections by phone number id (never from the payload);
//   3. store each message (idempotent on the wamid) and queue whatsapp/message.received with ids only.
// The answer is 200 once every item is stored and queued. A database or Inngest failure answers 500 so
// Meta retries; the dedupe makes the retry safe. Logs hold counts only: no numbers, names, text, message
// ids or secrets, and no database error text (it can contain values).
//
// Only META_APP_SECRET is verified here, so only connections that use our Meta app are served: the
// methods listed below. A manual_byo connection signs with the client's own app secret, and a method
// we have not listed is not trusted by default; both are treated as an unknown number.

const SIGNATURE_FORMAT = /^sha256=[0-9a-fA-F]{64}$/;
/** Connection methods whose webhooks come from our own Meta app, signed with META_APP_SECRET. */
const PLATFORM_SIGNED = new Set(["embedded_signup", "assisted", "platform"]);
const TAG = "[whatsapp-webhook]";

const unauthenticated = () => new AppError("unauthenticated", "The request could not be verified.");

/** Customer text with NUL, control characters and lone surrogates removed: one of them would fail the insert, and Meta would resend the batch. */
const clean = (text: string | undefined) => (text === undefined ? undefined : stripUnsafeCharacters(text));

function toStorable(parsed: ParsedMessage): Pick<StoreInboundArgs, "kind" | "body" | "media" | "meta"> {
  const msg = { ...parsed, text: clean(parsed.text) };
  switch (msg.type) {
    case "unsupported":
      return { kind: "unsupported", body: null, meta: { unsupportedType: msg.unsupportedType ?? "unknown" } };
    case "interactive":
      return { kind: "interactive", body: msg.text ?? null, meta: { buttonId: clean(msg.buttonId) } };
    case "image":
    case "audio":
    case "document":
      return { kind: msg.type, body: msg.text ?? null, media: msg.media && { id: stripUnsafeCharacters(msg.media.id), mime: stripUnsafeCharacters(msg.media.mime) }, meta: {} };
    default:
      return { kind: msg.type, body: msg.text ?? null, meta: {} };
  }
}

export async function handleWhatsAppWebhook(request: Request): Promise<Response> {
  const signature = request.headers.get("x-hub-signature-256");
  if (signature === null || !SIGNATURE_FORMAT.test(signature)) throw unauthenticated();

  let appSecret: string | undefined;
  try {
    appSecret = serverEnv().META_APP_SECRET;
  } catch {
    console.error(`${TAG} environment invalid`);
    return Response.json({ error: { code: "internal", message: "Something went wrong on our side." } }, { status: 500 });
  }
  if (!appSecret) {
    console.error(`${TAG} META_APP_SECRET is not set`);
    return Response.json({ error: { code: "internal", message: "Something went wrong on our side." } }, { status: 500 });
  }

  // The body is read once, as bytes, and verified before it is decoded.
  const raw = new Uint8Array(await request.arrayBuffer());
  if (!verifySignature(raw, signature, appSecret)) throw unauthenticated();

  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    console.log(`${TAG} malformed=1`);
    return new Response("ok", { status: 200 });
  }
  const parsed = parseWebhook(payload);

  const counts = { stored: 0, duplicates: 0, statuses: 0, unknown: 0, inactive: 0, failed: 0 };
  const errorCodes = new Set<string>();
  const fail = (err: unknown) => {
    counts.failed++;
    errorCodes.add(err instanceof WebhookDbError ? err.code : "other");
  };

  let connections = new Map<string, ConnectionRow>();
  try {
    const ids = [...new Set([...parsed.messages, ...parsed.statuses].map((item) => item.phoneNumberId))];
    connections = new Map((await findConnections(ids)).map((c) => [c.phoneNumberId, c]));
  } catch (err) {
    fail(err);
  }

  // Which connection may act on an item: signed by our app, for this account, and active.
  const connectionFor = (item: { phoneNumberId: string; wabaId: string }): ConnectionRow | null => {
    const connection = connections.get(item.phoneNumberId);
    if (!connection || !PLATFORM_SIGNED.has(connection.method) || connection.wabaId !== item.wabaId) {
      counts.unknown++;
      return null;
    }
    if (connection.status !== "active") {
      counts.inactive++;
      return null;
    }
    return connection;
  };

  if (counts.failed === 0) {
    // One at a time, in the order Meta sent them. One failing item does not stop the others.
    for (const message of parsed.messages) {
      const connection = connectionFor(message);
      if (!connection) continue;
      try {
        // The tenant and channel come from the connection row, never from the message.
        const stored = await storeInboundMessage({
          tenantId: connection.tenantId,
          channelId: connection.channelId,
          phone: message.from,
          contactName: clean(message.contactName),
          providerMsgId: message.providerMsgId,
          sentAt: message.timestamp,
          ...toStorable(message),
        });
        if (stored.inserted) counts.stored++;
        else counts.duplicates++;
        // Sent for a replay too: it may be Meta's retry after the first send failed. The id makes
        // Inngest drop a true duplicate.
        await inngest.send({
          id: `message_received:${stored.messageId}`,
          name: "whatsapp/message.received",
          data: { tenantId: connection.tenantId, conversationId: stored.conversationId, messageId: stored.messageId },
        });
      } catch (err) {
        fail(err);
      }
    }
    for (const status of parsed.statuses) {
      const connection = connectionFor(status);
      if (!connection) continue;
      try {
        await applyMessageStatus({ tenantId: connection.tenantId, providerMsgId: status.providerMsgId, status: status.status });
        counts.statuses++;
      } catch (err) {
        fail(err);
      }
    }
  }

  const codes = errorCodes.size > 0 ? ` error_codes=${[...errorCodes].join(",")}` : "";
  console.log(
    `${TAG} messages=${parsed.messages.length} stored=${counts.stored} duplicates=${counts.duplicates} statuses=${counts.statuses} ` +
      `templates=${parsed.templateStatuses.length} ignored=${parsed.ignored.length} unknown=${counts.unknown} inactive=${counts.inactive} failed=${counts.failed}${codes}`,
  );

  if (counts.failed > 0) {
    return Response.json({ error: { code: "internal", message: "Something went wrong on our side." } }, { status: 500 });
  }
  return new Response("ok", { status: 200 });
}
