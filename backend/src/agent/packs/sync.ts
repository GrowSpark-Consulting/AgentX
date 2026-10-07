import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PackError, resolvePack } from "./load";
import type { PackWarning } from "./warnings";

// Reads packs/*.json, validates them, and stores them in vertical_packs by (key, version)
// (docs/handover.md, "Vertical pack system"). Runs when the server starts (a bad pack fails the deploy)
// and as `pnpm packs:sync`. A published version is never changed: a file whose definition differs from
// what is stored for the same (key, version) is refused, and a change needs version N+1.
//
// Safe for several servers starting at once: each pack is inserted only if absent (the table's
// ON CONFLICT DO NOTHING), then what is stored is read back and compared with the file, so any number of
// servers with the same file all succeed and servers with different files for one version cannot both win.
// Errors name files and field paths, never the pack's own text, and never a database error's message.

export class PackSyncError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PackSyncError";
  }
}

/** vertical_packs is a global catalogue (no tenant_id): packs are the same for every business. */
export interface PackStore {
  /** True when the row went in, false when (key, version) already existed. Never overwrites. */
  insertIfAbsent(row: { key: string; version: number; definition: unknown; active: boolean }): Promise<boolean>;
  get(key: string, version: number): Promise<unknown | null>;
}

export type PackFile = { file: string; key: string; version: number; definition: unknown; warnings: PackWarning[] };
export type SyncOutcome = "inserted" | "unchanged";
export type SyncReport = { packs: { key: string; version: number; file: string; outcome: SyncOutcome; warnings: PackWarning[] }[] };

const MAX_ISSUES_PER_FILE = 10;

/** The repo's packs/ folder, found from this file (the server's working directory is backend/, not the repo root). */
export function defaultPacksDir(): string {
  return fileURLToPath(new URL("../../../../packs", import.meta.url));
}

/** Reads and validates every packs/*.json. Everything wrong is reported at once. */
export async function readPackFiles(dir: string): Promise<PackFile[]> {
  let names: string[];
  try {
    names = (await readdir(dir, { withFileTypes: true })).filter((e) => e.isFile() && e.name.endsWith(".json")).map((e) => e.name).sort();
  } catch {
    throw new PackSyncError(`The packs folder could not be read (${dir}). A deploy must include the repo's packs/ folder.`);
  }

  const files: PackFile[] = [];
  const problems: string[] = [];
  for (const file of names) {
    let raw: unknown;
    try {
      raw = JSON.parse(await readFile(join(dir, file), "utf8"));
    } catch {
      problems.push(`${file}: is not valid JSON (or could not be read)`);
      continue;
    }
    try {
      const loaded = resolvePack(raw);
      const stem = file.slice(0, -".json".length);
      if (loaded.pack.key !== stem) {
        problems.push(`${file}: key: must equal the file name ("${stem}")`);
        continue;
      }
      files.push({ file, key: loaded.pack.key, version: loaded.pack.version, definition: raw, warnings: loaded.warnings });
    } catch (error) {
      if (!(error instanceof PackError)) throw error;
      const issues = error.issues ?? [{ path: "", message: error.message }];
      for (const issue of issues.slice(0, MAX_ISSUES_PER_FILE)) problems.push(`${file}: ${issue.path || "(pack)"}: ${issue.message}`);
      if (issues.length > MAX_ISSUES_PER_FILE) problems.push(`${file}: and ${issues.length - MAX_ISSUES_PER_FILE} more`);
    }
  }
  if (problems.length > 0) throw new PackSyncError(`Invalid pack files:\n  - ${problems.join("\n  - ")}`);
  return files;
}

/** Validation only (`pnpm packs:sync --check`): no database. */
export function checkPacks(dir: string): Promise<PackFile[]> {
  return readPackFiles(dir);
}

/** Key order and whitespace do not matter: jsonb does not keep them. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/** The top-level parts that differ, by name only. */
function changedParts(stored: unknown, file: unknown): string[] {
  const a = (stored ?? {}) as Record<string, unknown>;
  const b = (file ?? {}) as Record<string, unknown>;
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => canonical(a[k]) !== canonical(b[k])).sort();
}

export async function syncPacks({ dir, store }: { dir: string; store: PackStore }): Promise<SyncReport> {
  const files = await readPackFiles(dir); // an invalid pack fails here, before the store is touched
  const packs: SyncReport["packs"] = [];
  for (const pack of files) {
    let outcome: SyncOutcome;
    try {
      const inserted = await store.insertIfAbsent({ key: pack.key, version: pack.version, definition: pack.definition, active: true });
      if (inserted) {
        outcome = "inserted";
      } else {
        const stored = await store.get(pack.key, pack.version);
        if (stored === null) throw new PackSyncError(`${pack.file}: version ${pack.version} changed while syncing; start again.`);
        const parts = changedParts(stored, pack.definition);
        if (parts.length > 0) {
          throw new PackSyncError(
            `${pack.file}: version ${pack.version} of "${pack.key}" is already published with a different definition (${parts.join(", ")}). ` +
              `A published version is never changed: set "version": ${pack.version + 1} to publish the change as version ${pack.version + 1}.`,
          );
        }
        outcome = "unchanged";
      }
    } catch (error) {
      if (error instanceof PackSyncError) throw error;
      throw new PackSyncError("The pack store could not be reached or refused the write. Check the database connection and permissions.");
    }
    packs.push({ key: pack.key, version: pack.version, file: pack.file, outcome, warnings: pack.warnings });
  }
  return { packs };
}

/** What is printed after a sync: one line per pack, then any warnings. */
export function formatSyncReport(report: SyncReport): string[] {
  return report.packs.flatMap((p) => [
    `[packs] ${p.key}@${p.version} ${p.outcome}`,
    ...p.warnings.map((w) => `[packs] ${p.key}@${p.version} warning: ${w.code}${w.path ? ` at ${w.path}` : ""}`),
  ]);
}

/** A pack error is fixed text and printed as it is; anything else is reported by its type only. */
export function describeStartupFailure(error: unknown): string {
  if (error instanceof PackSyncError) return error.message;
  return `Pack sync failed unexpectedly (${error instanceof Error ? error.name : "unknown error"}).`;
}
