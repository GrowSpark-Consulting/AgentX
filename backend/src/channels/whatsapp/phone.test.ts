import { describe, expect, it } from "vitest";
import { maskPhone, normalizeE164 } from "./phone";

describe("normalizeE164", () => {
  it.each([
    ["bare digits from Meta", "919812345621", "+919812345621"],
    ["already prefixed", "+919812345621", "+919812345621"],
    ["spaces and dashes", "+91 98123-45621", "+919812345621"],
    ["a US number", "16505551234", "+16505551234"],
  ])("normalises %s", (_why, raw, expected) => {
    expect(normalizeE164(raw)).toBe(expected);
  });

  it.each([
    ["an empty string", ""],
    ["letters only", "abc"],
    ["too short", "12345"],
    ["too long", "1234567890123456"],
    ["a leading zero", "0919812345621"],
    ["a group id style value", "120363025246125486@g.us"],
  ])("returns null for %s", (_why, raw) => {
    expect(normalizeE164(raw)).toBeNull();
  });

  it("returns null for values that are not strings", () => {
    for (const value of [undefined, null, 919812345621, {}, []]) {
      expect(normalizeE164(value)).toBeNull();
    }
  });
});

describe("maskPhone", () => {
  it("keeps the country code and the last two digits", () => {
    expect(maskPhone("+919812345621")).toBe("+9198xxxxxx21");
    expect(maskPhone("919812345621")).toBe("+9198xxxxxx21");
  });

  it("never returns the original number", () => {
    expect(maskPhone("+16505551234")).not.toContain("5551");
  });

  it("fully masks anything that is not a usable number", () => {
    for (const value of ["", "12", undefined, null, 42]) {
      expect(maskPhone(value)).toBe("***");
    }
  });
});
