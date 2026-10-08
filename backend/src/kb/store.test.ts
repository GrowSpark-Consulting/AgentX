import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../lib/errors";
import { CHUNK_INSERT_BATCH, createKbStore } from "./store";

// The service-role queries of the knowledge base. The client is a recorder that answers with what each
// test says, so what is sent can be checked without a database: every query names its business, errors
// carry nothing the database said, and a call that never answers ends.

const A = "e0000000-0000-0000-0000-00000000000a";
const DOC = "e2000000-0000-0000-0000-0000000000a1";

type Answer = { data?: unknown; error?: { code?: string; message: string } | null; count?: number };
interface Call {
  table: string;
  op: "select" | "insert" | "update" | "delete";
  payload?: unknown;
  returning?: string;
  filters: [string, "eq" | "neq" | "lt", unknown][];
  terminal?: string;
  /** The signal the query was given, if any: the store must pass one so a call that gave up can be cancelled. */
  signal?: AbortSignal;
  selectOptions?: unknown;
}

function fakeDb(answer: (call: Call) => Answer | Promise<Answer>) {
  const calls: Call[] = [];
  const db = {
    from(table: string) {
      const call: Call = { table, op: "select", filters: [] };
      let opSet = false;
      const setOp = (op: Call["op"], payload?: unknown) => {
        if (!opSet) {
          call.op = op;
          call.payload = payload;
          opSet = true;
        }
      };
      const builder: Record<string, unknown> = {
        select: (columns?: string, options?: unknown) => ((call.returning = columns ?? "*"), (call.selectOptions = options), (opSet ||= (setOp("select"), true)), builder),
        abortSignal: (signal: AbortSignal) => ((call.signal = signal), builder),
        lt: (column: string, value: unknown) => (call.filters.push([column, "lt", value]), builder),
        insert: (payload: unknown) => (setOp("insert", payload), builder),
        update: (payload: unknown) => (setOp("update", payload), builder),
        delete: () => (setOp("delete"), builder),
        eq: (column: string, value: unknown) => (call.filters.push([column, "eq", value]), builder),
        neq: (column: string, value: unknown) => (call.filters.push([column, "neq", value]), builder),
        single: () => ((call.terminal = "single"), builder),
        maybeSingle: () => ((call.terminal = "maybeSingle"), builder),
        then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
          calls.push(call);
          return Promise.resolve(answer(call)).then((a) => ({ data: a.data ?? null, error: a.error ?? null, count: a.count ?? null }), reject).then(resolve, reject);
        },
      };
      return builder;
    },
  };
  return { db: db as unknown as SupabaseClient, calls };
}

const filterOf = (call: Call, column: string) => call.filters.find(([c]) => c === column);
const expectTenantFilter = (call: Call) => expect(filterOf(call, "tenant_id"), `${call.op} on ${call.table} filters by tenant`).toEqual(["tenant_id", "eq", A]);

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("insertUpload", () => {
  it("makes a processing upload for the business and gives back its id and time", async () => {
    const { db, calls } = fakeDb(() => ({ data: { id: DOC, created_at: "2026-10-08T10:00:00+00:00" } }));
    const result = await createKbStore(db).insertUpload(A, { title: "Brochure", body: "Some text" });
    expect(result).toEqual({ id: DOC, createdAt: "2026-10-08T10:00:00.000Z" });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      table: "kb_documents",
      op: "insert",
      payload: { tenant_id: A, source_type: "upload", title: "Brochure", body: "Some text", status: "processing" },
      terminal: "single",
    });
  });

  it("fails in fixed words, logging the code only, when the database refuses", async () => {
    const { db } = fakeDb(() => ({ error: { code: "23505", message: 'duplicate key value violates "kb_documents_pkey" (title=Brochure secret)' } }));
    const error = (await createKbStore(db).insertUpload(A, { title: "Brochure", body: "x" }).catch((e: unknown) => e)) as AppError;
    expect(error).toBeInstanceOf(AppError);
    expect(error.code).toBe("upstream_failed");
    expect(error.message).not.toMatch(/duplicate|pkey|secret/);
    const logged = vi.mocked(console.error).mock.calls.map((c) => String(c[0])).join("\n");
    expect(logged).toContain("23505");
    expect(logged).not.toMatch(/duplicate|pkey|Brochure|secret/);
  });

  it("refuses an answer that is not a row", async () => {
    const { db } = fakeDb(() => ({ data: { id: "nope" } }));
    await expect(createKbStore(db).insertUpload(A, { title: "t", body: "b" })).rejects.toThrow();
  });
});

describe("getDocument", () => {
  const row = { id: DOC, title: "Brochure", body: "text", status: "processing", source_type: "upload" };

  it("reads one document of the business by id, with its status and text", async () => {
    const { db, calls } = fakeDb(() => ({ data: row }));
    expect(await createKbStore(db).getDocument(A, DOC)).toEqual({ id: DOC, title: "Brochure", body: "text", status: "processing", sourceType: "upload" });
    expect(calls[0]).toMatchObject({ table: "kb_documents", op: "select", terminal: "maybeSingle" });
    expect(filterOf(calls[0], "id")).toEqual(["id", "eq", DOC]);
    expectTenantFilter(calls[0]);
  });

  it("answers null when there is no such document for the business", async () => {
    const { db } = fakeDb(() => ({ data: null }));
    expect(await createKbStore(db).getDocument(A, DOC)).toBeNull();
  });

  it("refuses a row with a status it does not know", async () => {
    const { db } = fakeDb(() => ({ data: { ...row, status: "done" } }));
    await expect(createKbStore(db).getDocument(A, DOC)).rejects.toThrow();
  });
});

describe("setStatus", () => {
  it("updates the status and error of one document of the business", async () => {
    const { db, calls } = fakeDb(() => ({}));
    await createKbStore(db).setStatus(A, DOC, "failed", "It broke");
    expect(calls[0]).toMatchObject({ table: "kb_documents", op: "update", payload: { status: "failed", error: "It broke" } });
    expect(filterOf(calls[0], "id")).toEqual(["id", "eq", DOC]);
    expectTenantFilter(calls[0]);
  });

  it("clears the error when the document becomes ready", async () => {
    const { db, calls } = fakeDb(() => ({}));
    await createKbStore(db).setStatus(A, DOC, "ready");
    expect(calls[0].payload).toEqual({ status: "ready", error: null });
  });

  it("can be limited to a document that is still in the status the caller expects", async () => {
    const { db, calls } = fakeDb(() => ({}));
    await createKbStore(db).setStatus(A, DOC, "failed", "x", { onlyIf: "processing" });
    expect(filterOf(calls[0], "status")).toEqual(["status", "eq", "processing"]);
  });

  it("cuts an error to 200 characters", async () => {
    const { db, calls } = fakeDb(() => ({}));
    await createKbStore(db).setStatus(A, DOC, "failed", "x".repeat(500));
    expect((calls[0].payload as { error: string }).error).toHaveLength(200);
  });
});

describe("replaceChunks", () => {
  const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ content: `chunk ${i}`, embedding: [i, 0.5, -1] }));
  const present = (call: Call) => (call.table === "kb_documents" ? { data: { id: DOC } } : {});

  it("checks the document belongs to the business, deletes its old chunks, then inserts the new ones with vectors as text", async () => {
    const { db, calls } = fakeDb(present);
    expect(await createKbStore(db).replaceChunks(A, DOC, rows(2))).toBe("stored");
    expect(calls.map((c) => `${c.op} ${c.table}`)).toEqual(["select kb_documents", "delete kb_chunks", "insert kb_chunks"]);
    for (const call of calls.filter((c) => c.op !== "insert")) expectTenantFilter(call); // an insert names its business in each row, below
    expect(filterOf(calls[1], "document_id")).toEqual(["document_id", "eq", DOC]);
    expect(calls[2].payload).toEqual([
      { tenant_id: A, document_id: DOC, content: "chunk 0", embedding: "[0,0.5,-1]" },
      { tenant_id: A, document_id: DOC, content: "chunk 1", embedding: "[1,0.5,-1]" },
    ]);
  });

  it("inserts in batches", async () => {
    const { db, calls } = fakeDb(present);
    await createKbStore(db).replaceChunks(A, DOC, rows(CHUNK_INSERT_BATCH * 2 + 5));
    const inserts = calls.filter((c) => c.op === "insert");
    expect(inserts.map((c) => (c.payload as unknown[]).length)).toEqual([CHUNK_INSERT_BATCH, CHUNK_INSERT_BATCH, 5]);
  });

  it("does nothing when the document is not the business's (or is gone): no delete, no insert", async () => {
    const { db, calls } = fakeDb((call) => (call.table === "kb_documents" ? { data: null } : {}));
    expect(await createKbStore(db).replaceChunks(A, DOC, rows(3))).toBe("document_gone");
    expect(calls.map((c) => c.op)).toEqual(["select"]);
  });

  it("says the document is gone when it is deleted between the check and the insert", async () => {
    const { db } = fakeDb((call) => (call.op === "insert" ? { error: { code: "23503", message: "violates foreign key kb_chunks_document_id_fkey" } } : present(call)));
    expect(await createKbStore(db).replaceChunks(A, DOC, rows(2))).toBe("document_gone");
  });

  it("fails in fixed words on any other database error", async () => {
    const { db } = fakeDb((call) => (call.op === "insert" ? { error: { code: "22000", message: "vector must have 1024 dimensions, got 3" } } : present(call)));
    const error = (await createKbStore(db).replaceChunks(A, DOC, rows(1)).catch((e: unknown) => e)) as AppError;
    expect(error).toBeInstanceOf(AppError);
    expect(error.message).not.toMatch(/1024|dimensions/);
  });
});

describe("deleteDocument", () => {
  it("deletes one upload of the business, never an FAQ, and says whether there was one", async () => {
    const { db, calls } = fakeDb(() => ({ data: [{ id: DOC }] }));
    expect(await createKbStore(db).deleteDocument(A, DOC)).toBe(true);
    expect(calls[0]).toMatchObject({ table: "kb_documents", op: "delete", returning: "id" });
    expect(filterOf(calls[0], "id")).toEqual(["id", "eq", DOC]);
    expect(filterOf(calls[0], "source_type")).toEqual(["source_type", "neq", "manual"]);
    expectTenantFilter(calls[0]);
  });

  it("says false when nothing matched", async () => {
    const { db } = fakeDb(() => ({ data: [] }));
    expect(await createKbStore(db).deleteDocument(A, DOC)).toBe(false);
  });
});

describe("countDocuments", () => {
  it("counts the business's uploaded and imported documents, never its FAQs, without reading any rows", async () => {
    const { db, calls } = fakeDb(() => ({ count: 7 }));
    expect(await createKbStore(db).countDocuments(A)).toBe(7);
    expect(calls[0]).toMatchObject({ table: "kb_documents", op: "select", selectOptions: { count: "exact", head: true } });
    expectTenantFilter(calls[0]);
    expect(filterOf(calls[0], "source_type")).toEqual(["source_type", "neq", "manual"]);
  });

  it("is 0 when the database gives no count", async () => {
    const { db } = fakeDb(() => ({}));
    expect(await createKbStore(db).countDocuments(A)).toBe(0);
  });
});

describe("failStaleProcessing", () => {
  it("fails the documents still processing after the cutoff, across businesses, and says how many", async () => {
    const { db, calls } = fakeDb(() => ({ data: [{ id: "a" }, { id: "b" }] }));
    const before = Date.now();
    expect(await createKbStore(db).failStaleProcessing(30 * 60_000, "Took too long")).toBe(2);
    expect(calls[0]).toMatchObject({ table: "kb_documents", op: "update", payload: { status: "failed", error: "Took too long" }, returning: "id" });
    expect(filterOf(calls[0], "status")).toEqual(["status", "eq", "processing"]);
    const cutoff = Date.parse(String(filterOf(calls[0], "created_at")?.[2]));
    expect(cutoff).toBeLessThanOrEqual(before - 30 * 60_000 + 1000);
    expect(cutoff).toBeGreaterThan(before - 30 * 60_000 - 5000);
    expect(filterOf(calls[0], "tenant_id")).toBeUndefined(); // the one sweep that is not for one business
  });
});

describe("every call can be cancelled", () => {
  it("passes an abort signal to each query, and aborts it when the deadline passes", async () => {
    let seen: AbortSignal | undefined;
    const { db } = fakeDb((call) => {
      seen = call.signal;
      return new Promise<never>(() => undefined);
    });
    await createKbStore(db, { timeoutMs: 20 }).getDocument(A, DOC).catch(() => undefined);
    expect(seen).toBeInstanceOf(AbortSignal);
    expect(seen?.aborted).toBe(true);
  });

  it("does so for every kind of query", async () => {
    const { db, calls } = fakeDb((call) => (call.table === "kb_documents" && call.op === "select" && call.terminal ? { data: { id: DOC } } : { data: [{ id: DOC }], count: 1 }));
    const store = createKbStore(db);
    await store.insertUpload(A, { title: "t", body: "b" }).catch(() => undefined);
    await store.countDocuments(A);
    await store.setStatus(A, DOC, "ready");
    await store.replaceChunks(A, DOC, [{ content: "c", embedding: [1] }]);
    await store.deleteDocument(A, DOC);
    await store.failStaleProcessing(1000, "x");
    expect(calls.length).toBeGreaterThanOrEqual(8);
    for (const call of calls) expect(call.signal, `${call.op} ${call.table}`).toBeInstanceOf(AbortSignal);
  });
});

describe("a call that never answers", () => {
  it("ends with a fixed upstream_failed instead of hanging the request or the job", async () => {
    const { db } = fakeDb(() => new Promise<never>(() => undefined));
    const error = (await createKbStore(db, { timeoutMs: 20 }).getDocument(A, DOC).catch((e: unknown) => e)) as AppError;
    expect(error).toBeInstanceOf(AppError);
    expect(error.code).toBe("upstream_failed");
    expect(String(vi.mocked(console.error).mock.calls.at(-1)?.[0])).toMatch(/timed out/);
  });
});
