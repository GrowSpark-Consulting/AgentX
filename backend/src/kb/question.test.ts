import { describe, expect, it } from "vitest";
import { normaliseQuestion } from "./question";

// The normal form of a customer's question, the key a knowledge-base gap is counted under
// (kb_gaps.question_norm; docs/contracts.md section 9: "the app owns the normaliser"). Two customers asking the same
// thing in slightly different typing must meet in one gap; two different questions must not.

describe("normaliseQuestion", () => {
  it("ignores case, punctuation and extra spaces", () => {
    expect(normaliseQuestion("  Do you do   HOME visits?? ")).toBe("do you do home visits");
    expect(normaliseQuestion("do you do home visits")).toBe("do you do home visits");
  });

  it("keeps Tamil script whole: letters and their vowel signs are not stripped", () => {
    expect(normaliseQuestion("வீட்டுக்கு வருவீர்களா?")).toBe("வீட்டுக்கு வருவீர்களா");
    expect(normaliseQuestion("வீட்டுக்கு வருவீர்களா?").length).toBeGreaterThan(10);
  });

  it("keeps Hindi script, with its signs", () => {
    expect(normaliseQuestion("क्या आप घर आते हैं?")).toBe("क्या आप घर आते हैं");
  });

  it("treats Tanglish like any other Latin text", () => {
    expect(normaliseQuestion("Possession eppo kodupeenga?")).toBe("possession eppo kodupeenga");
  });

  it("keeps numbers, and ₹ and other symbols only as separators", () => {
    expect(normaliseQuestion("2BHK price ₹80L?")).toBe("2bhk price 80l");
  });

  it("folds look-alike forms (full-width letters, ligatures) to the same text", () => {
    expect(normaliseQuestion("ＰＡＲＫＩＮＧ available?")).toBe("parking available");
  });

  it("removes zero-width characters without splitting the word they sit in", () => {
    expect(normaliseQuestion("par\u200bking")).toBe("parking");
    expect(normaliseQuestion("क्\u200dया")).toBe(normaliseQuestion("क्या"));
  });

  it("is a different key for a different question", () => {
    expect(normaliseQuestion("Is there parking?")).not.toBe(normaliseQuestion("Is there a pool?"));
  });

  it("is empty for text with nothing to ask (the caller must not record it)", () => {
    expect(normaliseQuestion("???")).toBe("");
    expect(normaliseQuestion("   ")).toBe("");
    expect(normaliseQuestion("\u{1F600}\u{1F600}")).toBe("");
  });

  it("is stable: normalising twice gives the same text", () => {
    const once = normaliseQuestion("  Kids' play-area, any?  ");
    expect(normaliseQuestion(once)).toBe(once);
  });
});
