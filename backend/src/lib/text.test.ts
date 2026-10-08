import { describe, expect, it } from "vitest";
import { stripUnsafeCharacters } from "./text";

describe("stripUnsafeCharacters", () => {
  it("removes NUL, other control characters and C1 controls", () => {
    expect(stripUnsafeCharacters("a\u0000b\u0001c\u001fd\u007fe\u0085f\u009fg")).toBe("abcdefg");
  });

  it("keeps tab, newline and carriage return, and does not trim", () => {
    expect(stripUnsafeCharacters(" a\tb\nc\r\n ")).toBe(" a\tb\nc\r\n ");
  });

  it("removes lone surrogates but keeps real emoji, Tamil and ZWJ sequences", () => {
    expect(stripUnsafeCharacters("a\uD83Db\uDE00c")).toBe("abc");
    const kept = "😀 வணக்கம் 👨‍👩‍👧";
    expect(stripUnsafeCharacters(kept)).toBe(kept);
  });

  it("leaves clean text alone", () => {
    expect(stripUnsafeCharacters("Hello, 9am? ₹500!")).toBe("Hello, 9am? ₹500!");
  });
});
