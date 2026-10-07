import { z } from "zod";
import { supabaseAdmin } from "../../lib/supabase-admin";

// The webhook route's database access: one lookup and two functions from migration 0013. Service role,
// server only. The lookup by phone number id is the one query that cannot filter by tenant_id (it is how
// the tenant is found); every later call is given the tenant from that verified connection row.

/** A database failure. Carries the Postgres error code only: its message can hold phone numbers or text. */
export class WebhookDbError extends Error {
  constructor(operation: string, readonly code: string) {
    super(`${operation} failed`);
    this.name = "WebhookDbError";
  }
}

export type ConnectionRow = {
  id: string;
  tenantId: string;
  channelId: string;
  phoneNumberId: string;
  wabaId: string;
  method: string;
  status: string;
};

const ConnectionRows = z.array(
  z.object({
    id: z.string(),
    tenant_id: z.string(),
    channel_id: z.string(),
    phone_number_id: z.string(),
    waba_id: z.string(),
    method: z.string(),
    status: z.string(),
  }),
);

/** The connections for these phone number ids. Reads no secret columns. */
export async function findConnections(phoneNumberIds: string[]): Promise<ConnectionRow[]> {
  if (phoneNumberIds.length === 0) return [];
  const { data, error } = await supabaseAdmin()
    .from("whatsapp_connections")
    .select("id, tenant_id, channel_id, phone_number_id, waba_id, method, status")
    .in("phone_number_id", phoneNumberIds);
  if (error) throw new WebhookDbError("connection lookup", error.code);
  return ConnectionRows.parse(data).map((r) => ({
    id: r.id,
    tenantId: r.tenant_id,
    channelId: r.channel_id,
    phoneNumberId: r.phone_number_id,
    wabaId: r.waba_id,
    method: r.method,
    status: r.status,
  }));
}

export type StoreInboundArgs = {
  tenantId: string;
  channelId: string;
  phone: string;
  contactName?: string;
  providerMsgId: string;
  kind: "text" | "interactive" | "image" | "audio" | "location" | "document" | "unsupported";
  body: string | null;
  media?: { id: string; mime: string };
  meta: Record<string, unknown>;
  sentAt: string;
};

const StoreResult = z.array(z.object({ conversation_id: z.string(), message_id: z.string(), inserted: z.boolean() })).min(1);

/** Contact, open conversation and message in one transaction. `inserted` is false for a replay. */
export async function storeInboundMessage(args: StoreInboundArgs): Promise<{ conversationId: string; messageId: string; inserted: boolean }> {
  const { data, error } = await supabaseAdmin().rpc("store_inbound_message", {
    p_tenant_id: args.tenantId,
    p_channel_id: args.channelId,
    p_phone: args.phone,
    p_name: args.contactName ?? null,
    p_provider_msg_id: args.providerMsgId,
    p_kind: args.kind,
    p_body: args.body,
    p_media: args.media ?? null,
    p_meta: args.meta,
    p_sent_at: args.sentAt,
  });
  if (error) throw new WebhookDbError("store_inbound_message", error.code);
  const row = StoreResult.parse(data)[0];
  return { conversationId: row.conversation_id, messageId: row.message_id, inserted: row.inserted };
}

/** A delivery status for one business's outbound message. True when a row changed. */
export async function applyMessageStatus(args: { tenantId: string; providerMsgId: string; status: string }): Promise<boolean> {
  const { data, error } = await supabaseAdmin().rpc("apply_message_status", {
    p_tenant_id: args.tenantId,
    p_provider_msg_id: args.providerMsgId,
    p_status: args.status,
  });
  if (error) throw new WebhookDbError("apply_message_status", error.code);
  return z.boolean().parse(data);
}
