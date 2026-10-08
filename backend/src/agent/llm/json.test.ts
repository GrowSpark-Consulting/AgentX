import { describe, expect, it } from "vitest";
import { parseJsonObject } from "./json";

// The fast model is told to answer with a bare JSON object, and still wraps it in a code fence (seen in the
// live smoke run). The pipeline validates the object with Zod; this only gets from the model's text to the
// object, without ever throwing, so the caller's "one retry, then a clarifying question" decides what a
// failure means.

describe("parseJsonObject", () => {
  it("reads a bare object", () => {
    expect(parseJsonObject('{"a":1,"b":"x"}')).toEqual({ ok: true, value: { a: 1, b: "x" } });
  });

  it("reads an object in a code fence, with or without the word json, in any case", () => {
    expect(parseJsonObject('```json\n{"a":1}\n```')).toEqual({ ok: true, value: { a: 1 } });
    expect(parseJsonObject('```\n{"a":1}\n```')).toEqual({ ok: true, value: { a: 1 } });
    expect(parseJsonObject('```JSON\n{"a":1}\n```')).toEqual({ ok: true, value: { a: 1 } });
  });

  it("reads an object with a sentence before or after it", () => {
    expect(parseJsonObject('Here is the result:\n{"a":1}\nLet me know!')).toEqual({ ok: true, value: { a: 1 } });
  });

  it("keeps braces inside strings and nested objects", () => {
    const text = '{"question":"what is {this}?","fields":{"x":{"y":"}"}}}';
    expect(parseJsonObject(text)).toEqual({ ok: true, value: { question: "what is {this}?", fields: { x: { y: "}" } } } });
  });

  it("reads Tamil text as written", () => {
    expect(parseJsonObject('{"q":"விலை என்ன?"}')).toEqual({ ok: true, value: { q: "விலை என்ன?" } });
  });

  it.each([
    ["nothing", ""],
    ["blank", "   \n "],
    ["no object", "I could not read that message."],
    ["an array", '[{"a":1}]'],
    ["an array after a sentence", 'Here: [{"a":1}]'],
    ["a number", "42"],
    ["a string", '"text"'],
    ["null", "null"],
    ["broken JSON", '{"a":1,'],
    ["two objects (which one is meant?)", '{"a":1} {"b":2}'],
  ])("says not ok for %s, and does not throw", (_name, text) => {
    expect(parseJsonObject(text)).toEqual({ ok: false });
  });

  it("refuses an answer far larger than any extraction, without parsing it", () => {
    expect(parseJsonObject(`{"a":"${"x".repeat(200_000)}"}`)).toEqual({ ok: false });
  });
});
