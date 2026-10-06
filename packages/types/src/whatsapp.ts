import { z } from "zod";

// E.164 with a leading "+". Meta sends bare digits; the WhatsApp parser in backend normalises them
// before building an InboundMessage.
export const E164 = z.string().regex(/^\+[1-9]\d{7,14}$/, "must be E.164, e.g. +919812345621");

export const InboundMessageType = z.enum([
  "text",
  "interactive",
  "image",
  "audio",
  "location",
  "document",
]);

export const InboundMessage = z.object({
  tenantId: z.uuid(),
  channelId: z.uuid(),
  providerMsgId: z.string().min(1),
  from: E164,
  contactName: z.string().optional(),
  type: InboundMessageType,
  text: z.string().optional(),
  buttonId: z.string().optional(),
  media: z.object({ id: z.string().min(1), mime: z.string().min(1) }).optional(),
  timestamp: z.iso.datetime({ offset: true }),
  routeCode: z.string().optional(), // DEMO-/TRIAL- code on the shared number
});
export type InboundMessage = z.infer<typeof InboundMessage>;

export const DeliveryStatus = z.enum(["sent", "delivered", "read", "failed"]);

export const StatusUpdate = z.object({
  providerMsgId: z.string().min(1),
  status: DeliveryStatus,
  timestamp: z.iso.datetime({ offset: true }),
  recipient: E164.optional(),
  error: z.object({ code: z.number().int(), message: z.string() }).optional(),
});
export type StatusUpdate = z.infer<typeof StatusUpdate>;

export const SendResult = z.object({
  providerMsgId: z.string().min(1),
});
export type SendResult = z.infer<typeof SendResult>;
