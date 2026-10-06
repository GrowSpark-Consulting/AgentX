import { E164 } from "@pakka/types";

// Meta sends numbers as bare digits ("919812345621"); InboundMessage wants E.164 with a leading "+".
// Returns null when the result is not a valid E.164 number (for example a group id).
export function normalizeE164(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const digits = raw.replace(/\D/g, "");
  const parsed = E164.safeParse(`+${digits}`);
  return parsed.success ? parsed.data : null;
}

// For log output: keeps the country code and the last two digits, "+919812345621" -> "+9198xxxxxx21".
// Anything that is not a plain number is fully masked.
export function maskPhone(phone: unknown): string {
  if (typeof phone !== "string") return "***";
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 7) return "***";
  return `+${digits.slice(0, 4)}${"x".repeat(digits.length - 6)}${digits.slice(-2)}`;
}
