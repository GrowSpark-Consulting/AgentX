import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { BookingMode, PackDefinition } from "@pakka/types";
import type { z } from "zod";
import { buildFieldSchema } from "./field-schema";
import { applyOverrides, type BookingModeName, type OverrideOptions, type ResolvedPack } from "./overrides";
import { warning, type PackWarning } from "./warnings";

// The pack loader (docs/handover.md, "Vertical pack system"): reads a pack by key and version,
// validates it with PackDefinition, merges the tenant's pack_overrides, and generates the Zod schema
// for leads.fields. Everything it notices about the pack or the overrides comes back as warnings; it
// never logs. A broken pack is a deployment error and throws PackError; bad overrides never throw.
//
// Not here yet: reading vertical_packs, storing packs at startup, and the version migration.

export class PackError extends Error {
  constructor(
    readonly code: "not_found" | "invalid_pack" | "version_mismatch",
    message: string,
    /** Where the pack failed validation: paths and Zod's fixed messages, never the pack's own text. */
    readonly issues?: { path: string; message: string }[],
  ) {
    super(message);
    this.name = "PackError";
  }
}

/** Where packs come from. `null` means there is no such pack. */
export interface PackSource {
  get(key: string, version: number): Promise<unknown | null>;
}

export type LoadOptions = OverrideOptions & { overrides?: unknown };
export type LoadedPack = { pack: ResolvedPack; fieldSchema: z.ZodObject; warnings: PackWarning[] };

/** Reads packs/<key>.json. A file holds one version; loadPack checks it is the one asked for. */
export function fileSource(dir: string): PackSource {
  return {
    async get(key: string) {
      if (!/^[a-z][a-z0-9-]*$/.test(key)) return null; // also keeps the path inside `dir`
      let text: string;
      try {
        text = await readFile(join(dir, `${key}.json`), "utf8");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw new PackError("invalid_pack", "pack file could not be read");
      }
      try {
        return JSON.parse(text);
      } catch {
        throw new PackError("invalid_pack", "pack file is not valid JSON", [{ path: "", message: "not valid JSON" }]);
      }
    },
  };
}

function resolveBookingModes(pack: PackDefinition, warnings: PackWarning[]): ResolvedPack {
  const declared = pack.bookingModes ?? [];
  let bookingModes: BookingModeName[] = declared;
  if (declared.length > 0) {
    if (pack.bookingType !== undefined && !declared.some((mode) => mode === pack.bookingType)) {
      warnings.push(warning("booking_type_mismatch"));
    }
  } else if (pack.bookingType !== undefined) {
    const derived = BookingMode.safeParse(pack.bookingType);
    if (derived.success) {
      bookingModes = [derived.data];
      warnings.push(warning("booking_type_derived"));
    } else {
      warnings.push(warning("booking_type_unknown"));
    }
  } else {
    warnings.push(warning("booking_mode_missing"));
  }
  return { ...pack, bookingModes };
}

/** The pure core: validate, resolve booking modes, cross-check scoring, merge overrides, build the schema. */
export function resolvePack(raw: unknown, overrides?: unknown, options: OverrideOptions = {}): LoadedPack {
  const parsed = PackDefinition.safeParse(raw);
  if (!parsed.success) {
    throw new PackError(
      "invalid_pack",
      "pack is invalid",
      parsed.error.issues.map((issue) => ({ path: issue.path.map(String).join("."), message: issue.message })),
    );
  }

  const warnings: PackWarning[] = [];
  const base = resolveBookingModes(parsed.data, warnings);

  // A rule on a field the pack does not declare can never score: report it, do not fail.
  const declared = new Set(base.fields.map((field) => field.key));
  base.scoring.rules.forEach((rule, index) => {
    if (!declared.has(rule.field)) warnings.push(warning("scoring_unknown_field", `scoring.rules.${index}.field`));
  });
  base.scoring.hardFails.forEach((hardFail, index) => {
    if (!declared.has(hardFail.field)) warnings.push(warning("hard_fail_unknown_field", `scoring.hardFails.${index}.field`));
  });

  const merged = applyOverrides(base, overrides, options);
  return {
    pack: merged.pack,
    fieldSchema: buildFieldSchema(merged.pack.fields),
    warnings: [...warnings, ...merged.warnings],
  };
}

export async function loadPack(
  source: PackSource,
  key: string,
  version: number,
  options: LoadOptions = {},
): Promise<LoadedPack> {
  const raw = await source.get(key, version);
  if (raw === null || raw === undefined) throw new PackError("not_found", "pack not found");

  const loaded = resolvePack(raw, options.overrides, options);
  if (loaded.pack.key !== key) {
    throw new PackError("invalid_pack", "pack key does not match", [{ path: "key", message: "does not match the requested key" }]);
  }
  if (loaded.pack.version !== version) throw new PackError("version_mismatch", "pack version does not match");
  return loaded;
}
