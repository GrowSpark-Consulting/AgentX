import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { createDbPackSource, createPackStore } from "./store";
import { PackStoreError, PackSyncError } from "./sync";

// The real store talks to vertical_packs through the Supabase client. Here the client is a recorder that
// answers with what the test says, so what is sent can be checked without a database.

type Answer = { data?: unknown; error?: { code?: string; message: string } | null; status?: number };

function fakeClient(answer: Answer) {
  const log: Record<string, unknown>[] = [];
  const result = { data: answer.data ?? null, error: answer.error ?? null, status: answer.status };
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

describe("which database errors are worth waiting for", () => {
  const failure = async (code: string | undefined, status?: number) => {
    const { client } = fakeClient({ error: { code, message: "x" }, status });
    const error = await createPackStore(client).insertIfAbsent(row).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PackStoreError);
    return error as PackStoreError;
  };
  const transientOf = async (code: string | undefined, status?: number) => (await failure(code, status)).transient;

  it.each(["08006", "08001", "53200", "53300", "57P01", "57P03", "57014", "40001", "40P01", "PGRST000", "PGRST002"])(
    "the Postgres code %s is transient",
    async (code) => expect(await transientOf(code, 400)).toBe(true),
  );

  it.each(["42501", "42P01", "23505", "22P02", "PGRST301", "P0001", "53100"])("the Postgres code %s is not", async (code) =>
    expect(await transientOf(code, 400)).toBe(false),
  );

  it("no code and no status (the request never got an answer) is transient", async () => {
    expect(await transientOf(undefined)).toBe(true);
    expect(await transientOf("")).toBe(true);
    expect(await transientOf("", 0)).toBe(true);
  });

  it.each([502, 503, 504, 500, 408, 425, 429])("HTTP %i with no code is transient", async (status) => expect(await transientOf(undefined, status)).toBe(true));

  it.each([400, 401, 403, 404, 405, 422])("HTTP %i with no code is a refusal waiting cannot fix (a wrong URL or a rejected key)", async (status) =>
    expect(await transientOf(undefined, status)).toBe(false),
  );

  it("an overloaded gateway is transient even when the body names a code we do not know", async () => {
    expect(await transientOf("XX000", 503)).toBe(true);
  });

  it("keeps the status in the message and a short fixed token for the log, and nothing the server said", async () => {
    const error = await failure(undefined, 401);
    expect(error.message).toMatch(/HTTP 401/);
    expect(error.code).toBe("http_401");
    expect((await failure("42501", 403)).code).toBe("42501");
    expect((await failure(undefined)).code).toBe("unknown");
    const leaky = fakeClient({ error: { code: undefined, message: "invalid api key sk_secret_123 for 10.0.0.5" }, status: 401 });
    const thrown = (await createPackStore(leaky.client).insertIfAbsent(row).catch((e: unknown) => e)) as Error;
    expect(thrown.message).not.toContain("sk_secret_123");
    expect(thrown.message).not.toContain("10.0.0.5");
  });

  it("the same for reads", async () => {
    const { client } = fakeClient({ error: { code: "08006", message: "x" } });
    const error = await createPackStore(client).get("alpha", 1).catch((e: unknown) => e);
    expect((error as PackStoreError).transient).toBe(true);
  });
});

describe("a store call that never answers", () => {
  it("times out as a transient failure instead of hanging the startup", async () => {
    const never = new Promise<never>(() => undefined);
    const client = { from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => never }) }) }) }) } as unknown as SupabaseClient;
    const error = await createPackStore(client, { timeoutMs: 20 }).get("alpha", 1).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PackStoreError);
    expect((error as PackStoreError).transient).toBe(true);
    expect((error as Error).message).toMatch(/timed out/);
    expect((error as PackStoreError).code).toBe("timeout");
  });

  it("times out an insert the same way", async () => {
    const never = new Promise<never>(() => undefined);
    const client = { from: () => ({ upsert: () => ({ select: () => never }) }) } as unknown as SupabaseClient;
    const error = await createPackStore(client, { timeoutMs: 20 }).insertIfAbsent(row).catch((e: unknown) => e);
    expect((error as PackStoreError).transient).toBe(true);
  });
});
