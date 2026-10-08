// From the model's text to a JSON object. The extraction prompt asks for a bare object and the fast model
// still sometimes wraps it in a code fence or adds a sentence, so this takes the one object out of the text.
// It never throws; the caller validates the object with Zod and decides what a failure means (docs/handover.md:
// "on failure retry once, then fall back to ask a clarifying question").

/** Far larger than any extraction (a handful of fields). */
const MAX_CHARS = 100_000;

export type ParsedJson = { ok: true; value: Record<string, unknown> } | { ok: false };

/** The index just past the object that starts at `start`, or -1 if it never closes. Braces inside strings do not count. */
function objectEnd(text: string, start: number): number {
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (c === "\\") i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return i + 1;
  }
  return -1;
}

export function parseJsonObject(text: string): ParsedJson {
  if (text.length > MAX_CHARS) return { ok: false };
  const unfenced = text.trim().replace(/^```[A-Za-z]*\s*/, "").replace(/\s*```$/, "").trim();
  if (unfenced.startsWith("[")) return { ok: false }; // an array of objects is not the one object that was asked for
  const start = unfenced.indexOf("{");
  // An object that is inside an array ("Here: [{...}]") is not the one object that was asked for.
  if (start > 0 && /[[,]\s*$/.test(unfenced.slice(0, start))) return { ok: false };
  if (start === -1) return { ok: false };
  const end = objectEnd(unfenced, start);
  if (end === -1) return { ok: false };
  // Anything after the object that is another object means the answer is ambiguous.
  if (unfenced.indexOf("{", end) !== -1) return { ok: false };
  try {
    const value: unknown = JSON.parse(unfenced.slice(start, end));
    return value !== null && typeof value === "object" && !Array.isArray(value) ? { ok: true, value: value as Record<string, unknown> } : { ok: false };
  } catch {
    return { ok: false };
  }
}
