import { stripUnsafeCharacters } from "../../lib/text";

// Helpers every prompt uses to put outside text (a customer's message, a business's name) into a prompt.
// The rule of the prompts: outside text only ever appears inside a tag, escaped, so it is data to read and
// can never close the tag or add one of its own.

/** Longest piece of one message that goes into a prompt. Far above a real WhatsApp message (about 4,000 characters). */
export const MAX_TEXT_CHARS = 4000;

/** Escaped for use inside a tag: & < > become entities, control characters go, newlines stay, cut to `max` characters. */
export function escapeForPrompt(text: string, max = MAX_TEXT_CHARS): string {
  const escaped = stripUnsafeCharacters(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").trim();
  return [...escaped].slice(0, max).join("");
}

/**
 * A name a business chooses (its own name, the assistant's name): letters, marks, digits, spaces and a few
 * marks of punctuation, on one line. Anything else is dropped, so a name cannot carry a sentence of instructions
 * with punctuation, markup or line breaks.
 */
export function nameForPrompt(text: string, max: number): string {
  const kept = stripUnsafeCharacters(text).replace(/[^\p{L}\p{M}\p{N} '’&.-]/gu, " ").replace(/\s+/g, " ").trim();
  return [...kept].slice(0, max).join("").trim();
}

/** Escaped text on one line: for names and labels. */
export const oneLine = (text: string, max = 200): string => escapeForPrompt(text.replace(/\s+/g, " "), max);
