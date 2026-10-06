import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PackDefinition } from "@pakka/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fileSource, loadPack, PackError, resolvePack, type PackSource } from "./load";
import { deepFreeze, samplePack } from "./test-packs";
import { formatWarning } from "./warnings";

const codes = (loaded: { warnings: { code: string }[] }) => loaded.warnings.map((w) => w.code);
const sourceOf = (raw: unknown): PackSource & { get: ReturnType<typeof vi.fn> } => ({ get: vi.fn(async () => raw) });
const failure = (fn: () => unknown): PackError => {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(PackError);
    return e as PackError;
  }
  throw new Error("expected PackError");
};

describe("resolvePack", () => {
  it("validates the pack, applies defaults and builds the field schema", () => {
    const loaded = resolvePack(samplePack());
    expect(loaded.pack).toEqual({ ...PackDefinition.parse(samplePack()), bookingModes: ["slot"] });
    expect(loaded.warnings).toEqual([]);
    expect(loaded.fieldSchema.parse({ budget: "50L", size: "large", party: "4", ignored: 1 })).toEqual({
      budget: "50L",
      size: "large",
      party: 4,
    });
  });

  it("applies the defaults of the pack format", () => {
    const raw: Record<string, unknown> = samplePack();
    for (const key of ["reminders", "handoffTriggers", "templates", "kbStarter", "extraGuardrails"]) delete raw[key];
    const loaded = resolvePack({ ...raw, scoring: { rules: [], thresholds: { hot: 70, warm: 40 } } });
    expect(loaded.pack).toMatchObject({ reminders: [], handoffTriggers: [], templates: [], kbStarter: [], extraGuardrails: [] });
    expect(loaded.pack.scoring.hardFails).toEqual([]);
  });

  it.each([
    ["null", null],
    ["a string", "pack"],
    ["an array", []],
    ["an empty object", {}],
    ["a bad key", samplePack({ key: "Sample Pack" })],
    ["version 0", samplePack({ version: 0 })],
    ["no fields", samplePack({ fields: [] })],
    ["an unknown field type", samplePack({ fields: [{ key: "x", label: "x", type: "date" }] })],
    ["hot not above warm", samplePack({ scoring: { rules: [], thresholds: { hot: 10, warm: 10 } } })],
    ["a bad reminder offset", samplePack({ reminders: [{ event: "e", anchor: "start", offset: "1h", template: "t" }] })],
  ])("throws invalid_pack for %s, with paths and no values", (_why, raw) => {
    const error = failure(() => resolvePack(raw));
    expect(error.code).toBe("invalid_pack");
    expect(error.issues?.length).toBeGreaterThan(0);
    for (const issue of error.issues ?? []) {
      expect(typeof issue.path).toBe("string");
      expect(typeof issue.message).toBe("string");
    }
  });

  it("does not put the pack's content in the error", () => {
    const error = failure(() => resolvePack(samplePack({ fields: [{ key: "x", label: "PACK-TEXT-MARKER", type: "date" }] })));
    expect(JSON.stringify([error.message, error.issues])).not.toContain("PACK-TEXT-MARKER");
  });

  describe("bookingType and bookingModes", () => {
    it("uses bookingModes when only that is given, with no warning", () => {
      const loaded = resolvePack(samplePack({ bookingModes: ["site_visit", "callback"] }));
      expect(loaded.pack.bookingModes).toEqual(["site_visit", "callback"]);
      expect(loaded.warnings).toEqual([]);
    });

    it("derives bookingModes from bookingType, with a warning", () => {
      const loaded = resolvePack(samplePack({ bookingModes: undefined, bookingType: "site_visit" }));
      expect(loaded.pack.bookingModes).toEqual(["site_visit"]);
      expect(codes(loaded)).toEqual(["booking_type_derived"]);
    });

    it("gives no modes and a warning for an unknown bookingType", () => {
      const loaded = resolvePack(samplePack({ bookingModes: undefined, bookingType: "walk_in" }));
      expect(loaded.pack.bookingModes).toEqual([]);
      expect(codes(loaded)).toEqual(["booking_type_unknown"]);
    });

    it("accepts both when they agree", () => {
      const loaded = resolvePack(samplePack({ bookingModes: ["slot", "callback"], bookingType: "slot" }));
      expect(loaded.pack.bookingModes).toEqual(["slot", "callback"]);
      expect(loaded.warnings).toEqual([]);
    });

    it("lets bookingModes win when they disagree, with a warning", () => {
      const loaded = resolvePack(samplePack({ bookingModes: ["slot"], bookingType: "site_visit" }));
      expect(loaded.pack.bookingModes).toEqual(["slot"]);
      expect(codes(loaded)).toEqual(["booking_type_mismatch"]);
    });

    it("warns when there is neither", () => {
      const loaded = resolvePack(samplePack({ bookingModes: undefined }));
      expect(loaded.pack.bookingModes).toEqual([]);
      expect(codes(loaded)).toEqual(["booking_mode_missing"]);
    });
  });

  describe("scoring fields the pack does not declare", () => {
    const pack = samplePack({
      scoring: {
        rules: [
          { field: "budget", match: "within_band", points: 30 },
          { field: "decision_maker", equals: true, points: 10 },
        ],
        thresholds: { hot: 70, warm: 40 },
        hardFails: [{ field: "ghost_field", below: 1 }],
      },
    });

    it("warns, does not fail, and still loads the pack", () => {
      const loaded = resolvePack(pack);
      expect(loaded.warnings).toEqual([
        expect.objectContaining({ code: "scoring_unknown_field", path: "scoring.rules.1.field" }),
        expect.objectContaining({ code: "hard_fail_unknown_field", path: "scoring.hardFails.0.field" }),
      ]);
      expect(loaded.pack.scoring.rules).toHaveLength(2);
    });

    it("checks against the fields the pack declares, not the ones a tenant added", () => {
      const loaded = resolvePack(pack, { addFields: [{ key: "decision_maker", label: "Decision maker", type: "boolean" }] });
      expect(codes(loaded)).toContain("scoring_unknown_field");
    });
  });

  describe("overrides", () => {
    it("merges them, and puts the pack's warnings before the overrides' warnings", () => {
      const loaded = resolvePack(samplePack({ bookingModes: undefined, bookingType: "slot" }), { labels: { budget: "B", ghost: "x" } });
      expect(loaded.pack.fields[0].label).toBe("B");
      expect(codes(loaded)).toEqual(["booking_type_derived", "override_field_unknown"]);
    });

    it("builds the field schema from the merged fields", () => {
      const loaded = resolvePack(samplePack(), { hideFields: ["notes"], addFields: [{ key: "pets", label: "Pets", type: "boolean" }] });
      expect(loaded.fieldSchema.parse({ notes: "x", pets: "true" })).toEqual({ pets: true });
    });

    it("passes allowScoringOverrides through", () => {
      const overrides = { scoring: { thresholds: { hot: 90 } } };
      expect(codes(resolvePack(samplePack(), overrides))).toEqual(["override_not_allowed"]);
      expect(resolvePack(samplePack(), overrides, { allowScoringOverrides: true }).pack.scoring.thresholds.hot).toBe(90);
    });

    it("never throws for bad overrides", () => {
      for (const bad of ["x", 5, [], { labels: 5 }, { hideFields: { a: 1 } }, { addFields: "x" }, { scoring: null }]) {
        expect(() => resolvePack(samplePack(), bad, { allowScoringOverrides: true })).not.toThrow();
      }
    });
  });

  it("does not change its input and gives the same result twice", () => {
    const raw = deepFreeze(samplePack());
    const overrides = deepFreeze({ labels: { budget: "B" }, hideFields: ["notes"] });
    const a = resolvePack(raw, overrides);
    const b = resolvePack(raw, overrides);
    expect(a.pack).toEqual(b.pack);
    expect(a.warnings).toEqual(b.warnings);
  });

  it("returns a pack that does not share objects with the input", () => {
    const raw = samplePack();
    const loaded = resolvePack(raw);
    loaded.pack.fields[0].label = "changed";
    expect(raw.fields[0].label).toBe("Budget");
  });
});

describe("loadPack", () => {
  it("asks the source for the key and version and returns the resolved pack", async () => {
    const source = sourceOf(samplePack());
    const loaded = await loadPack(source, "sample-pack", 1);
    expect(source.get).toHaveBeenCalledWith("sample-pack", 1);
    expect(loaded.pack.key).toBe("sample-pack");
    expect(loaded.warnings).toEqual([]);
  });

  it("applies overrides and the scoring option", async () => {
    const loaded = await loadPack(sourceOf(samplePack()), "sample-pack", 1, {
      overrides: { labels: { budget: "B" }, scoring: { thresholds: { hot: 90 } } },
      allowScoringOverrides: true,
    });
    expect(loaded.pack.fields[0].label).toBe("B");
    expect(loaded.pack.scoring.thresholds.hot).toBe(90);
  });

  it("throws not_found when the source has no such pack", async () => {
    await expect(loadPack(sourceOf(null), "sample-pack", 1)).rejects.toMatchObject({ name: "PackError", code: "not_found" });
  });

  it("throws version_mismatch when the pack has another version", async () => {
    await expect(loadPack(sourceOf(samplePack({ version: 2 })), "sample-pack", 1)).rejects.toMatchObject({ code: "version_mismatch" });
  });

  it("throws invalid_pack when the pack has another key", async () => {
    await expect(loadPack(sourceOf(samplePack({ key: "other-pack" })), "sample-pack", 1)).rejects.toMatchObject({ code: "invalid_pack" });
  });

  it("throws invalid_pack for a pack that does not validate", async () => {
    await expect(loadPack(sourceOf({ key: "sample-pack", version: 1 }), "sample-pack", 1)).rejects.toMatchObject({ code: "invalid_pack" });
  });
});

describe("fileSource", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "packs-test-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("reads <dir>/<key>.json", async () => {
    await writeFile(join(dir, "sample-pack.json"), JSON.stringify(samplePack()));
    const loaded = await loadPack(fileSource(dir), "sample-pack", 1);
    expect(loaded.pack.label).toBe("Sample pack");
  });

  it("returns null for a missing file", async () => {
    expect(await fileSource(dir).get("missing-pack", 1)).toBeNull();
    await expect(loadPack(fileSource(dir), "missing-pack", 1)).rejects.toMatchObject({ code: "not_found" });
  });

  it("refuses a key that could leave the folder", async () => {
    await mkdir(join(dir, "inner"));
    await writeFile(join(dir, "secret.json"), JSON.stringify(samplePack()));
    for (const key of ["../secret", "inner/../secret", "..\\secret", "/etc/passwd", "a b", "", "Sample"]) {
      expect(await fileSource(join(dir, "inner")).get(key, 1)).toBeNull();
    }
  });

  it("throws invalid_pack for a file that is not JSON", async () => {
    await writeFile(join(dir, "broken-pack.json"), "{not json");
    await expect(fileSource(dir).get("broken-pack", 1)).rejects.toMatchObject({ code: "invalid_pack" });
  });

  it("reports a version mismatch through loadPack", async () => {
    await writeFile(join(dir, "sample-pack.json"), JSON.stringify(samplePack({ version: 3 })));
    await expect(loadPack(fileSource(dir), "sample-pack", 1)).rejects.toMatchObject({ code: "version_mismatch" });
  });
});

describe("formatWarning", () => {
  it("makes one fixed line from the code, the identifier and a fixed detail", () => {
    const loaded = resolvePack(samplePack(), { labels: { ghost: "TENANT-TEXT" } });
    const lines = loaded.warnings.map(formatWarning);
    expect(lines).toEqual(["pack warning override_field_unknown (ghost): override names a field the pack does not have"]);
    expect(lines.join("\n")).not.toContain("TENANT-TEXT");
  });
});
