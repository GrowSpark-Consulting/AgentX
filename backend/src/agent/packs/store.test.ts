import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { createDbPackSource, createPackStore } from "./store";
import { PackSyncError } from "./sync";

// The real store talks to vertical_packs through the Supabase client. Here the client is a recorder that
// answers with what the test says, so what is sent can be checked without a database.

type Answer = { data?: unknown; error?: { code?: string; message: string } | null };

function fakeClient(answer: Answer) {
  const log: Record<string, unknown>[] = [];
  const result = { data: answer.data ?? null, error: answer.error ?? null };
  const builder = {
    upsert: (row: unknown, options: unknown) => {
      log.push({ op: "upsert", row, options });
      return { select: async (columns: string) => (log.push({ op: "select-after-upsert", columns }), result) };
    },
    select: (columns: string) => {
      const filters: Record<string, unknown> = {};
      log.push({ op: "select", columns, filters });
      const query = {
        eq: (column: string, value: unknown) => ((filters[column] = value), query),
        maybeSingle: async () => result,
      };
      return query;
    },
  };
  const client = { from: (table: string) => (log.push({ op: "from", table }), builder) } as unknown as SupabaseClient;
  return { client, log };
}

const row = { key: "alpha", version: 2, definition: { key: "alpha", version: 2 }, active: true };

describe("createPackStore().insertIfAbsent", () => {
  it("inserts into vertical_packs, ignoring a row that already exists, and says the row went in", async () => {
    const { client, log } = fakeClient({ data: [{ key: "alpha" }] });
    await expect(createPackStore(client).insertIfAbsent(row)).resolves.toBe(true);
    expect(log).toContainEqual({ op: "from", table: "vertical_packs" });
    expect(log).toContainEqual({ op: "upsert", row, options: { onConflict: "key,version", ignoreDuplicates: true } });
  });

  it("says nothing went in when the version already exists", async () => {
    const { client } = fakeClient({ data: [] });
    await expect(createPackStore(client).insertIfAbsent(row)).resolves.toBe(false);
  });

  it("fails with the database's error code only, never its message", async () => {
    const { client } = fakeClient({ error: { code: "42501", message: "permission denied for table vertical_packs (password hunter2)" } });
    const error = await createPackStore(client).insertIfAbsent(row).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PackSyncError);
    expect((error as Error).message).toContain("42501");
    expect((error as Error).message).not.toContain("hunter2");
  });
});

describe("createPackStore().get", () => {
  it("reads the definition of one key and version", async () => {
    const { client, log } = fakeClient({ data: { definition: { key: "alpha" } } });
    await expect(createPackStore(client).get("alpha", 2)).resolves.toEqual({ key: "alpha" });
    expect(log).toContainEqual({ op: "from", table: "vertical_packs" });
    expect(log.find((l) => l.op === "select")).toMatchObject({ columns: "definition", filters: { key: "alpha", version: 2 } });
  });

  it("answers null when there is no such version", async () => {
    const { client } = fakeClient({ data: null });
    await expect(createPackStore(client).get("alpha", 9)).resolves.toBeNull();
  });
});

describe("createDbPackSource", () => {
  it("is a pack source for loadPack: the definition of a key and version, or null", async () => {
    const found = fakeClient({ data: { definition: { key: "alpha", version: 2 } } });
    await expect(createDbPackSource(found.client).get("alpha", 2)).resolves.toEqual({ key: "alpha", version: 2 });
    const missing = fakeClient({ data: null });
    await expect(createDbPackSource(missing.client).get("alpha", 2)).resolves.toBeNull();
  });

  it("fails in fixed words when the database does", async () => {
    const { client } = fakeClient({ error: { code: "08006", message: "connection lost to 10.0.0.5" } });
    const error = await createDbPackSource(client).get("alpha", 1).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PackSyncError);
    expect((error as Error).message).not.toContain("10.0.0.5");
  });
});
