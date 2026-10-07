import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "../../lib/supabase-admin";
import type { PackSource } from "./load";
import { PackSyncError, type PackStore } from "./sync";

// vertical_packs through the service-role client. The table is a global catalogue with no tenant_id.
// Failures carry the Postgres error code only: the message can hold hosts or values.

const failed = (what: string, code: string | undefined) => new PackSyncError(`The pack store ${what} (database error ${code ?? "unknown"}).`);

export function createPackStore(db: SupabaseClient = supabaseAdmin()): PackStore {
  return {
    async insertIfAbsent(row) {
      // ON CONFLICT (key, version) DO NOTHING: only a row that really went in comes back.
      const { data, error } = await db
        .from("vertical_packs")
        .upsert(row, { onConflict: "key,version", ignoreDuplicates: true })
        .select("key");
      if (error) throw failed("refused the write", error.code);
      return Array.isArray(data) && data.length > 0;
    },

    async get(key, version) {
      const { data, error } = await db.from("vertical_packs").select("definition").eq("key", key).eq("version", version).maybeSingle();
      if (error) throw failed("could not be read", error.code);
      return (data as { definition?: unknown } | null)?.definition ?? null;
    },
  };
}

/** A PackSource for loadPack: the definition of one (key, version), or null. */
export function createDbPackSource(db?: SupabaseClient): PackSource {
  const store = createPackStore(db);
  return { get: (key, version) => store.get(key, version) };
}
