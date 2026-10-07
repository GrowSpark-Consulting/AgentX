import { describe, expect, it } from "vitest";
import { chunkText, CHUNK_OVERLAP, CHUNK_SIZE, MAX_CHUNKS } from "./chunk";

const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(" ");

describe("chunkText", () => {
  it("returns no chunks for empty or whitespace-only text", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("  \n\n \t ")).toEqual([]);
  });

  it("keeps short text as one trimmed chunk", () => {
    expect(chunkText("  We open at 9am.  ")).toEqual(["We open at 9am."]);
  });

  it("never makes a chunk longer than the size", () => {
    const chunks = chunkText(words(1000));
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(CHUNK_SIZE);
  });

  it("overlaps neighbouring chunks, so a sentence on a boundary appears whole in one of them", () => {
    const chunks = chunkText(words(1000));
    for (let i = 1; i < chunks.length; i++) {
      const tail = chunks[i - 1].split(" ").slice(-3).join(" ");
      expect(chunks[i]).toContain(tail.split(" ")[0]);
    }
    expect(CHUNK_OVERLAP).toBeLessThan(CHUNK_SIZE / 2);
  });

  it("loses no words", () => {
    const text = words(800);
    const joined = chunkText(text).join(" ");
    for (let i = 0; i < 800; i += 37) expect(joined).toContain(`word${i}`);
    expect(joined).toContain("word799");
  });

  it("prefers paragraph breaks over cutting a paragraph in half", () => {
    const first = "A".repeat(600);
    const second = "B".repeat(600);
    const chunks = chunkText(`${first}\n\n${second}`);
    expect(chunks[0]).toBe(first);
    expect(chunks.some((c) => c.includes("B".repeat(600)))).toBe(true);
  });

  it("splits a single very long word instead of looping or overflowing", () => {
    const chunks = chunkText("x".repeat(CHUNK_SIZE * 3));
    expect(chunks.length).toBeGreaterThanOrEqual(3);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(CHUNK_SIZE);
  });

  it("does not cut a surrogate pair in half", () => {
    const chunks = chunkText("😀".repeat(CHUNK_SIZE));
    for (const c of chunks) expect(c).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/);
  });

  it("handles Tamil text", () => {
    const text = "வணக்கம் ".repeat(400);
    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThan(1);
    // Cut at spaces, so every chunk starts and ends on a whole word.
    for (const c of chunks) {
      expect(c.length).toBeLessThanOrEqual(CHUNK_SIZE);
      expect(c.split(" ").every((w) => w === "வணக்கம்")).toBe(true);
    }
  });

  it("refuses text that would need more than the maximum number of chunks", () => {
    const huge = "word ".repeat(CHUNK_SIZE * MAX_CHUNKS);
    expect(() => chunkText(huge)).toThrowError(expect.objectContaining({ code: "validation_failed", fields: { file: expect.any(String) } }));
  });
});
