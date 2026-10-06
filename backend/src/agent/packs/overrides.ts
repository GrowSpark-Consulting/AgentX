import { PackField, PackReminder, type BookingMode, type PackDefinition } from "@pakka/types";
import { z } from "zod";
import { warning, type PackWarning } from "./warnings";

// Tenant overrides, from tenants.pack_overrides (docs/handover.md, "Tenant overrides"): rename field
// labels, hide optional fields, add optional fields, change reminder offsets, and (only when the caller
// allows it, because it is the Pro-plan feature custom_scoring) change scoring thresholds and weights.
//
// pack_overrides is tenant data, so it is read defensively: each part is checked on its own, an
// invalid part is dropped with a warning, and nothing here throws. Required fields, hard fails and
// everything not listed above cannot be overridden. The pack passed in is never changed.

export type BookingModeName = z.infer<typeof BookingMode>;
export type ResolvedPack = Omit<PackDefinition, "bookingModes"> & { bookingModes: BookingModeName[] };
export type OverrideOptions = { allowScoringOverrides?: boolean };

const KNOWN = new Set(["labels", "hideFields", "addFields", "reminderOffsets", "scoring"]);
// Parts of the pack that exist but are not tenant-editable: a clear "not allowed" instead of "unknown".
const PROTECTED = new Set([
  "key", "version", "label", "fields", "bookingModes", "bookingType", "templates", "handoffTriggers",
  "kbStarter", "extraGuardrails", "reminders", "feedback", "catalog", "hardFails", "required",
]);

const Thresholds = z.strictObject({ hot: z.int().min(0).optional(), warm: z.int().min(0).optional() });
const Weight = z.int().min(0);

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const has = (object: Record<string, unknown>, key: string) => Object.hasOwn(object, key);

export function applyOverrides(
  pack: ResolvedPack,
  overrides: unknown,
  options: OverrideOptions = {},
): { pack: ResolvedPack; warnings: PackWarning[] } {
  const warnings: PackWarning[] = [];
  const next = structuredClone(pack);
  if (overrides === undefined || overrides === null) return { pack: next, warnings };
  if (!isObject(overrides)) return { pack: next, warnings: [warning("override_ignored")] };

  try {
    for (const key of Object.keys(overrides)) {
      if (KNOWN.has(key)) continue;
      warnings.push(warning(PROTECTED.has(key) ? "override_not_allowed" : "override_unknown_key", key));
    }
    const originalKeys = new Set(next.fields.map((f) => f.key)); // hidden fields keep their key

    if (has(overrides, "labels")) applyLabels(next, overrides.labels, warnings);
    if (has(overrides, "hideFields")) applyHide(next, overrides.hideFields, warnings);
    if (has(overrides, "addFields")) applyAdd(next, overrides.addFields, originalKeys, warnings);
    if (has(overrides, "reminderOffsets")) applyReminderOffsets(next, overrides.reminderOffsets, warnings);
    if (has(overrides, "scoring")) {
      if (options.allowScoringOverrides) applyScoring(next, overrides.scoring, warnings);
      else warnings.push(warning("override_not_allowed", "scoring"));
    }
    return { pack: next, warnings };
  } catch {
    // Something unreadable (for example a throwing getter): keep the pack as it was.
    return { pack: structuredClone(pack), warnings: [warning("override_invalid")] };
  }
}

function applyLabels(pack: ResolvedPack, labels: unknown, warnings: PackWarning[]): void {
  if (!isObject(labels)) {
    warnings.push(warning("override_invalid", "labels"));
    return;
  }
  for (const [key, value] of Object.entries(labels)) {
    const field = pack.fields.find((f) => f.key === key);
    if (!field) {
      warnings.push(warning("override_field_unknown", key));
    } else if (typeof value !== "string" || value.trim() === "") {
      warnings.push(warning("override_invalid", `labels.${key}`));
    } else {
      field.label = value.trim();
    }
  }
}

function applyHide(pack: ResolvedPack, list: unknown, warnings: PackWarning[]): void {
  if (!Array.isArray(list)) {
    warnings.push(warning("override_invalid", "hideFields"));
    return;
  }
  const hidden = new Set<string>();
  for (const item of list) {
    if (typeof item !== "string") {
      warnings.push(warning("override_invalid", "hideFields"));
      continue;
    }
    if (hidden.has(item)) continue;
    const field = pack.fields.find((f) => f.key === item);
    if (!field) {
      warnings.push(warning("override_field_unknown", item));
    } else if (field.required) {
      warnings.push(warning("override_required_field", item));
    } else {
      hidden.add(item);
      pack.fields = pack.fields.filter((f) => f.key !== item);
      const used = pack.scoring.rules.some((r) => r.field === item) || pack.scoring.hardFails.some((h) => h.field === item);
      if (used) warnings.push(warning("scoring_hidden_field", item));
    }
  }
}

function applyAdd(pack: ResolvedPack, list: unknown, taken: Set<string>, warnings: PackWarning[]): void {
  if (!Array.isArray(list)) {
    warnings.push(warning("override_invalid", "addFields"));
    return;
  }
  list.forEach((item, index) => {
    const parsed = PackField.safeParse(item);
    if (!parsed.success) {
      warnings.push(warning("override_invalid", `addFields.${index}`));
      return;
    }
    const field = parsed.data;
    if (taken.has(field.key)) {
      warnings.push(warning("override_field_exists", field.key));
      return;
    }
    // An added field is always optional: a tenant cannot make the agent block on a field the pack never scores.
    if (field.required) warnings.push(warning("override_added_field_optional", field.key));
    taken.add(field.key);
    pack.fields.push({ ...field, required: false });
  });
}

function applyReminderOffsets(pack: ResolvedPack, offsets: unknown, warnings: PackWarning[]): void {
  if (!isObject(offsets)) {
    warnings.push(warning("override_invalid", "reminderOffsets"));
    return;
  }
  const reminders = [...pack.reminders, ...(pack.feedback ? [pack.feedback] : [])];
  for (const [template, offset] of Object.entries(offsets)) {
    const targets = reminders.filter((r) => r.template === template);
    if (targets.length === 0) {
      warnings.push(warning("override_reminder_unknown", template));
      continue;
    }
    const parsed = PackReminder.shape.offset.safeParse(offset);
    if (!parsed.success) {
      warnings.push(warning("override_invalid", `reminderOffsets.${template}`));
      continue;
    }
    for (const reminder of targets) reminder.offset = parsed.data;
  }
}

function applyScoring(pack: ResolvedPack, scoring: unknown, warnings: PackWarning[]): void {
  if (!isObject(scoring)) {
    warnings.push(warning("override_invalid", "scoring"));
    return;
  }
  for (const key of Object.keys(scoring)) {
    if (key === "thresholds" || key === "weights") continue;
    warnings.push(warning(key === "hardFails" ? "override_not_allowed" : "override_unknown_key", `scoring.${key}`));
  }

  if (has(scoring, "thresholds")) {
    const parsed = Thresholds.safeParse(scoring.thresholds);
    const merged = parsed.success
      ? { hot: parsed.data.hot ?? pack.scoring.thresholds.hot, warm: parsed.data.warm ?? pack.scoring.thresholds.warm }
      : undefined;
    if (merged && merged.hot > merged.warm) pack.scoring.thresholds = merged;
    else warnings.push(warning("override_invalid", "scoring.thresholds"));
  }

  if (has(scoring, "weights")) {
    if (!isObject(scoring.weights)) {
      warnings.push(warning("override_invalid", "scoring.weights"));
      return;
    }
    // Assumption to confirm with Raja: a weight replaces the points of EVERY rule on that field,
    // because rules have no id to point at one of several rules for the same field.
    for (const [field, value] of Object.entries(scoring.weights)) {
      const rules = pack.scoring.rules.filter((r) => r.field === field);
      const weight = Weight.safeParse(value);
      if (rules.length === 0) {
        warnings.push(warning("override_scoring_unknown_field", field));
      } else if (!weight.success) {
        warnings.push(warning("override_invalid", `scoring.weights.${field}`));
      } else {
        for (const rule of rules) rule.points = weight.data;
      }
    }
  }
}
