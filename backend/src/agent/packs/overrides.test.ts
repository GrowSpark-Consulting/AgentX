import { PackDefinition } from "@pakka/types";
import { describe, expect, it } from "vitest";
import { applyOverrides, type ResolvedPack } from "./overrides";
import { deepFreeze, samplePack } from "./test-packs";

const base = (): ResolvedPack => ({ ...PackDefinition.parse(samplePack()), bookingModes: ["slot"] });
const apply = (overrides: unknown, options: { allowScoringOverrides?: boolean } = {}) =>
  applyOverrides(base(), overrides, options);
const codes = (result: { warnings: { code: string }[] }) => result.warnings.map((w) => w.code);
const labelOf = (pack: ResolvedPack, key: string) => pack.fields.find((f) => f.key === key)?.label;
const keys = (pack: ResolvedPack) => pack.fields.map((f) => f.key);

describe("nothing to apply", () => {
  it.each([["undefined", undefined], ["null", null], ["an empty object", {}]])("returns the pack unchanged for %s", (_why, overrides) => {
    const result = apply(overrides);
    expect(result.pack).toEqual(base());
    expect(result.warnings).toEqual([]);
  });

  it.each([["a string", "x"], ["a number", 42], ["an array", []], ["true", true]])("ignores %s with one warning", (_why, overrides) => {
    const result = apply(overrides);
    expect(result.pack).toEqual(base());
    expect(codes(result)).toEqual(["override_ignored"]);
  });
});

describe("labels", () => {
  it("renames existing fields and trims", () => {
    const result = apply({ labels: { budget: "  Your budget  ", area: "Where?" } });
    expect(labelOf(result.pack, "budget")).toBe("Your budget");
    expect(labelOf(result.pack, "area")).toBe("Where?");
    expect(result.warnings).toEqual([]);
  });

  it("warns about an unknown field and leaves the rest", () => {
    const result = apply({ labels: { ghost: "x", budget: "B" } });
    expect(codes(result)).toEqual(["override_field_unknown"]);
    expect(labelOf(result.pack, "budget")).toBe("B");
  });

  it.each([["empty", ""], ["blank", "   "], ["a number", 5], ["null", null], ["an object", {}]])("ignores a label that is %s", (_why, value) => {
    const result = apply({ labels: { budget: value } });
    expect(labelOf(result.pack, "budget")).toBe("Budget");
    expect(codes(result)).toEqual(["override_invalid"]);
  });

  it("ignores labels that are not an object", () => {
    expect(codes(apply({ labels: ["x"] }))).toEqual(["override_invalid"]);
    expect(codes(apply({ labels: "x" }))).toEqual(["override_invalid"]);
  });

  it("never changes anything but the label", () => {
    const before = base();
    const after = apply({ labels: { budget: "B" } }).pack;
    expect(after.fields[0]).toEqual({ ...before.fields[0], label: "B" });
    expect({ ...after, fields: [] }).toEqual({ ...before, fields: [] });
  });
});

describe("hideFields", () => {
  it("hides an optional field", () => {
    const result = apply({ hideFields: ["notes"] });
    expect(keys(result.pack)).toEqual(["budget", "area", "size", "timeline", "party"]);
    expect(result.warnings).toEqual([]);
  });

  it("refuses to hide a required field", () => {
    const result = apply({ hideFields: ["budget", "notes"] });
    expect(keys(result.pack)).toContain("budget");
    expect(keys(result.pack)).not.toContain("notes");
    expect(codes(result)).toEqual(["override_required_field"]);
  });

  it("warns about unknown fields and ignores duplicates", () => {
    const result = apply({ hideFields: ["ghost", "notes", "notes"] });
    expect(codes(result)).toEqual(["override_field_unknown"]);
    expect(keys(result.pack)).not.toContain("notes");
  });

  it("ignores a value that is not a list of strings", () => {
    expect(codes(apply({ hideFields: "notes" }))).toEqual(["override_invalid"]);
    const result = apply({ hideFields: [5, "notes"] });
    expect(codes(result)).toEqual(["override_invalid"]);
    expect(keys(result.pack)).not.toContain("notes");
  });

  it("keeps a scoring rule on a hidden field, and warns", () => {
    const result = apply({ hideFields: ["party"] });
    expect(result.pack.scoring.rules.some((r) => r.field === "party")).toBe(true);
    expect(result.warnings).toEqual([expect.objectContaining({ code: "scoring_hidden_field", path: "party" })]);
  });
});

describe("addFields", () => {
  const extra = { key: "pets", label: "Pets", type: "boolean" };

  it("appends new fields after the existing ones, in order", () => {
    const result = apply({ addFields: [extra, { key: "floor", label: "Floor", type: "int" }] });
    expect(keys(result.pack)).toEqual(["budget", "area", "size", "timeline", "party", "notes", "pets", "floor"]);
    expect(result.warnings).toEqual([]);
  });

  it("forces added fields to be optional, with a warning when they asked to be required", () => {
    const result = apply({ addFields: [{ ...extra, required: true }, { key: "floor", label: "Floor", type: "int" }] });
    expect(result.pack.fields.filter((f) => ["pets", "floor"].includes(f.key)).map((f) => f.required)).toEqual([false, false]);
    expect(codes(result)).toEqual(["override_added_field_optional"]);
  });

  it("rejects a key that already exists, including a hidden one and an earlier addition", () => {
    const result = apply({ hideFields: ["notes"], addFields: [{ ...extra, key: "budget" }, { ...extra, key: "notes" }, extra, extra] });
    expect(codes(result)).toEqual(["override_field_exists", "override_field_exists", "override_field_exists"]);
    expect(keys(result.pack).filter((k) => k === "pets")).toHaveLength(1);
  });

  it.each([
    ["a bad key", { key: "Bad Key", label: "x", type: "text" }],
    ["an unknown type", { key: "x", label: "x", type: "date" }],
    ["an enum without options", { key: "x", label: "x", type: "enum" }],
    ["an extra property", { key: "x", label: "x", type: "text", hidden: true }],
    ["a missing label", { key: "x", type: "text" }],
    ["not an object", "x"],
  ])("ignores an added field with %s", (_why, value) => {
    const result = apply({ addFields: [value, extra] });
    expect(codes(result)).toEqual(["override_invalid"]);
    expect(keys(result.pack)).toContain("pets");
    expect(keys(result.pack)).toHaveLength(7);
  });

  it("ignores a value that is not a list", () => {
    expect(codes(apply({ addFields: extra }))).toEqual(["override_invalid"]);
  });
});

describe("reminderOffsets", () => {
  it("changes only the offset, for reminders and for the feedback message", () => {
    const result = apply({ reminderOffsets: { reminder_a_v1: "-2d", feedback_v1: "+3h" } });
    expect(result.pack.reminders[0]).toEqual({ ...base().reminders[0], offset: "-2d" });
    expect(result.pack.reminders[1]).toEqual(base().reminders[1]);
    expect(result.pack.feedback).toEqual({ ...base().feedback, offset: "+3h" });
    expect(result.warnings).toEqual([]);
  });

  it("applies to every reminder with that template", () => {
    const pack = base();
    pack.reminders = [pack.reminders[0], { ...pack.reminders[0], event: "other" }];
    const result = applyOverrides(pack, { reminderOffsets: { reminder_a_v1: "-3d" } });
    expect(result.pack.reminders.map((r) => r.offset)).toEqual(["-3d", "-3d"]);
  });

  it.each(["1h", "soon", "-1", "+d", "", 5, null])("ignores the offset %j", (offset) => {
    const result = apply({ reminderOffsets: { reminder_a_v1: offset } });
    expect(result.pack.reminders[0].offset).toBe("-1d");
    expect(codes(result)).toEqual(["override_invalid"]);
  });

  it("warns about an unknown template", () => {
    expect(codes(apply({ reminderOffsets: { ghost_v1: "-1d" } }))).toEqual(["override_reminder_unknown"]);
    expect(codes(apply({ reminderOffsets: ["x"] }))).toEqual(["override_invalid"]);
  });
});

describe("scoring", () => {
  it("is refused unless the caller allows it, and nothing changes", () => {
    const result = apply({ scoring: { thresholds: { hot: 90 }, weights: { budget: 99 } } });
    expect(result.pack.scoring).toEqual(base().scoring);
    expect(codes(result)).toEqual(["override_not_allowed"]);
  });

  it("changes thresholds when allowed, including a partial change", () => {
    expect(apply({ scoring: { thresholds: { hot: 80, warm: 50 } } }, { allowScoringOverrides: true }).pack.scoring.thresholds).toEqual({ hot: 80, warm: 50 });
    const partial = apply({ scoring: { thresholds: { hot: 90 } } }, { allowScoringOverrides: true });
    expect(partial.pack.scoring.thresholds).toEqual({ hot: 90, warm: 40 });
    expect(partial.warnings).toEqual([]);
  });

  it.each([
    ["hot not above warm", { hot: 40, warm: 40 }],
    ["a partial change that crosses", { warm: 80 }],
    ["a negative number", { hot: -1 }],
    ["a fraction", { hot: 70.5 }],
    ["a string", { hot: "80" }],
    ["an unknown key", { hot: 80, cold: 5 }],
    ["not an object", 5],
  ])("ignores thresholds with %s", (_why, thresholds) => {
    const result = apply({ scoring: { thresholds } }, { allowScoringOverrides: true });
    expect(result.pack.scoring.thresholds).toEqual({ hot: 70, warm: 40 });
    expect(codes(result)).toEqual(["override_invalid"]);
  });

  it("replaces the points of EVERY rule on a field (an assumption to confirm with Raja)", () => {
    const result = apply({ scoring: { weights: { size: 7, budget: 0 } } }, { allowScoringOverrides: true });
    const points = (field: string) => result.pack.scoring.rules.filter((r) => r.field === field).map((r) => r.points);
    expect(points("size")).toEqual([7, 7]);
    expect(points("budget")).toEqual([0]);
    expect(points("timeline")).toEqual([25]);
    expect(result.warnings).toEqual([]);
  });

  it("warns about a weight for a field with no rule, and ignores bad weights", () => {
    const result = apply({ scoring: { weights: { notes: 5, ghost: 5, budget: -1, timeline: 1.5, party: "9", size: 3 } } }, { allowScoringOverrides: true });
    expect(codes(result).sort()).toEqual(["override_invalid", "override_invalid", "override_invalid", "override_scoring_unknown_field", "override_scoring_unknown_field"].sort());
    const points = (field: string) => result.pack.scoring.rules.filter((r) => r.field === field).map((r) => r.points);
    expect(points("size")).toEqual([3, 3]);
    expect(points("budget")).toEqual([30]);
  });

  it("never touches hard fails, even when scoring overrides are allowed", () => {
    const result = apply({ scoring: { hardFails: [], thresholds: { hot: 90 } } }, { allowScoringOverrides: true });
    expect(result.pack.scoring.hardFails).toEqual(base().scoring.hardFails);
    expect(codes(result)).toEqual(["override_not_allowed"]);
    expect(result.pack.scoring.thresholds.hot).toBe(90);
  });

  it("ignores unknown scoring keys and a scoring value that is not an object", () => {
    expect(codes(apply({ scoring: { rules: [] } }, { allowScoringOverrides: true }))).toEqual(["override_unknown_key"]);
    expect(codes(apply({ scoring: "x" }, { allowScoringOverrides: true }))).toEqual(["override_invalid"]);
  });
});

describe("parts of the pack that cannot be overridden", () => {
  it.each(["key", "version", "fields", "bookingModes", "bookingType", "templates", "handoffTriggers", "kbStarter", "extraGuardrails", "reminders", "feedback", "catalog", "hardFails", "required"])(
    "refuses %s and changes nothing",
    (key) => {
      const result = apply({ [key]: "x" });
      expect(result.pack).toEqual(base());
      expect(codes(result)).toEqual(["override_not_allowed"]);
    },
  );

  it("warns about unknown keys", () => {
    const result = apply({ colour: "red" });
    expect(result.pack).toEqual(base());
    expect(result.warnings).toEqual([expect.objectContaining({ code: "override_unknown_key", path: "colour" })]);
  });
});

describe("combined behaviour", () => {
  it("applies the valid parts even when another part is invalid", () => {
    const result = apply({ labels: { budget: "B" }, hideFields: 5, reminderOffsets: { reminder_a_v1: "-3d" } });
    expect(labelOf(result.pack, "budget")).toBe("B");
    expect(result.pack.reminders[0].offset).toBe("-3d");
    expect(codes(result)).toEqual(["override_invalid"]);
  });

  it("applies the parts in a fixed order: labels, hide, add, reminders, scoring", () => {
    const result = apply(
      { scoring: { thresholds: { hot: 90 } }, addFields: [{ key: "notes", label: "N", type: "text" }, { key: "pets", label: "P", type: "text" }], hideFields: ["notes"], labels: { notes: "Renamed" } },
      { allowScoringOverrides: true },
    );
    // labels ran first (notes still existed), hide ran next, then add found the hidden key taken.
    expect(keys(result.pack)).toEqual(["budget", "area", "size", "timeline", "party", "pets"]);
    expect(codes(result)).toEqual(["override_field_exists"]);
    expect(result.pack.scoring.thresholds.hot).toBe(90);
  });

  it("does not change the pack or the overrides it was given", () => {
    const pack = deepFreeze(base());
    const overrides = deepFreeze({
      labels: { budget: "B" },
      hideFields: ["notes"],
      addFields: [{ key: "pets", label: "Pets", type: "boolean", required: true }],
      reminderOffsets: { reminder_a_v1: "-2d", feedback_v1: "+2d" },
      scoring: { thresholds: { hot: 80 }, weights: { size: 1 } },
    });
    expect(() => applyOverrides(pack, overrides, { allowScoringOverrides: true })).not.toThrow();
    expect(pack).toEqual(base());
  });

  it("is repeatable: the same overrides on the result change nothing more", () => {
    const overrides = { labels: { budget: "B" }, hideFields: ["notes"], addFields: [{ key: "pets", label: "Pets", type: "boolean" }], reminderOffsets: { reminder_a_v1: "-2d" } };
    const once = apply(overrides).pack;
    const twice = applyOverrides(once, overrides, {}).pack;
    expect(twice).toEqual(once);
  });

  it("never changes a required flag on an existing field, and never changes hard fails", () => {
    const result = apply({ labels: { budget: "B" }, hideFields: ["notes"], addFields: [{ key: "pets", label: "Pets", type: "text", required: true }] });
    for (const key of ["budget", "area", "timeline"]) {
      expect(result.pack.fields.find((f) => f.key === key)?.required).toBe(true);
    }
    expect(result.pack.scoring.hardFails).toEqual(base().scoring.hardFails);
  });
});

describe("warnings carry identifiers only", () => {
  it("never repeat tenant text, and replace odd keys with 'unknown'", () => {
    const result = apply({
      labels: { budget: "", ghost: "TENANT-SECRET-LABEL", "weird key <b>": "x" },
      "unknown key !": "TENANT-SECRET-VALUE",
      hideFields: ["TENANT SECRET FIELD"],
    });
    const text = JSON.stringify(result.warnings);
    expect(text).not.toMatch(/TENANT/);
    expect(result.warnings.length).toBeGreaterThan(0);
    for (const w of result.warnings) {
      expect(w.detail.length).toBeGreaterThan(0);
      if (w.path) expect(w.path).toMatch(/^[A-Za-z0-9_.-]{1,64}$/);
    }
  });
});
