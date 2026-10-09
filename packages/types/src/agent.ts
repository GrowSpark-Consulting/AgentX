import { z } from "zod";

// Core triggers the decide step knows about. A pack's own handoffTriggers list is validated
// separately (see pack.ts) so pack-specific triggers still parse.
export const HandoffTrigger = z.enum([
  "asked_human",
  "complaint",
  "negotiation",
  "hot_lead",
  "kb_gap",
  "stuck",
  "credits_exhausted",
  "opt_out",
]);
export type HandoffTrigger = z.infer<typeof HandoffTrigger>;

// Step 4 output (LLM). `fields` is generic here; the pipeline checks its keys against the schema
// generated from the pack.
export const Extraction = z.object({
  language: z.enum(["en", "ta", "ta-en", "ml", "hi", "other"]),
  intent: z.enum([
    "greeting",
    "question",
    "give_details",
    "book",
    "reschedule",
    "cancel",
    "talk_to_human",
    "complaint",
    "price_negotiation",
    "off_topic",
    "opt_out",
  ]),
  fields: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
  question: z.string().nullable(),
  preferredTime: z.string().nullable(),
  sentiment: z.enum(["positive", "neutral", "negative", "angry"]),
  asksIfHuman: z.boolean(),
  confidence: z.number().min(0).max(1),
});
export type Extraction = z.infer<typeof Extraction>;

// Step 5 output (plain code): exactly one action.
export const NextAction = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("answer_and_ask"),
    question: z.string(),
    askFields: z.array(z.string()).max(2),
  }),
  z.object({ kind: z.literal("ask_fields"), askFields: z.array(z.string()).min(1) }),
  z.object({
    kind: z.literal("offer_slots"),
    serviceId: z.string(),
    window: z.string().optional(),
  }),
  z.object({ kind: z.literal("confirm_booking"), slotId: z.string() }),
  z.object({ kind: z.literal("reschedule"), bookingId: z.string() }),
  z.object({ kind: z.literal("cancel"), bookingId: z.string() }),
  z.object({ kind: z.literal("handoff"), trigger: HandoffTrigger }),
  z.object({ kind: z.literal("decline_off_topic") }),
  z.object({ kind: z.literal("close_disqualified"), reason: z.string() }),
  z.object({ kind: z.literal("opt_out_ack") }),
]);
export type NextAction = z.infer<typeof NextAction>;
