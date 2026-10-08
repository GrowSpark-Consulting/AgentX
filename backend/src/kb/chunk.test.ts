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

  it("does not start a chunk with half an emoji after stepping back for the overlap", () => {
    // The first cut falls after the line break at 600, so the overlap step-back (150) lands on 451:
    // an odd offset inside a run of two-unit emoji, i.e. on a low surrogate.
    const text = `${"😀".repeat(300)}\n${"tail ".repeat(100)}`;
    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c).not.toMatch(/^[\uDC00-\uDFFF]/);
      expect(c).not.toMatch(/[\uD800-\uDBFF]$/);
      expect(c).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/);
    }
    // The overlap is kept: the second chunk still begins with an emoji from the first.
    expect(chunks[1].startsWith("😀")).toBe(true);
  });

  it("does not start a chunk on half an emoji, whatever the length of the emoji run before the break", () => {
    // Each run ends in a line break, so the cut falls after it and the overlap step-back (150, an even
    // number) lands on an odd offset inside the run: a low surrogate unless the chunker corrects it.
    for (let emoji = 260; emoji <= 330; emoji += 7) {
      for (const tail of ["tail ".repeat(120), "x".repeat(300), "😀 ".repeat(200)]) {
        for (const c of chunkText(`${"😀".repeat(emoji)}\n${tail}`)) {
          expect(c).not.toMatch(/^[\uDC00-\uDFFF]/);
          expect(c).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/);
        }
      }
    }
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
