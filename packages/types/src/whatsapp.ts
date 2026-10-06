import { z } from "zod";

// E.164 with a leading "+". Meta sends bare digits; the WhatsApp parser in backend normalises them
// before building an InboundMessage.
const E164_PATTERN = /^\+[1-9]\d{7,14}$/;
export const E164 = z.string().regex(E164_PATTERN, "must be E.164, e.g. +919812345621");

/** E164 as a person types it into a form: trimmed, with an error written for them. */
export const PhoneInput = z
  .string()
  .trim()
  .regex(E164_PATTERN, "Enter the number with country code, like +919840012345");

export const InboundMessageType = z.enum([
  "text",
  "interactive",
  "image",
  "audio",
  "location",
  "document",
]);

export const InboundMessage = z.object({
  tenantId: z.guid(),
  channelId: z.guid(),
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

/** WhatsApp's limit for a text message body. */
export const WHATSAPP_TEXT_MAX = 4096;

export const SendTestMessageInput = z.object({
  to: PhoneInput,
  body: z
    .string()
    .trim()
    .min(1, "Write a message")
    .max(WHATSAPP_TEXT_MAX, `Keep it under ${WHATSAPP_TEXT_MAX} characters`),
});
export type SendTestMessageInput = z.infer<typeof SendTestMessageInput>;

export interface SendTestMessageResult {
  providerMessageId: string;
  status: "sent" | "queued";
}

// Templates. Names are versioned (`reminder_24h_v1`); a change is a new version, never an edit in
// place. English and Tamil versions; utility or marketing category (docs/handover.md, module 5 and 7).
export const TEMPLATE_CATEGORIES = ["utility", "marketing"] as const;
export const TEMPLATE_LANGUAGES = ["en", "ta"] as const;
/** Meta's limit for a template body. */
export const TEMPLATE_BODY_MAX = 1024;

/** The distinct `{{n}}` variables in a template body, sorted by number. */
export function templateVariables(body: string): number[] {
  const nums = [...body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
  return [...new Set(nums)].sort((a, b) => a - b);
}

export const CreateTemplateInput = z
  .object({
    name: z
      .string()
      .trim()
      .regex(
        /^[a-z][a-z0-9_]*_v[1-9]\d*$/,
        "Use lowercase letters, numbers and underscores, ending in a version like _v1",
      )
      .max(512),
    category: z.enum(TEMPLATE_CATEGORIES),
    language: z.enum(TEMPLATE_LANGUAGES),
    body: z
      .string()
      .trim()
      .min(1, "Write the message")
      .max(TEMPLATE_BODY_MAX, `Keep it under ${TEMPLATE_BODY_MAX} characters`),
    /** One sample value per variable, in order: examples[0] is {{1}}. */
    examples: z.array(z.string().trim().min(1, "Add a sample value")),
  })
  .superRefine((t, ctx) => {
    const vars = templateVariables(t.body);
    vars.forEach((n, i) => {
      if (n !== i + 1) {
        ctx.addIssue({ code: "custom", path: ["body"], message: "Number variables in order: {{1}}, {{2}}, …" });
      }
    });
    if (t.examples.length !== vars.length) {
      ctx.addIssue({ code: "custom", path: ["examples"], message: "Add one sample value for each variable" });
    }
  });
export type CreateTemplateInput = z.infer<typeof CreateTemplateInput>;

export interface CreateTemplateResult {
  name: string;
  language: string;
  status: "submitted" | "draft";
}
