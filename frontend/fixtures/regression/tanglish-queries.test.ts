import { describe, expect, it } from "vitest";
import { TANGLISH_REGRESSION_QUERIES as QUERIES } from "./tanglish-queries";

// Keeps the dataset usable as a regression set: complete, stable and free of baked-in answers.

describe("Tanglish regression queries", () => {
  it("has 15 queries with unique ids and unique wording", () => {
    expect(QUERIES).toHaveLength(15);
    expect(new Set(QUERIES.map((q) => q.id)).size).toBe(15);
    expect(new Set(QUERIES.map((q) => q.query.toLowerCase())).size).toBe(15);
  });

  it("covers every category, with Tanglish versions of price, availability, booking and cancellation", () => {
    expect(new Set(QUERIES.map((q) => q.category))).toEqual(
      new Set(["price", "availability", "hours", "location", "booking", "cancellation", "refund", "comparison", "custom_request", "follow_up", "unknown"]),
    );
    for (const category of ["price", "availability", "booking", "cancellation"] as const) {
      expect(QUERIES.some((q) => q.category === category && q.language === "tanglish"), category).toBe(true);
    }
  });

  it("keeps the expectations consistent", () => {
    for (const q of QUERIES) {
      expect(q.expectedIntent, q.id).toBe(q.category);
      // Only knowledge-base answers depend on the knowledge base; bookings, handoffs and refusals don't.
      expect(q.answerableOnlyWithKb, q.id).toBe(q.expectedHandling === "kb_answer");
      expect(q.query.trim(), q.id).toBe(q.query);
      expect(q.query.length, q.id).toBeLessThanOrEqual(120);
    }
    expect(QUERIES.filter((q) => q.previous).map((q) => q.id)).toEqual(["rq-10-follow-up"]);
    expect(QUERIES.find((q) => q.category === "unknown")?.expectedHandling).toBe("out_of_scope");
  });

  it("holds no answers to compare against", () => {
    for (const q of QUERIES) {
      expect(Object.keys(q).sort(), q.id).toEqual(
        ["answerableOnlyWithKb", "category", "expectedHandling", "expectedIntent", "id", "language", "note", "query", ...(q.previous ? ["previous"] : [])].sort(),
      );
      // A price or a phone number in a note would be an answer in disguise.
      expect(q.note, q.id).not.toMatch(/₹|\brs\.?\s*\d|\+91|\d{4,}/i);
    }
  });
});
