import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "../../lib/supabase-admin";
import { TimeoutError, withTimeout } from "../../lib/timeout";
import type { PackSource } from "./load";
import { PackStoreError, type PackStore } from "./sync";

// vertical_packs through the service-role client. The table is a global catalogue with no tenant_id.
// Failures carry the Postgres code or HTTP status only: the message can hold hosts or values.

// Postgres codes that mean the database was unreachable, restarting or overloaded, so a retry can work:
// connection (08), out of memory and too many connections (53200, 53300), shutting down or starting up
// (57P01-03), statement timeout (57014), serialization and deadlock (40001, 40P01), PostgREST cannot reach
// the database (PGRST000-003). Everything else (permission, missing table, bad data, disk full) is a refusal.
const TRANSIENT_CODE = /^(08.{3}|53[23]00|57P0[123]|57014|40001|40P01|PGRST00[0-3])$/;
// Without a Postgres code, the HTTP status decides, as for any API: no answer at all (0, or none), 408, 425,
// 429 and 5xx can be retried; any other 4xx (a wrong URL, a rejected key) is a refusal that waiting cannot fix.
const isTransient = (code: string | undefined, status: number | undefined) => {
  if (status !== undefined && (status === 408 || status === 425 || status === 429 || status >= 500)) return true;
  if (code !== undefined && code !== "") return TRANSIENT_CODE.test(code);
  return status === undefined || status === 0 || status < 400;
};

/** One call to the database. Longer than this and it is treated as an unreachable database, which is retried. */
export const PACK_STORE_TIMEOUT_MS = 5000;

const failed = (what: string, error: { code?: string; status?: number }, status: number | undefined) => {
  const httpStatus = status ?? error.status;
  const token = error.code ? error.code : httpStatus ? `http_${httpStatus}` : "unknown";
  return new PackStoreError(
    `The pack store ${what} (database error ${error.code || "none"}${httpStatus ? `, HTTP ${httpStatus}` : ""}).`,
    isTransient(error.code, httpStatus),
    token,
  );
};

/**
 * Runs one query with a deadline; a timeout is a transient store failure (fixed words). The call is not
 * cancelled: withTimeout keeps a late failure from becoming an unhandled rejection, and a retry that runs
 * beside a call that did reach the database is safe, because the insert is ON CONFLICT DO NOTHING.
 */
async function timed<T>(what: string, ms: number, run: () => PromiseLike<T>): Promise<T> {
  try {
    return await withTimeout(run, ms);
  } catch (error) {
    if (error instanceof TimeoutError) throw new PackStoreError(`The pack store ${what} (timed out).`, true, "timeout");
    throw error;
  }
}

export function createPackStore(db: SupabaseClient = supabaseAdmin(), { timeoutMs = PACK_STORE_TIMEOUT_MS }: { timeoutMs?: number } = {}): PackStore {
  return {
    async insertIfAbsent(row) {
      // ON CONFLICT (key, version) DO NOTHING: only a row that really went in comes back.
      const { data, error, status } = await timed("did not answer the write", timeoutMs, () =>
        db.from("vertical_packs").upsert(row, { onConflict: "key,version", ignoreDuplicates: true }).select("key"),
      );
      if (error) throw failed("refused the write", error, status);
      return Array.isArray(data) && data.length > 0;
    },

    async get(key, version) {
      const { data, error, status } = await timed("did not answer the read", timeoutMs, () =>
        db.from("vertical_packs").select("definition").eq("key", key).eq("version", version).maybeSingle(),
      );
      if (error) throw failed("could not be read", error, status);
      return (data as { definition?: unknown } | null)?.definition ?? null;
    },
  };
}

/** A PackSource for loadPack: the definition of one (key, version), or null. */
export function createDbPackSource(db?: SupabaseClient): PackSource {
  const store = createPackStore(db);
  return { get: (key, version) => store.get(key, version) };
}
