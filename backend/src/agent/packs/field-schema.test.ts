import type { PackField } from "@pakka/types";
import { describe, expect, it } from "vitest";
import { buildFieldSchema } from "./field-schema";
import { deepFreeze } from "./test-packs";

const field = (over: Partial<PackField> & Pick<PackField, "key" | "type">): PackField => ({
  label: "Label",
  required: false,
  ...over,
});

const accepts = (f: PackField, value: unknown) => buildFieldSchema([f]).safeParse({ [f.key]: value }).success;
const parsed = (f: PackField, value: unknown) => buildFieldSchema([f]).parse({ [f.key]: value })[f.key];

describe("buildFieldSchema", () => {
  it("makes every key optional: fields fill in over time", () => {
    const schema = buildFieldSchema([field({ key: "a", type: "text", required: true }), field({ key: "b", type: "int" })]);
    expect(schema.safeParse({}).success).toBe(true);
    expect(schema.parse({ a: "x" })).toEqual({ a: "x" });
  });

  it("strips keys the pack does not declare", () => {
    const schema = buildFieldSchema([field({ key: "a", type: "text" })]);
    expect(schema.parse({ a: "x", other: 1, constructor: "y" })).toEqual({ a: "x" });
  });

  it("rejects null for a declared key", () => {
    expect(accepts(field({ key: "a", type: "text" }), null)).toBe(false);
  });

  it("builds an empty schema for no fields and does not change its input", () => {
    expect(buildFieldSchema([]).parse({ a: 1 })).toEqual({});
    const fields = deepFreeze([field({ key: "a", type: "enum", options: ["x", "y"] })]);
    expect(() => buildFieldSchema(fields)).not.toThrow();
  });

  describe("text", () => {
    const f = field({ key: "t", type: "text" });
    it("accepts a non-empty string, trimmed", () => {
      expect(parsed(f, "  Anna Nagar ")).toBe("Anna Nagar");
      expect(parsed(f, "வணக்கம்")).toBe("வணக்கம்");
    });
    it.each(["", "   ", 5, true, {}, []])("rejects %j", (value) => expect(accepts(f, value)).toBe(false));
  });

  describe("int", () => {
    const f = field({ key: "n", type: "int" });
    it.each([[4, 4], ["4", 4], [" 7 ", 7], ["-3", -3], [0, 0]])("accepts %j as %j", (value, expected) => {
      expect(parsed(f, value)).toBe(expected);
    });
    it.each([1.5, "1.5", "abc", "", "4x", true, null, 2 ** 60, "99999999999999999999", NaN, Infinity])(
      "rejects %j",
      (value) => expect(accepts(f, value)).toBe(false),
    );
  });

  describe("boolean", () => {
    const f = field({ key: "b", type: "boolean" });
    it.each([[true, true], [false, false], ["true", true], ["false", false]])("accepts %j as %j", (value, expected) => {
      expect(parsed(f, value)).toBe(expected);
    });
    it.each(["yes", "no", 1, 0, "True", "", null])("rejects %j", (value) => expect(accepts(f, value)).toBe(false));
  });

  describe("enum", () => {
    const f = field({ key: "e", type: "enum", options: ["small", "medium", "large"] });
    it.each(["small", "medium", "large"])("accepts the option %s", (value) => expect(parsed(f, value)).toBe(value));
    it.each(["Small", "huge", "", " small", 1, true])("rejects %j", (value) => expect(accepts(f, value)).toBe(false));
    it("rejects everything when a field has no options, instead of throwing", () => {
      const broken = field({ key: "e", type: "enum" });
      expect(() => buildFieldSchema([broken])).not.toThrow();
      expect(accepts(broken, "anything")).toBe(false);
      expect(buildFieldSchema([broken]).safeParse({}).success).toBe(true);
    });
  });

  describe("range_inr", () => {
    const f = field({ key: "r", type: "range_inr" });
    it.each([["50-60L", "50-60L"], ["5000000", "5000000"], [5000000, 5000000], [" 40L ", "40L"], [0, 0]])(
      "accepts %j",
      (value, expected) => expect(parsed(f, value)).toBe(expected),
    );
    it.each(["", "   ", NaN, Infinity, true, null, {}])("rejects %j", (value) => expect(accepts(f, value)).toBe(false));
  });

  describe("date_range_or_month", () => {
    const f = field({ key: "d", type: "date_range_or_month" });
    it.each(["2026-12", "sometime in December", "10 Dec to 15 Dec"])("accepts the string %j", (value) => {
      expect(parsed(f, value)).toBe(value);
    });
    it.each(["", "  ", 5, true, null])("rejects %j", (value) => expect(accepts(f, value)).toBe(false));
  });

  it("validates every declared key independently", () => {
    const schema = buildFieldSchema([
      field({ key: "a", type: "int" }),
      field({ key: "b", type: "enum", options: ["x"] }),
    ]);
    expect(schema.safeParse({ a: 1, b: "x" }).success).toBe(true);
    expect(schema.safeParse({ a: 1, b: "nope" }).success).toBe(false);
    expect(schema.safeParse({ a: "nope", b: "x" }).success).toBe(false);
  });
});
