import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
const embedQuery = vi.fn();
const signals: AbortSignal[] = [];
// Like postgrest's builder: awaitable, and `.abortSignal(signal)` returns it again.
vi.mock("../lib/supabase-admin", () => ({
  supabaseAdmin: () => ({
    rpc: (...args: unknown[]) =>
      Object.assign(rpc(...args), {
        abortSignal(signal: AbortSignal) {
          signals.push(signal);
          return rpc.mock.results.at(-1)?.value;
        },
      }),
  }),
}));
vi.mock("./embeddings", () => ({ embeddingsClient: () => ({ embedQuery }) }));

const { retrieveKb, KB_MIN_SIMILARITY, KB_RPC_TIMEOUT_MS } = await import("./retrieve");

// Isolation and ready-only are enforced inside match_kb_chunks and tested in
// supabase/tests/knowledge_base.test.sql (pnpm db:test). These tests mock the RPC and cover what the
// app adds: passing the tenant through, embedding the query, and the similarity threshold.

const TENANT_A = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const TENANT_B = "d0000000-0000-0000-0000-000000000001";
const QUERY_VECTOR = [0.1, 0.2, 0.3];

const row = (similarity: number, id = "c1") => ({
  chunk_id: id,
  document_id: `doc-${id}`,
  title: "Price list",
  content: `content ${id}`,
  similarity,
});

afterEach(() => vi.useRealTimers());

beforeEach(() => {
  signals.length = 0;
  rpc.mockReset();
  embedQuery.mockReset();
  embedQuery.mockResolvedValue(QUERY_VECTOR);
  rpc.mockResolvedValue({ data: [], error: null });
});

describe("retrieveKb", () => {
  it("embeds the query and calls match_kb_chunks with the tenant it was given", async () => {
    await retrieveKb(TENANT_A, "what are your hours?", 3);
    expect(embedQuery).toHaveBeenCalledWith("what are your hours?");
    expect(rpc).toHaveBeenCalledWith("match_kb_chunks", {
      p_tenant_id: TENANT_A,
      p_query: JSON.stringify(QUERY_VECTOR),
      p_k: 3,
    });
  });

  it("passes the tenant through for each call, never a stale one", async () => {
    await retrieveKb(TENANT_A, "hours");
    await retrieveKb(TENANT_B, "hours");
    expect(rpc.mock.calls.map(([, args]) => args.p_tenant_id)).toEqual([TENANT_A, TENANT_B]);
  });

  it("defaults k to 5 and keeps it between 1 and 50", async () => {
    await retrieveKb(TENANT_A, "hours");
    await retrieveKb(TENANT_A, "hours", 0);
    await retrieveKb(TENANT_A, "hours", 500);
    expect(rpc.mock.calls.map(([, args]) => args.p_k)).toEqual([5, 1, 50]);
  });

  it("returns camelCase results, most similar first, keeping rows at or above the threshold", async () => {
    rpc.mockResolvedValue({ data: [row(0.9, "a"), row(KB_MIN_SIMILARITY, "b"), row(KB_MIN_SIMILARITY - 0.01, "c"), row(0.1, "d")], error: null });
    const result = await retrieveKb(TENANT_A, "hours");
    expect(result.map((r) => r.chunkId)).toEqual(["a", "b"]);
    expect(result[0]).toEqual({ chunkId: "a", documentId: "doc-a", title: "Price list", content: "content a", similarity: 0.9 });
  });

  it("returns [] when every match is below the threshold", async () => {
    rpc.mockResolvedValue({ data: [row(0.2), row(0.3, "c2")], error: null });
    await expect(retrieveKb(TENANT_A, "hours")).resolves.toEqual([]);
  });

  it("returns [] when the RPC returns nothing, including null", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    await expect(retrieveKb(TENANT_A, "hours")).resolves.toEqual([]);
    rpc.mockResolvedValue({ data: null, error: null });
    await expect(retrieveKb(TENANT_A, "hours")).resolves.toEqual([]);
  });

  it("returns [] for an empty or blank query without embedding or querying", async () => {
    await expect(retrieveKb(TENANT_A, "")).resolves.toEqual([]);
    await expect(retrieveKb(TENANT_A, "   \n")).resolves.toEqual([]);
    expect(embedQuery).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses a tenant id that isn't a UUID before touching the provider or the database", async () => {
    await expect(retrieveKb("", "hours")).rejects.toThrow();
    await expect(retrieveKb("not-a-uuid", "hours")).rejects.toThrow();
    expect(embedQuery).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("surfaces an RPC error without the query text in the message", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    const error = await retrieveKb(TENANT_A, "my secret question").catch((e: unknown) => e);
    expect((error as Error).message).toContain("match_kb_chunks failed");
    expect((error as Error).message).not.toContain("my secret question");
  });

  it("rejects rows that don't have the expected shape", async () => {
    rpc.mockResolvedValue({ data: [{ chunk_id: "c1" }], error: null });
    await expect(retrieveKb(TENANT_A, "hours")).rejects.toThrow();
  });

  describe("diagnosis", () => {
    it("logs the Postgres error code of a failed search, never its message or the question", async () => {
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      rpc.mockResolvedValue({ data: null, error: { message: "boom my secret question", code: "57014" } });
      await retrieveKb(TENANT_A, "my secret question").catch(() => undefined);
      const logged = log.mock.calls.flat().join("\n");
      expect(logged).toContain("57014");
      expect(logged).not.toContain("boom");
      expect(logged).not.toContain("secret");
      log.mockRestore();
    });

    it("logs the class of a thrown error (a config or network problem), not its text", async () => {
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      rpc.mockImplementation(() => {
        throw new TypeError("fetch failed for my secret question");
      });
      await retrieveKb(TENANT_A, "my secret question").catch(() => undefined);
      const logged = log.mock.calls.flat().join("\n");
      expect(logged).toContain("TypeError");
      expect(logged).not.toContain("secret");
      log.mockRestore();
    });
  });

  describe("database timeout", () => {
    it("allows the search 5 seconds", () => {
      expect(KB_RPC_TIMEOUT_MS).toBe(5000);
    });

    it("sends an abort signal with the search and leaves no timer behind", async () => {
      vi.useFakeTimers();
      await retrieveKb(TENANT_A, "hours");
      expect(signals).toHaveLength(1);
      expect(signals[0].aborted).toBe(false);
      expect(vi.getTimerCount()).toBe(0);
    });

    it("stops waiting for a search that never answers, aborts it, and does not put the question in the error", async () => {
      vi.useFakeTimers();
      rpc.mockReturnValue(new Promise(() => {}));
      const caught = retrieveKb(TENANT_A, "my secret question").catch((e: unknown) => e);
      await vi.advanceTimersByTimeAsync(KB_RPC_TIMEOUT_MS - 1);
      expect(signals[0].aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      const error = await caught;
      expect(signals[0].aborted).toBe(true);
      expect((error as Error).message).toContain("match_kb_chunks");
      expect((error as Error).message).not.toContain("my secret question");
    });

    it("does not retry a search that failed: the caller decides", async () => {
      rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
      await expect(retrieveKb(TENANT_A, "hours")).rejects.toThrow();
      expect(rpc).toHaveBeenCalledTimes(1);
    });
  });

  it("starts with a provisional threshold of 0.45", () => {
    expect(KB_MIN_SIMILARITY).toBe(0.45);
  });
});
