import { z } from "zod";

/** Sent by the WhatsApp webhook for every stored inbound message (channels/whatsapp/inbound.ts), replays included. */
export const MESSAGE_RECEIVED_EVENT = "whatsapp/message.received";

/** Ids only (docs/contracts.md, section 5): never a phone number, a name or message text. */
export const MessageReceived = z.object({ tenantId: z.guid(), conversationId: z.guid(), messageId: z.guid() });
export type MessageReceived = z.infer<typeof MessageReceived>;

/** The audit action that says a customer message has been answered: written by the reply step, read here. */
export const ANSWERED_ACTION = "message.answered";
