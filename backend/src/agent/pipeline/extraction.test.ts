import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { resolvePack } from "../packs/load";
import { FIELD_VALUE_MAX_CHARS, interpretExtraction, QUESTION_MAX_CHARS } from "./extraction";

// From the fast model's text to a checked Extraction: the model only reports what the customer said, and
// everything it returns is validated by code (docs/handover.md: "Zod for every LLM output"; "fields: only keys
// from the pack's field schema"). A bad answer is not repaired: it is refused, and the pipeline asks again once.

const PACKS_DIR = fileURLToPath(new URL("../../../../packs", import.meta.url));
const { fieldSchema } = resolvePack(JSON.parse(readFileSync(`${PACKS_DIR}/real-estate.json`, "utf8")));

const answer = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    language: "ta-en",
    intent: "question",
    fields: { location: "Velachery", config: "2BHK", budget: "80L", timeline: "0-3m" },
    question: "What is the price of a 2BHK in Velachery?",
    preferredTime: null,
    sentiment: "neutral",
    asksIfHuman: false,
    confidence: 0.95,
    ...over,
  });

describe("interpretExtraction", () => {
  it("accepts a good answer as it is", () => {
    const result = interpretExtraction(answer(), fieldSchema);
    expect(result).toMatchObject({ ok: true, extraction: { language: "ta-en", intent: "question", fields: { location: "Velachery", config: "2BHK", budget: "80L", timeline: "0-3m" }, question: "What is the price of a 2BHK in Velachery?", preferredTime: null, sentiment: "neutral", asksIfHuman: false, confidence: 0.95 } });
  });

  it("accepts the answer wrapped in a code fence, which the fast model does even when told not to", () => {
    expect(interpretExtraction("```json\n" + answer() + "\n```", fieldSchema).ok).toBe(true);
  });

  describe("what it refuses", () => {
    it.each([
      ["no JSON at all", "I could not read that message."],
      ["an empty answer", ""],
      ["an array", `[${answer()}]`],
      ["broken JSON", answer().slice(0, -3)],
    ])("%s", (_name, text) => {
      expect(interpretExtraction(text, fieldSchema)).toEqual({ ok: false, reason: "not_json" });
    });

    it.each<[string, Record<string, unknown>]>([
      ["a language that is not offered", { language: "fr" }],
      ["an intent that is not offered", { intent: "chitchat" }],
      ["a sentiment that is not offered", { sentiment: "ecstatic" }],
      ["confidence above 1", { confidence: 1.5 }],
      ["confidence that is text", { confidence: "high" }],
      ["asksIfHuman that is text", { asksIfHuman: "no" }],
      ["a question that is a number", { question: 42 }],
    ])("%s", (_name, over) => {
      expect(interpretExtraction(answer(over), fieldSchema)).toEqual({ ok: false, reason: "schema" });
    });

    it("a missing key", () => {
      const without = Object.fromEntries(Object.entries(JSON.parse(answer())).filter(([key]) => key !== "sentiment"));
      expect(interpretExtraction(JSON.stringify(without), fieldSchema)).toEqual({ ok: false, reason: "schema" });
    });
  });

  describe("the fields", () => {
    const fieldsOf = (fields: unknown) => {
      const result = interpretExtraction(answer({ fields }), fieldSchema);
      return result.ok ? { fields: result.extraction.fields, dropped: result.dropped } : result;
    };

    it("keeps only the pack's keys, and counts what it dropped without keeping it", () => {
      expect(fieldsOf({ location: "OMR", pets_allowed: true, favourite_colour: "blue" })).toEqual({ fields: { location: "OMR" }, dropped: { unknownKeys: 2, invalidValues: 0 } });
    });

    it("checks each value against the pack's own type for that field and drops the ones that do not fit, keeping the rest", () => {
      expect(fieldsOf({ config: "4BHK", timeline: "0-3m", funding: "cash", decision_maker: "maybe", location: "OMR" })).toEqual({
        fields: { timeline: "0-3m", location: "OMR" },
        dropped: { unknownKeys: 0, invalidValues: 3 },
      });
    });

    it("turns what the model sends as text into the type the pack asks for", () => {
      expect(fieldsOf({ decision_maker: "true" })).toMatchObject({ fields: { decision_maker: true } });
    });

    it("takes a budget as a number or as the customer wrote it", () => {
      expect(fieldsOf({ budget: 8000000 })).toMatchObject({ fields: { budget: 8000000 } });
      expect(fieldsOf({ budget: "50 to 60 lakh" })).toMatchObject({ fields: { budget: "50 to 60 lakh" } });
    });

    it("lets the model say nothing: no fields, null, a missing key", () => {
      expect(fieldsOf({})).toMatchObject({ fields: {} });
      expect(fieldsOf(null)).toMatchObject({ fields: {} });
      const without = Object.fromEntries(Object.entries(JSON.parse(answer())).filter(([key]) => key !== "fields"));
      expect((interpretExtraction(JSON.stringify(without), fieldSchema) as { ok: boolean }).ok).toBe(true);
    });

    it("drops a null, an object or a list given as a value, instead of failing the whole answer", () => {
      expect(fieldsOf({ location: null, budget: { min: 5 }, config: ["2BHK"], timeline: "0-3m" })).toMatchObject({ fields: { timeline: "0-3m" } });
    });

    it("drops a blank value", () => {
      expect(fieldsOf({ location: "   ", timeline: "0-3m" })).toMatchObject({ fields: { timeline: "0-3m" } });
    });

    it("is not fooled by a key named like an object's own property, even as a real own key of the parsed JSON", () => {
      // A literal `__proto__:` in source sets the prototype; JSON.parse makes a real own key, which is what the model sends.
      const text = `{"language":"en","intent":"question","fields":{"constructor":"x","__proto__":"y","toString":"z","location":"OMR"},"question":null,"preferredTime":null,"sentiment":"neutral","asksIfHuman":false,"confidence":0.9}`;
      const result = interpretExtraction(text, fieldSchema);
      expect(result).toMatchObject({ ok: true, extraction: { fields: { location: "OMR" } }, dropped: { unknownKeys: 3, invalidValues: 0 } });
      if (result.ok) {
        expect(Object.keys(result.extraction.fields)).toEqual(["location"]);
        expect(Object.getPrototypeOf(result.extraction.fields)).toBe(Object.prototype);
      }
    });

    it("tidies a text value like any outside text: control characters, line breaks and extra spaces", () => {
      expect(fieldsOf({ location: "  Vela\u0000chery \n\n  Chennai  " })).toMatchObject({ fields: { location: "Velachery Chennai" } });
    });

    it("cuts a very long text value", () => {
      const result = fieldsOf({ location: "a".repeat(10_000) });
      expect((result as unknown as { fields: { location: string } }).fields.location).toHaveLength(FIELD_VALUE_MAX_CHARS);
    });

    it("drops a value that is only control characters", () => {
      expect(fieldsOf({ location: "\u0000\u0007", timeline: "0-3m" })).toEqual({ fields: { timeline: "0-3m" }, dropped: { unknownKeys: 0, invalidValues: 1 } });
    });
  });

  describe("the question, which is used to search the knowledge base", () => {
    const questionOf = (question: unknown) => {
      const result = interpretExtraction(answer({ question }), fieldSchema);
      return result.ok ? result.extraction.question : result;
    };

    it("is trimmed and on one line", () => {
      expect(questionOf("  What is\n the   price?  ")).toBe("What is the price?");
    });

    it("is null when it is blank, or null", () => {
      expect(questionOf("   ")).toBeNull();
      expect(questionOf(null)).toBeNull();
    });

    it("is cut to the limit by character, never inside an emoji", () => {
      const cut = questionOf("\u{1F600}".repeat(QUESTION_MAX_CHARS + 10)) as string;
      expect([...cut]).toHaveLength(QUESTION_MAX_CHARS);
      expect(cut).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/);
    });

    it("loses control characters", () => {
      expect(questionOf("price\u0000?\u0007")).toBe("price?");
    });

    it("the limit is the knowledge-base gap question limit, 300 characters", () => {
      expect(QUESTION_MAX_CHARS).toBe(300);
    });
  });

  describe("when the customer wants a time", () => {
    it("keeps their own words, tidied and short", () => {
      const result = interpretExtraction(answer({ preferredTime: "  tomorrow \n evening " }), fieldSchema);
      expect(result.ok && result.extraction.preferredTime).toBe("tomorrow evening");
    });

    it("is null when blank", () => {
      const result = interpretExtraction(answer({ preferredTime: "  " }), fieldSchema);
      expect(result.ok && result.extraction.preferredTime).toBeNull();
    });

    it("is cut to 100 characters", () => {
      const result = interpretExtraction(answer({ preferredTime: "x".repeat(300) }), fieldSchema);
      expect(result.ok && result.extraction.preferredTime?.length).toBe(100);
    });
  });
});
