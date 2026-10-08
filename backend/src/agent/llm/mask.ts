import { maskPhone } from "../../channels/whatsapp/phone";

// Personal data out of anything that leaves for a tracing service. A customer's own words can carry a phone
// number or an email address, so both are masked, wherever they appear in the text.

// A phone number as people type it: optional +, digits that may be split by spaces or dashes, 10 to 15 digits
// in all. A price, an area or a year has fewer digits and is left alone.
const PHONE = /\+?(?<!\d)(?:\d[ -]?){9,14}\d(?!\d)/g;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;

/** Longer text is cut before it is masked: the patterns below would otherwise take time proportional to a very long run. */
const MAX_MASKED_CHARS = 20_000;

export function maskPersonalData(text: string): string {
  return text.slice(0, MAX_MASKED_CHARS).replace(EMAIL, "***@***").replace(PHONE, (match) => {
    const digits = match.replace(/\D/g, "");
    // A national number with no country code (10 digits, or 11 with a leading 0): keep its last two digits.
    return digits.length <= 11 ? `${"x".repeat(digits.length - 2)}${digits.slice(-2)}` : maskPhone(digits);
  });
}
