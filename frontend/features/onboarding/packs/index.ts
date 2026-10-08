import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { INDUSTRIES } from "@/features/onboarding/data";

// Which trades the Business step offers. vertical_packs is the source of truth: a trade is offered only
// when its pack (TRIAL_PACKS) has an active row, the same rule create_trial_tenant applies (0006). The
// table is a global catalogue every signed-in user may read (0001); only the key and the pack's label
// are read, never the rest of the definition. The browser still sends the trade key, as before.

/** An active pack: its key, and the name it gives itself (definition.label), if any. */
export interface ActivePack {
  key: string;
  label: string | null;
}

const ActivePackRow = z.object({ key: z.string().min(1), label: z.string().nullable() });

/**
 * The active packs, one per key (a key has a row per version), in the order they were read. Throws
 * when the read fails or returns rows it can't parse: the caller then offers no trade at all.
 */
export async function fetchActivePacks(client: SupabaseClient): Promise<ActivePack[]> {
  const { data, error } = await client.from("vertical_packs").select("key, label:definition->>label").eq("active", true);
  if (error) throw error;
  const packs = new Map<string, ActivePack>();
  for (const row of z.array(ActivePackRow).parse(data)) {
    const label = row.label?.trim() || null;
    const seen = packs.get(row.key);
    if (!seen) packs.set(row.key, { key: row.key, label });
    else if (!seen.label && label) seen.label = label;
  }
  return [...packs.values()];
}

/** A trade the Business step shows: its index in INDUSTRIES (what the wizard stores) and its name. */
export interface OfferedTrade {
  index: number;
  name: string;
}

/**
 * The trades whose pack is active, in INDUSTRIES order and keeping INDUSTRIES indexes. Each is named
 * by its pack's label, or by the trade's own name when the pack has none.
 */
export function offeredTrades(packs: readonly ActivePack[]): OfferedTrade[] {
  const labels = new Map(packs.map((p) => [p.key, p.label]));
  return INDUSTRIES.flatMap((industry, index) =>
    industry.packKey && labels.has(industry.packKey)
      ? [{ index, name: labels.get(industry.packKey) || industry.name }]
      : [],
  );
}
