import type { SupabaseClient } from "@supabase/supabase-js";

export interface FakeResponse {
  data: unknown;
  error: { code?: string; message: string } | null;
}

/**
 * A minimal stand-in for the Supabase query builder: every chained call records itself and the
 * chain resolves to the canned response for its table. Enough for the services' read queries.
 */
export function fakeSupabase(responses: Record<string, FakeResponse>) {
  const calls: { table: string; method: string; args: unknown[] }[] = [];
  const client = {
    from(table: string) {
      const response = responses[table] ?? { data: null, error: { code: "PGRST205", message: "missing" } };
      const builder: Record<string, unknown> = {};
      for (const method of ["select", "eq", "in", "order", "limit", "returns"]) {
        builder[method] = (...args: unknown[]) => {
          calls.push({ table, method, args });
          return builder;
        };
      }
      builder.then = (resolve: (v: FakeResponse) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve(response).then(resolve, reject);
      return builder;
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}
