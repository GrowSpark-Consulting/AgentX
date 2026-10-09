import type { SupabaseClient } from "@supabase/supabase-js";

type Row = Record<string, unknown>;

/**
 * A stateful stand-in for the three tables conversations/*.ts touch (conversations, messages, audit_logs): it
 * applies .eq() filters like the real thing, so tenant scoping and compare-and-set updates are really tested.
 * Supports select / eq / maybeSingle / update / insert, and nothing else. `beforeUpdate` runs just before an
 * update is applied, to play another writer (the AI's handoff, a second person) winning a race.
 */
export function fakeConversationsDb(seed: { conversations: Row[] }, hooks: { beforeUpdate?: (table: string) => void } = {}) {
  const tables: Record<string, Row[]> = {
    conversations: seed.conversations.map((r) => ({ ...r })),
    messages: [],
    audit_logs: [],
  };
  const failures = new Set<string>();

  function from(name: string) {
    const rows = tables[name];
    const filters: [string, unknown][] = [];
    let patch: Row | null = null;
    let inserted: Row | null = null;
    const match = () => rows.filter((r) => filters.every(([k, v]) => r[k] === v));
    const run = (): { data: unknown; error: { message: string } | null } => {
      if (failures.has(name)) return { data: null, error: { message: `${name} is down` } };
      if (inserted) {
        rows.push({ ...inserted });
        return { data: null, error: null };
      }
      if (patch) {
        hooks.beforeUpdate?.(name);
        const hit = match();
        for (const r of hit) Object.assign(r, patch);
        return { data: hit.map((r) => ({ id: r.id })), error: null };
      }
      return { data: match().map((r) => ({ ...r })), error: null };
    };
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: (k: string, v: unknown) => (filters.push([k, v]), builder),
      update: (p: Row) => ((patch = p), builder),
      insert: (r: Row) => ((inserted = r), builder),
      maybeSingle: async () => {
        const out = run();
        return { data: Array.isArray(out.data) ? (out.data[0] ?? null) : out.data, error: out.error };
      },
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => Promise.resolve(run()).then(resolve, reject),
    };
    return builder;
  }

  return {
    db: { from } as unknown as SupabaseClient,
    tables,
    /** Make every call on this table fail. */
    fail: (table: string) => void failures.add(table),
  };
}
