import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { EXIT_PHRASES, exitIntentOf, HANDOFF_PHRASE_NUMBERS, NOT_INTERESTED_PHRASE_NUMBER } from "./exit-phrases";

// The data file is Raja's document, word for word.

const doc = readFileSync(resolve(__dirname, "../../../../docs/reference/opt-out-handoff-phrases.md"), "utf8").replace(/\r\n/g, "\n");

describe("exit phrases", () => {
  it("is equal to docs/reference/opt-out-handoff-phrases.md: 13 languages, 10 phrases each, in the document's order", () => {
    const parsed: { language: string; phrases: string[] }[] = [];
    for (const line of doc.split("\n")) {
      const heading = line.match(/^### (.+)$/);
      if (heading) parsed.push({ language: heading[1].trim(), phrases: [] });
      const item = line.match(/^(\d+)\. (.+)$/);
      if (item && parsed.length > 0) parsed[parsed.length - 1].phrases.push(item[2].trim());
    }
    expect(EXIT_PHRASES.map((l) => ({ language: l.language, phrases: [...l.phrases] }))).toEqual(parsed);
    expect(EXIT_PHRASES).toHaveLength(13);
    for (const l of EXIT_PHRASES) expect(l.phrases).toHaveLength(10);
  });

  it("marks exactly Telugu, Kannada, Bengali, Marathi, Gujarati and Punjabi as needing a native speaker's check", () => {
    expect(EXIT_PHRASES.filter((l) => l.needsNativeCheck).map((l) => l.language)).toEqual(["Telugu", "Kannada", "Bengali", "Marathi", "Gujarati", "Punjabi"]);
  });

  it("phrases 2, 5 and 9 ask for a person; 1, 3, 4, 6, 7, 8 and 10 opt out; 7 is 'not interested'", () => {
    expect(HANDOFF_PHRASE_NUMBERS).toEqual([2, 5, 9]);
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(exitIntentOf)).toEqual(["opt_out", "talk_to_human", "opt_out", "opt_out", "talk_to_human", "opt_out", "opt_out", "opt_out", "talk_to_human", "opt_out"]);
    expect(NOT_INTERESTED_PHRASE_NUMBER).toBe(7);
  });
});
