// 15 representative customer questions, in English and Tanglish (Tamil written in Latin letters, mixed
// with English), for regression checks once the assistant's knowledge base and reply pipeline exist.
//
// A DATASET ONLY. Nothing here retrieves, embeds or calls a model, and it holds no answers: the right
// answer depends on each business's own knowledge base, so a check built on this must compare what
// the assistant did with what that business's data supports, never with a fixed reply.
//
// `expectedHandling` is the route we expect, to be confirmed with Dev 1 when the pipeline's intents
// are agreed (docs/handover.md, message pipeline):
// - kb_answer: answer from the business's knowledge base; without relevant KB data, say so and offer a
//   person instead of guessing (answerableOnlyWithKb: true).
// - booking_flow: the booking and slot engine handles it (code decides, not the knowledge base).
// - handoff: needs a person whatever the knowledge base holds.
// - out_of_scope: nothing to do with the business; decline politely.

export type QueryCategory =
  | "price"
  | "availability"
  | "hours"
  | "location"
  | "booking"
  | "cancellation"
  | "refund"
  | "comparison"
  | "custom_request"
  | "follow_up"
  | "unknown";

export type ExpectedHandling = "kb_answer" | "booking_flow" | "handoff" | "out_of_scope";

export interface RegressionQuery {
  /** Stable id: tests and reports refer to it. Never reuse one for a different question. */
  id: string;
  category: QueryCategory;
  language: "english" | "tanglish";
  /** What the customer types, as they would type it. */
  query: string;
  /** The earlier customer message this one depends on (follow-ups only). */
  previous?: string;
  expectedIntent: QueryCategory;
  expectedHandling: ExpectedHandling;
  /** True when an answer is right only if the business's knowledge base covers it. */
  answerableOnlyWithKb: boolean;
  /** What a reviewer looks for, in words. Not an answer to compare against. */
  note: string;
}

export const TANGLISH_REGRESSION_QUERIES: readonly RegressionQuery[] = [
  {
    id: "rq-01-price",
    category: "price",
    language: "english",
    query: "What's the price for the basic package?",
    expectedIntent: "price",
    expectedHandling: "kb_answer",
    answerableOnlyWithKb: true,
    note: "Quotes only a price the business has listed; never invents one.",
  },
  {
    id: "rq-02-availability",
    category: "availability",
    language: "english",
    query: "Do you do home visits?",
    expectedIntent: "availability",
    expectedHandling: "kb_answer",
    answerableOnlyWithKb: true,
    note: "Whether the service is offered at all, not a time slot.",
  },
  {
    id: "rq-03-hours",
    category: "hours",
    language: "tanglish",
    query: "sunday open ah? evening evlo mani varaikum irupinga?",
    expectedIntent: "hours",
    expectedHandling: "kb_answer",
    answerableOnlyWithKb: true,
    note: "Two questions in one message: open on Sunday, and closing time.",
  },
  {
    id: "rq-04-location",
    category: "location",
    language: "tanglish",
    query: "office enga iruku? parking iruka?",
    expectedIntent: "location",
    expectedHandling: "kb_answer",
    answerableOnlyWithKb: true,
    note: "Address and parking come only from the business's own details.",
  },
  {
    id: "rq-05-booking",
    category: "booking",
    language: "english",
    query: "Can I book an appointment for Friday evening?",
    expectedIntent: "booking",
    expectedHandling: "booking_flow",
    answerableOnlyWithKb: false,
    note: "Real slots from the booking engine; no slot is promised from text alone.",
  },
  {
    id: "rq-06-cancellation",
    category: "cancellation",
    language: "english",
    query: "How do I cancel my booking?",
    expectedIntent: "cancellation",
    expectedHandling: "booking_flow",
    answerableOnlyWithKb: false,
    note: "Acts on the customer's own booking; asks which one if there are several.",
  },
  {
    id: "rq-07-refund",
    category: "refund",
    language: "english",
    query: "If I cancel, will I get my advance back?",
    expectedIntent: "refund",
    expectedHandling: "kb_answer",
    answerableOnlyWithKb: true,
    note: "States the business's refund policy only if one is written down.",
  },
  {
    id: "rq-08-comparison",
    category: "comparison",
    language: "tanglish",
    query: "indha rendu service la edhu better?",
    expectedIntent: "comparison",
    expectedHandling: "kb_answer",
    answerableOnlyWithKb: true,
    note: "Compares on listed facts (length, price, what's included); no made-up recommendation.",
  },
  {
    id: "rq-09-custom-request",
    category: "custom_request",
    language: "english",
    query: "Can you do a custom package for a group of 20 people?",
    expectedIntent: "custom_request",
    expectedHandling: "handoff",
    answerableOnlyWithKb: false,
    note: "A quote for something not listed goes to a person.",
  },
  {
    id: "rq-10-follow-up",
    category: "follow_up",
    language: "tanglish",
    previous: "What's the price for the basic package?",
    query: "adhula enna enna include aagum?",
    expectedIntent: "follow_up",
    expectedHandling: "kb_answer",
    answerableOnlyWithKb: true,
    note: "\"adhu\" refers to the basic package from the previous message.",
  },
  {
    id: "rq-11-tanglish-price",
    category: "price",
    language: "tanglish",
    query: "indha service oda price evlo?",
    expectedIntent: "price",
    expectedHandling: "kb_answer",
    answerableOnlyWithKb: true,
    note: "Same need as rq-01 in Tanglish; \"indha service\" may need the service named.",
  },
  {
    id: "rq-12-tanglish-availability",
    category: "availability",
    language: "tanglish",
    query: "tomorrow appointment available ah?",
    expectedIntent: "availability",
    expectedHandling: "booking_flow",
    answerableOnlyWithKb: false,
    note: "A time-slot question: answered from the booking engine, not the knowledge base.",
  },
  {
    id: "rq-13-tanglish-booking",
    category: "booking",
    language: "tanglish",
    query: "naalaiku saayangalam 5 mani ku oru slot book pannunga",
    expectedIntent: "booking",
    expectedHandling: "booking_flow",
    answerableOnlyWithKb: false,
    note: "Tomorrow, 5 pm: confirms only a slot the engine actually holds.",
  },
  {
    id: "rq-14-tanglish-cancellation",
    category: "cancellation",
    language: "tanglish",
    query: "en booking cancel pannanum, epdi pannradhu?",
    expectedIntent: "cancellation",
    expectedHandling: "booking_flow",
    answerableOnlyWithKb: false,
    note: "Same need as rq-06 in Tanglish.",
  },
  {
    id: "rq-15-unknown",
    category: "unknown",
    language: "tanglish",
    query: "naalaiku Chennai la mazhai varuma?",
    expectedIntent: "unknown",
    expectedHandling: "out_of_scope",
    answerableOnlyWithKb: false,
    note: "Weather: nothing to do with the business. Declines politely; never guesses.",
  },
];
