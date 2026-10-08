// Text from outside (uploaded files, WhatsApp, a model) before it is saved or sent on. Postgres
// refuses NUL in text and lone surrogates are not valid UTF-8; one such character would make a whole
// insert fail, and for a webhook that means Meta retrying the same batch for days.

/** The text without NUL, control characters (tab, newline and carriage return stay), C1 controls and lone surrogates. */
export function stripUnsafeCharacters(text: string): string {
  return text
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g, "")
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "");
}
