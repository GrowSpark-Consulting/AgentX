import { describe, expect, it } from "vitest";
import { Extraction, HandoffTrigger, NextAction } from "./agent";

const extraction = {
  language: "ta-en",
  intent: "give_details",
  fields: { budget: "50-60L", adults: 2, decision_maker: true },
  question: null,
  preferredTime: "tomorrow evening",
  sentiment: "neutral",
  asksIfHuman: false,
  confidence: 0.82,
};

describe("Extraction", () => {
  it("accepts a valid extraction", () => {
    expect(Extraction.parse(extraction).fields.adults).toBe(2);
  });

  it("accepts string, number and boolean field values only", () => {
    expect(Extraction.safeParse({ ...extraction, fields: { a: [1] } }).success).toBe(false);
    expect(Extraction.safeParse({ ...extraction, fields: { a: null } }).success).toBe(false);
  });

  it.each([-0.1, 1.1])("rejects confidence %s", (confidence) => {
    expect(Extraction.safeParse({ ...extraction, confidence }).success).toBe(false);
  });

  it("rejects an unknown language, intent or sentiment", () => {
    expect(Extraction.safeParse({ ...extraction, language: "fr" }).success).toBe(false);
    expect(Extraction.safeParse({ ...extraction, intent: "chitchat" }).success).toBe(false);
    expect(Extraction.safeParse({ ...extraction, sentiment: "happy" }).success).toBe(false);
  });

  it("rejects a missing nullable field", () => {
    const { question: _question, ...rest } = extraction;
    expect(Extraction.safeParse(rest).success).toBe(false);
  });
});

describe("HandoffTrigger", () => {
  it("accepts the core triggers and rejects a pack-specific one", () => {
    expect(HandoffTrigger.parse("credits_exhausted")).toBe("credits_exhausted");
    expect(HandoffTrigger.parse("opt_out")).toBe("opt_out");
    expect(HandoffTrigger.safeParse("group_above_15").success).toBe(false);
  });
});

describe("NextAction", () => {
  it("discriminates on kind", () => {
    const action = NextAction.parse({ kind: "confirm_booking", slotId: "s1" });
    expect(action.kind === "confirm_booking" && action.slotId).toBe("s1");
  });

  it.each([
    { kind: "answer_and_ask", question: "price?", askFields: ["budget"] },
    { kind: "ask_fields", askFields: ["budget", "location"] },
    { kind: "offer_slots", serviceId: "svc1", window: "this week" },
    { kind: "reschedule", bookingId: "b1" },
    { kind: "cancel", bookingId: "b1" },
    { kind: "handoff", trigger: "hot_lead" },
    { kind: "decline_off_topic" },
    { kind: "close_disqualified", reason: "below minimum price" },
    { kind: "opt_out_ack" },
  ])("accepts $kind", (action) => {
    expect(NextAction.safeParse(action).success).toBe(true);
  });

  it("rejects more than two fields to ask while answering", () => {
    const action = { kind: "answer_and_ask", question: "q", askFields: ["a", "b", "c"] };
    expect(NextAction.safeParse(action).success).toBe(false);
  });

  it("rejects ask_fields with nothing to ask", () => {
    expect(NextAction.safeParse({ kind: "ask_fields", askFields: [] }).success).toBe(false);
  });

  it("rejects an unknown kind, a missing payload and an unknown handoff trigger", () => {
    expect(NextAction.safeParse({ kind: "refund" }).success).toBe(false);
    expect(NextAction.safeParse({ kind: "confirm_booking" }).success).toBe(false);
    expect(NextAction.safeParse({ kind: "handoff", trigger: "bored" }).success).toBe(false);
  });
});
