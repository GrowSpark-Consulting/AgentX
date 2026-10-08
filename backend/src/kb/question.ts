// The normal form of a customer's question: the key a knowledge-base gap is counted under (`kb_gaps.question_norm`,
// docs/contracts.md section 9: the app owns the normaliser). Two customers who type the same question with different
// capitals, punctuation or spacing meet in one gap, so the dashboard's "most asked" list counts them together.
//
// What it does: folds look-alike characters (NFKC), lowercases, removes zero-width characters without splitting the
// word they sit in, and turns everything that is not a letter, a combining sign or a digit into a space, so Tamil
// and Hindi vowel signs stay and punctuation, symbols and emoji go. An empty result means there was nothing to ask.

const ZERO_WIDTH = /[\u200b-\u200d\u2060\ufeff]/g;

export function normaliseQuestion(text: string): string {
  return text
    .normalize("NFKC")
    .replace(ZERO_WIDTH, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
