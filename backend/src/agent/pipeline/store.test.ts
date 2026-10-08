import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../../lib/errors";
import { NonRetriableError } from "inngest";
import { createPipelineStore } from "./store";

// The service-role queries of the message pipeline. The client is a recorder that answers with what each test
// says, so what is sent can be checked without a database: every query names its business, errors carry
// nothing the database said, and a call that never answers ends.

const T = "e0000000-0000-0000-0000-00000000000a";
const CONV = "c0000000-0000-0000-0000-00000000000c";
const MSG = "a0000000-0000-0000-0000-0000000000a1";
const CONTACT = "b0000000-0000-0000-0000-0000000000b1";
const LEAD = "d0000000-0000-0000-0000-0000000000d1";

type Answer = { data?: unknown; error?: { code?: string; message: string } | null };
interface Call {
  table: string;
  op: "select" | "insert";
  payload?: unknown;
  returning?: string;
  filters: [string, string, unknown][];
  order?: [string, boolean];
  limit?: number;
  terminal?: string;
  signal?: AbortSignal;
}

function fakeDb(answer: (call: Call) => Answer | Promise<Answer>) {
  const calls: Call[] = [];
  const db = {
    from(table: string) {
      const call: Call = { table, op: "select", filters: [] };
      const builder: Record<string, unknown> = {
        select: (columns?: string) => ((call.returning ??= columns ?? "*"), builder),
        insert: (payload: unknown) => ((call.op = "insert"), (call.payload = payload), builder),
        eq: (c: string, v: unknown) => (call.filters.push([c, "eq", v]), builder),
        gte: (c: string, v: unknown) => (call.filters.push([c, "gte", v]), builder),
        in: (c: string, v: unknown) => (call.filters.push([c, "in", v]), builder),
        not: (c: string, op: string, v: unknown) => (call.filters.push([c, `not.${op}`, v]), builder),
        order: (c: string, o?: { ascending?: boolean }) => ((call.order = [c, o?.ascending ?? true]), builder),
        limit: (n: number) => ((call.limit = n), builder),
        abortSignal: (signal: AbortSignal) => ((call.signal = signal), builder),
        single: () => ((call.terminal = "single"), builder),
        maybeSingle: () => ((call.terminal = "maybeSingle"), builder),
        then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
          calls.push(call);
          return Promise.resolve(answer(call)).then((a) => ({ data: a.data ?? null, error: a.error ?? null }), reject).then(resolve, reject);
        },
      };
      return builder;
    },
  };
  return { db: db as unknown as SupabaseClient, calls };
}

const filter = (call: Call, column: string) => call.filters.find(([c]) => c === column);
const tenantFilter = (call: Call) => expect(filter(call, "tenant_id"), `${call.table} filters by tenant`).toEqual(["tenant_id", "eq", T]);

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("getMessage", () => {
  const row = { id: MSG, conversation_id: CONV, direction: "in", sender: "customer", kind: "text", created_at: "2026-10-08T10:00:00+00:00" };

  it("reads one message by its id, only if it is this business's and this conversation's", async () => {
    const { db, calls } = fakeDb(() => ({ data: row }));
    expect(await createPipelineStore(db).getMessage(T, CONV, MSG)).toEqual({ id: MSG, direction: "in", sender: "customer", kind: "text", createdAt: "2026-10-08T10:00:00.000Z" });
    expect(calls[0]).toMatchObject({ table: "messages", terminal: "maybeSingle" });
    tenantFilter(calls[0]);
    expect(filter(calls[0], "conversation_id")).toEqual(["conversation_id", "eq", CONV]);
    expect(filter(calls[0], "id")).toEqual(["id", "eq", MSG]);
  });

  it("answers null when there is none, and never asks for the body, which a step result must not carry", async () => {
    const { db, calls } = fakeDb(() => ({ data: null }));
    expect(await createPipelineStore(db).getMessage(T, CONV, MSG)).toBeNull();
    expect(calls[0].returning).not.toMatch(/body|media|meta/);
  });

  it("refuses a row of a kind or direction it does not know", async () => {
    const { db } = fakeDb(() => ({ data: { ...row, direction: "sideways" } }));
    await expect(createPipelineStore(db).getMessage(T, CONV, MSG)).rejects.toThrow();
  });
});

describe("getConversation", () => {
  it("reads the conversation of the business by id", async () => {
    const { db, calls } = fakeDb(() => ({ data: { id: CONV, contact_id: CONTACT, mode: "ai" } }));
    expect(await createPipelineStore(db).getConversation(T, CONV)).toEqual({ id: CONV, contactId: CONTACT, mode: "ai" });
    expect(calls[0].returning).toBe("id, contact_id, mode"); // only what the pipeline uses
    tenantFilter(calls[0]);
    expect(filter(calls[0], "id")).toEqual(["id", "eq", CONV]);
  });

  it("answers null when it is not the business's", async () => {
    const { db } = fakeDb(() => ({ data: null }));
    expect(await createPipelineStore(db).getConversation(T, CONV)).toBeNull();
  });
});

describe("getContact", () => {
  it("reads the language and whether they opted out, and never the phone number or the name", async () => {
    const { db, calls } = fakeDb(() => ({ data: { id: CONTACT, language: "ta-en", opted_out_at: null } }));
    expect(await createPipelineStore(db).getContact(T, CONTACT)).toEqual({ id: CONTACT, language: "ta-en", optedOut: false });
    tenantFilter(calls[0]);
    expect(calls[0].returning).not.toMatch(/phone|name/);
  });

  it("reports an opt-out", async () => {
    const { db } = fakeDb(() => ({ data: { id: CONTACT, language: null, opted_out_at: "2026-10-01T00:00:00Z" } }));
    expect((await createPipelineStore(db).getContact(T, CONTACT))?.optedOut).toBe(true);
  });
});

describe("getTenant", () => {
  it("reads the business by its id: the table's own id is the tenant", async () => {
    const { db, calls } = fakeDb(() => ({ data: { id: T, vertical: "pack-a", vertical_version: 1 } }));
    expect(await createPipelineStore(db).getTenant(T)).toEqual({ id: T, vertical: "pack-a", verticalVersion: 1 });
    expect(calls[0].returning).toBe("id, vertical, vertical_version"); // not the business's name or anything else
    expect(filter(calls[0], "id")).toEqual(["id", "eq", T]);
  });
});

describe("isAnswered", () => {
  it("looks for the audit row that says the message was answered, for this business, written after the message", async () => {
    const { db, calls } = fakeDb(() => ({ data: [{ id: 7 }] }));
    expect(await createPipelineStore(db).isAnswered(T, MSG, "2026-10-08T10:00:00.000Z")).toBe(true);
    tenantFilter(calls[0]);
    expect(calls[0].table).toBe("audit_logs");
    expect(filter(calls[0], "action")).toEqual(["action", "eq", "message.answered"]);
    expect(filter(calls[0], "entity_id")).toEqual(["entity_id", "eq", MSG]);
    // our clock against Meta's: a day of slack below the message's time, which also keeps the lookup on the index (tenant_id, created_at)
    expect(filter(calls[0], "created_at")).toEqual(["created_at", "gte", "2026-10-07T10:00:00.000Z"]);
    expect(calls[0].limit).toBe(1);
  });

  it("is false when there is none", async () => {
    const { db } = fakeDb(() => ({ data: [] }));
    expect(await createPipelineStore(db).isAnswered(T, MSG, "2026-10-08T10:00:00.000Z")).toBe(false);
  });
});

describe("findOrCreateOpenLead", () => {
  it("reuses the oldest open lead of the contact: any stage except won and lost", async () => {
    const { db, calls } = fakeDb(() => ({ data: [{ id: LEAD, stage: "engaged" }] }));
    expect(await createPipelineStore(db).findOrCreateOpenLead(T, CONTACT)).toEqual({ id: LEAD, stage: "engaged", created: false });
    expect(calls).toHaveLength(1);
    tenantFilter(calls[0]);
    expect(filter(calls[0], "contact_id")).toEqual(["contact_id", "eq", CONTACT]);
    expect(filter(calls[0], "stage")).toEqual(["stage", "not.in", "(won,lost)"]);
    expect(calls[0].order).toEqual(["created_at", true]);
    expect(calls[0].limit).toBe(1);
  });

  it("makes a new lead for the business and contact when there is no open one", async () => {
    const { db, calls } = fakeDb((call) => (call.op === "insert" ? { data: { id: LEAD, stage: "new" } } : { data: [] }));
    expect(await createPipelineStore(db).findOrCreateOpenLead(T, CONTACT)).toEqual({ id: LEAD, stage: "new", created: true });
    expect(calls.map((c) => c.op)).toEqual(["select", "insert"]);
    expect(calls[1].payload).toEqual({ tenant_id: T, contact_id: CONTACT });
  });
});

describe("recentUnanswered", () => {
  // the database answers newest first, as asked
  const newestFirst = [{ id: "m3", kind: "text" }, { id: "m2", kind: "image" }, { id: "m1", kind: null }];

  it("lists the customer's recent messages of the conversation that have not been answered, oldest first, with their kinds and no text", async () => {
    const { db, calls } = fakeDb((call) => (call.table === "messages" ? { data: newestFirst } : { data: [{ entity_id: "m2" }] }));
    expect(await createPipelineStore(db).recentUnanswered(T, CONV, "2026-10-08T09:59:50.000Z")).toEqual([
      { id: "m1", kind: null },
      { id: "m3", kind: "text" },
    ]);
    const [read, audit] = calls;
    expect(read.returning).toBe("id, kind");
    tenantFilter(read);
    expect(filter(read, "conversation_id")).toEqual(["conversation_id", "eq", CONV]);
    expect(filter(read, "direction")).toEqual(["direction", "eq", "in"]);
    expect(filter(read, "sender")).toEqual(["sender", "eq", "customer"]);
    expect(filter(read, "created_at")).toEqual(["created_at", "gte", "2026-10-08T09:59:50.000Z"]);
    tenantFilter(audit);
    expect(filter(audit, "entity_id")).toEqual(["entity_id", "in", ["m1", "m2", "m3"]]);
    expect(filter(audit, "action")).toEqual(["action", "eq", "message.answered"]);
  });

  it("takes the newest ten, not the oldest: if there are more, the latest are the ones to answer", async () => {
    const { db, calls } = fakeDb((call) => (call.table === "messages" ? { data: newestFirst } : { data: [] }));
    await createPipelineStore(db).recentUnanswered(T, CONV, "2026-10-08T09:59:50.000Z");
    expect(calls[0].order).toEqual(["created_at", false]);
    expect(calls[0].limit).toBe(10);
  });

  it("looks for the answered rows only from a day before the batch's start, so it never reads the business's whole audit log", async () => {
    const { db, calls } = fakeDb((call) => (call.table === "messages" ? { data: newestFirst } : { data: [] }));
    await createPipelineStore(db).recentUnanswered(T, CONV, "2026-10-08T09:59:50.000Z");
    expect(filter(calls[1], "created_at")).toEqual(["created_at", "gte", "2026-10-07T09:59:50.000Z"]);
  });

  it("asks nothing more when there are no messages", async () => {
    const { db, calls } = fakeDb(() => ({ data: [] }));
    expect(await createPipelineStore(db).recentUnanswered(T, CONV, "2026-10-08T09:59:50.000Z")).toEqual([]);
    expect(calls).toHaveLength(1);
  });
});

describe("failures", () => {
  const failing = (code: string | undefined) => fakeDb(() => ({ error: { code, message: "secret detail 9812345621" } })).db;

  it.each(["08006", "08001", "53300", "57P01", "57014", "40001", "PGRST002", "", undefined])(
    "the Postgres code %s (the database unreachable or busy) is an ordinary error, which Inngest retries",
    async (code) => {
      const error = await createPipelineStore(failing(code)).getContact(T, CONTACT).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(AppError);
      expect(error).not.toBeInstanceOf(NonRetriableError);
    },
  );

  it.each(["42501", "42P01", "22P02", "23505", "PGRST301", "P0001"])("the Postgres code %s (a refusal that waiting cannot fix) is not retried, and says nothing of what the database said", async (code) => {
    const error = (await createPipelineStore(failing(code)).getContact(T, CONTACT).catch((e: unknown) => e)) as Error;
    expect(error).toBeInstanceOf(NonRetriableError);
    expect(error.message).not.toMatch(/secret|9812345621/);
  });

  it("a row that is not the shape expected is not retried, and nothing of it is quoted", async () => {
    const { db } = fakeDb(() => ({ data: { id: CONTACT, language: 5, opted_out_at: "9812345621 secret" } }));
    const error = (await createPipelineStore(db).getContact(T, CONTACT).catch((e: unknown) => e)) as Error;
    expect(error).toBeInstanceOf(NonRetriableError);
    expect(error.message).not.toMatch(/secret|9812345621/);
    expect(vi.mocked(console.error).mock.calls.map((c) => c.join(" ")).join("\n")).not.toMatch(/secret|9812345621/);
  });

  it("are fixed words with the Postgres code in the log only, never the database's text", async () => {
    const { db } = fakeDb(() => ({ error: { code: "42501", message: 'permission denied for table messages (row: "call me on 9812345621")' } }));
    const error = (await createPipelineStore(db).getMessage(T, CONV, MSG).catch((e: unknown) => e)) as Error;
    expect(error).toBeInstanceOf(Error);
    expect(error.message).not.toMatch(/permission|9812345621|messages/);
    const logged = vi.mocked(console.error).mock.calls.map((c) => c.join(" ")).join("\n");
    expect(logged).toContain("42501");
    expect(logged).not.toMatch(/9812345621|permission/);
  });

  it("every call can be cancelled, and one that never answers ends", async () => {
    let seen: AbortSignal | undefined;
    const { db } = fakeDb((call) => {
      seen = call.signal;
      return new Promise<never>(() => undefined);
    });
    const error = (await createPipelineStore(db, { timeoutMs: 20 }).getContact(T, CONTACT).catch((e: unknown) => e)) as AppError;
    expect(error.code).toBe("upstream_failed");
    expect(seen).toBeInstanceOf(AbortSignal);
    expect(seen?.aborted).toBe(true);
  });
});
