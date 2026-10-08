import { AppError } from "../lib/errors";

// Characters, not tokens: there is no tokenizer for Tamil, Tanglish and English together, and
// ~1000 characters keeps a chunk to one topic.
export const CHUNK_SIZE = 1000;
export const CHUNK_OVERLAP = 150;
export const MAX_CHUNKS = 500;

// Where to cut, best first: a paragraph break, a line break, a sentence end, a space.
const SEPARATORS = ["\n\n", "\n", ". ", " "];

/** Never cut between the halves of a surrogate pair. */
function safeEnd(text: string, end: number): number {
  const code = text.charCodeAt(end - 1);
  return end < text.length && code >= 0xd800 && code <= 0xdbff ? end - 1 : end;
}

function cutPoint(text: string, start: number): number {
  const limit = start + CHUNK_SIZE;
  if (limit >= text.length) return text.length;
  const window = text.slice(start, limit);
  // Only cut in the second half of the window, so a chunk is never tiny.
  for (const separator of SEPARATORS) {
    const at = window.lastIndexOf(separator);
    if (at >= CHUNK_SIZE / 2) return start + at + separator.length;
  }
  return safeEnd(text, limit);
}

/** Splits text into overlapping chunks of at most CHUNK_SIZE characters, cutting at natural breaks. */
export function chunkText(input: string): string[] {
  const text = input.trim();
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = cutPoint(text, start);
    const chunk = text.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (chunks.length > MAX_CHUNKS) {
      throw new AppError("validation_failed", "This file is too long for the knowledge base.", {
        file: "This file is too long. Split it into smaller files.",
      });
    }
    if (end >= text.length) break;
    // Step back by the overlap, but always move forward.
    start = Math.max(end - CHUNK_OVERLAP, start + 1);
    // Start the next chunk on a word, not in the middle of one.
    const space = text.indexOf(" ", start);
    if (space !== -1 && space < end) start = space + 1;
    // The step-back can land inside an emoji's two UTF-16 units; begin after it, never in the middle.
    const code = text.charCodeAt(start);
    if (code >= 0xdc00 && code <= 0xdfff) start += 1;
  }
  return chunks;
}
