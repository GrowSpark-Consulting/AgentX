import { normaliseQuestion } from "../kb/question";
import type { TextLanguage } from "../agent/pipeline/fixed-texts";

// STOP (docs/handover.md, "Consent (DPDP)": "STOP or an equivalent in Tamil or Hindi sets contacts.opted_out_at"). A fixed list,
// no model: opting someone out must never depend on a guess. A message is a STOP only when the WHOLE message is one of
// these phrases (case, punctuation, emoji and spacing ignored), so "bus stop near the project", "don't stop calling" and
// "stop by tomorrow at 5" are ordinary messages. "cancel" alone is not on the list (it means a booking), and neither are
// "vendam" or "band" alone: too common in other sentences.
//
// The language of a phrase is the language of the one confirmation sent afterwards.

export const STOP_PHRASES: Record<TextLanguage, readonly string[]> = {
  en: [
    "stop",
    "stop all",
    "stopall",
    "unsubscribe",
    "opt out",
    "optout",
    "stop messages",
    "stop messaging",
    "stop messaging me",
    "do not message me",
    "dont message me",
    "don't message me",
    "remove me",
    "leave me alone",
  ],
  // Tamil in English letters
  "ta-en": ["niruthunga", "nirutthunga", "niruthu", "nirutthu", "message panna vendam", "msg panna vendam", "message pannadheenga", "enakku message vendam"],
  // Tamil script
  ta: ["நிறுத்து", "நிறுத்துங்கள்", "நிறுத்துங்க", "மெசேஜ் அனுப்பாதீர்கள்", "மெசேஜ் அனுப்பாதீங்க", "எனக்கு மெசேஜ் வேண்டாம்"],
  // Hindi, in script and in English letters
  hi: ["रुको", "रुकिए", "बंद करो", "बन्द करो", "बंद करें", "मैसेज बंद करो", "मैसेज मत भेजो", "ruko", "band karo", "message mat bhejo"],
};

const BY_NORMAL_FORM = new Map<string, TextLanguage>();
for (const [language, phrases] of Object.entries(STOP_PHRASES) as [TextLanguage, readonly string[]][]) {
  for (const phrase of phrases) BY_NORMAL_FORM.set(normaliseQuestion(phrase), language);
}

/** The language of the STOP phrase this whole message is, or null when it is not one. */
export function matchStop(text: string): TextLanguage | null {
  // Emoji variation selectors (U+FE0E, U+FE0F) are marks to the normaliser, so "Stop ❤️" would not read as "stop": they go first.
  const normal = normaliseQuestion(text.replace(/[\ufe0e\ufe0f]/g, ""));
  return normal === "" ? null : (BY_NORMAL_FORM.get(normal) ?? null);
}
