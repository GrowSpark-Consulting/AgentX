// What the pack loader reports instead of failing. A warning names a code and, at most, an identifier
// (a field key, a template name, a path). It never carries tenant text such as label values, so it is
// safe to log. The loader returns warnings and never logs by itself: the caller decides.

export type PackWarningCode =
  // The pack itself
  | "booking_type_derived" // bookingModes was empty; derived from bookingType
  | "booking_type_unknown" // bookingType is not a booking mode
  | "booking_type_mismatch" // bookingType is not among bookingModes; bookingModes wins
  | "booking_mode_missing" // neither bookingType nor bookingModes
  | "scoring_unknown_field" // a scoring rule names a field the pack does not declare
  | "hard_fail_unknown_field" // a hard fail names a field the pack does not declare
  // Tenant overrides (tenants.pack_overrides)
  | "override_ignored" // the whole value is not an object
  | "override_unknown_key"
  | "override_not_allowed" // a protected part of the pack, or scoring overrides switched off
  | "override_invalid" // a part of the override failed validation
  | "override_field_unknown"
  | "override_field_exists"
  | "override_required_field" // tried to hide a required field
  | "override_added_field_optional" // an added field asked to be required; made optional
  | "override_reminder_unknown"
  | "override_scoring_unknown_field" // a weight for a field with no scoring rule
  | "scoring_hidden_field"; // a scoring rule uses a field the tenant hid

export type PackWarning = { code: PackWarningCode; path?: string; detail: string };

const DETAILS: Record<PackWarningCode, string> = {
  booking_type_derived: "bookingModes was derived from bookingType",
  booking_type_unknown: "bookingType is not a known booking mode",
  booking_type_mismatch: "bookingType is not in bookingModes; bookingModes is used",
  booking_mode_missing: "the pack has neither bookingModes nor bookingType",
  scoring_unknown_field: "a scoring rule uses a field the pack does not declare",
  hard_fail_unknown_field: "a hard fail uses a field the pack does not declare",
  override_ignored: "pack overrides are not an object and were ignored",
  override_unknown_key: "unknown override key ignored",
  override_not_allowed: "this part of the pack cannot be overridden",
  override_invalid: "invalid override ignored",
  override_field_unknown: "override names a field the pack does not have",
  override_field_exists: "an added field uses a key that already exists",
  override_required_field: "a required field cannot be hidden",
  override_added_field_optional: "an added field cannot be required; it was made optional",
  override_reminder_unknown: "override names a reminder template the pack does not have",
  override_scoring_unknown_field: "a weight names a field with no scoring rule",
  scoring_hidden_field: "a scoring rule uses a field that is hidden",
};

/** Only plain identifiers are passed on; anything else (tenant-chosen text) becomes "unknown". */
export function safeId(value: unknown): string {
  return typeof value === "string" && /^[A-Za-z0-9_.-]{1,64}$/.test(value) ? value : "unknown";
}

export function warning(code: PackWarningCode, path?: unknown): PackWarning {
  return { code, ...(path !== undefined && { path: safeId(path) }), detail: DETAILS[code] };
}

/** Fixed-text line for a log: code, optional identifier, fixed detail. */
export function formatWarning(w: PackWarning): string {
  return `pack warning ${w.code}${w.path ? ` (${w.path})` : ""}: ${w.detail}`;
}
