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

/**
 * The store failed. `transient`: the database was unreachable or restarting, so waiting may fix it; a refusal
 * (missing permission, a bad statement) is not transient and is never retried. The message is fixed text.
 */
export class PackStoreError extends PackSyncError {
  constructor(
    message: string,
    readonly transient: boolean,
    /** What the database or the network said, as a short fixed token: a Postgres code, "http_503", "timeout". Safe to log. */
    readonly code: string = "unknown",
  ) {
    super(message);
    this.name = "PackStoreError";
  }
}

/**
 * Pauses before each retry of a transient store failure, in milliseconds: 35 s of waiting, enough for a
 * database that restarts while a deploy starts (Railway and Supabase often come up at the same moment).
 */
export const PACK_STORE_RETRY_DELAYS_MS: readonly number[] = [1000, 2000, 4000, 8000, 10_000, 10_000];

/**
 * How long after the process started a retry may still begin. Railway's healthcheck allows 60 s from the
 * start; a retry that begins by 40 s ends within about 10 s more (each of its two calls is cut off at 5 s),
 * so the sync gives up, and the deploy fails cleanly, before the healthcheck would. The budget is shared by
 * all packs, as the healthcheck is.
 */
export const PACK_SYNC_BUDGET_MS = 40_000;

export interface SyncRetry {
  /** The pause before each retry; its length is the number of retries. Default PACK_STORE_RETRY_DELAYS_MS. */
  delaysMs?: readonly number[];
  sleep?: (ms: number) => Promise<void>;
  /** The clock for the time budget (tests). */
  now?: () => number;
  /** No retry begins later than this many ms after the process started, whatever delays remain. Default PACK_SYNC_BUDGET_MS. */
  budgetMs?: number;
  /** Time already spent before the sync began (the process's start-up), counted against the budget. Default 0. */
  elapsedBeforeMs?: number;
  /** Called before each wait: which try just failed, why (a short fixed token) and how long the wait is. */
  onRetry?: (info: { attempt: number; delayMs: number; code: string }) => void;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

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
    throw new PackSyncError("The packs folder could not be read. A deploy must include the repo's packs/ folder.");
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

export async function syncPacks({ dir, store, retry = {} }: { dir: string; store: PackStore; retry?: SyncRetry }): Promise<SyncReport> {
  const files = await readPackFiles(dir); // an invalid pack fails here, before the store is touched
  const delays = retry.delaysMs ?? PACK_STORE_RETRY_DELAYS_MS;
  const sleep = retry.sleep ?? defaultSleep;
  const now = retry.now ?? Date.now;
  const budgetMs = retry.budgetMs ?? PACK_SYNC_BUDGET_MS;
  const startedAt = now() - (retry.elapsedBeforeMs ?? 0);
  const packs: SyncReport["packs"] = [];
  for (const pack of files) {
    const outcome = await syncOne(pack, store);
    packs.push({ key: pack.key, version: pack.version, file: pack.file, outcome, warnings: pack.warnings });
  }
  return { packs };

  /**
   * One pack, retried while the store is briefly unavailable; everything else fails at once. The count of tries
   * starts again for each pack; the time budget is shared. A try that timed out may still have reached the
   * database, so the next try can run beside it: that is safe because the insert is ON CONFLICT DO NOTHING.
   */
  async function syncOne(pack: PackFile, target: PackStore): Promise<SyncOutcome> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await storeOne(pack, target);
      } catch (error) {
        // A changed published version, or a refusal waiting cannot fix: no retry.
        if (error instanceof PackSyncError && !(error instanceof PackStoreError && error.transient)) throw error;
        const delayMs = delays[attempt - 1];
        if (attempt > delays.length || now() - startedAt + delayMs > budgetMs) {
          const seconds = Math.max(1, Math.round((now() - startedAt) / 1000));
          throw error instanceof PackStoreError
            ? new PackStoreError(`${error.message} Tried ${attempt} times; gave up ${seconds} seconds after the server started.`, true, error.code)
            : new PackSyncError("The pack store could not be reached or refused the write. Check the database connection and permissions.");
        }
        retry.onRetry?.({ attempt, delayMs, code: error instanceof PackStoreError ? error.code : "unknown" });
        await sleep(delayMs);
      }
    }
  }
}

async function storeOne(pack: PackFile, store: PackStore): Promise<SyncOutcome> {
  // A retry after an insert whose answer was lost finds the row already there and compares it, which is correct.
  const inserted = await store.insertIfAbsent({ key: pack.key, version: pack.version, definition: pack.definition, active: true });
  if (inserted) return "inserted";
  const stored = await store.get(pack.key, pack.version);
  if (stored === null) throw new PackSyncError(`${pack.file}: version ${pack.version} changed while syncing; start again.`);
  const parts = changedParts(stored, pack.definition);
  if (parts.length > 0) {
    throw new PackSyncError(
      `${pack.file}: version ${pack.version} of "${pack.key}" is already published with a different definition (${parts.join(", ")}). ` +
        `A published version is never changed: set "version": ${pack.version + 1} to publish the change as version ${pack.version + 1}.`,
    );
  }
  return "unchanged";
}

/** What is printed after a sync: one line per pack, then any warnings. */
export function formatSyncReport(report: SyncReport): string[] {
  return report.packs.flatMap((p) => [
    `[packs] ${p.key}@${p.version} ${p.outcome}`,
    ...p.warnings.map((w) => `[packs] ${p.key}@${p.version} warning: ${w.code}${w.path ? ` at ${w.path}` : ""}`),
  ]);
}

/** The line printed before each wait: the try number, why (a fixed token) and the wait. */
export function formatRetry({ attempt, delayMs, code }: { attempt: number; delayMs: number; code: string }): string {
  return `[packs] the pack store is unavailable (try ${attempt}, ${code}); trying again in ${Math.round(delayMs / 1000)}s`;
}

/** A pack error is fixed text and printed as it is; anything else is reported by its type only. */
export function describeStartupFailure(error: unknown): string {
  if (error instanceof PackSyncError) return error.message;
  return `Pack sync failed unexpectedly (${error instanceof Error ? error.name : "unknown error"}).`;
}
