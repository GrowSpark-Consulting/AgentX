import type { KbDocument, KbDocumentStatus, KbStore } from "../kb/store";

// An in-memory KbStore for tests. It enforces the same tenant filtering the real store does, so a service
// that forgets to pass the tenant (or passes another one) shows up as a missing or untouched document.

export interface FakeDoc {
  id: string;
  tenantId: string;
  sourceType: string;
  title: string;
  body: string | null;
  status: KbDocumentStatus;
  error: string | null;
  createdAt: string;
}
export interface FakeChunk {
  content: string;
  embedding: number[];
}

export function fakeKbStore(seed: Partial<FakeDoc>[] = []) {
  const docs = new Map<string, FakeDoc>();
  const chunks = new Map<string, FakeChunk[]>();
  const calls: string[] = [];
  const state = { failNext: new Set<keyof KbStore>(), counter: 0, gone: new Set<string>(), now: () => Date.now() };

  const add = (partial: Partial<FakeDoc>): FakeDoc => {
    const doc: FakeDoc = {
      id: partial.id ?? `00000000-0000-0000-0000-${String(++state.counter).padStart(12, "0")}`,
      tenantId: partial.tenantId ?? "t-default",
      sourceType: partial.sourceType ?? "upload",
      title: partial.title ?? "Doc",
      body: partial.body === undefined ? "text" : partial.body,
      status: partial.status ?? "processing",
      error: partial.error ?? null,
      createdAt: partial.createdAt ?? new Date(1_700_000_000_000 + state.counter * 1000).toISOString(),
    };
    docs.set(doc.id, doc);
    return doc;
  };
  seed.forEach(add);

  const mine = (tenantId: string, id: string) => {
    const doc = docs.get(id);
    return doc && doc.tenantId === tenantId ? doc : undefined;
  };
  const maybeFail = (op: keyof KbStore) => {
    if (state.failNext.delete(op)) throw new Error(`${op} failed (simulated)`);
  };

  const store: KbStore = {
    async insertUpload(tenantId, { title, body }) {
      calls.push("insertUpload");
      maybeFail("insertUpload");
      const doc = add({ tenantId, title, body, sourceType: "upload", status: "processing" });
      return { id: doc.id, createdAt: doc.createdAt };
    },
    async countDocuments(tenantId) {
      calls.push("countDocuments");
      maybeFail("countDocuments");
      return [...docs.values()].filter((d) => d.tenantId === tenantId && d.sourceType !== "manual").length;
    },
    async getDocument(tenantId, id): Promise<KbDocument | null> {
      calls.push("getDocument");
      maybeFail("getDocument");
      const doc = mine(tenantId, id);
      return doc ? { id: doc.id, title: doc.title, body: doc.body, status: doc.status, sourceType: doc.sourceType } : null;
    },
    async setStatus(tenantId, id, status, error, options) {
      calls.push("setStatus");
      maybeFail("setStatus");
      const doc = mine(tenantId, id);
      if (!doc || (options?.onlyIf && doc.status !== options.onlyIf)) return;
      doc.status = status;
      doc.error = error ?? null;
    },
    async replaceChunks(tenantId, id, rows) {
      calls.push("replaceChunks");
      maybeFail("replaceChunks");
      if (!mine(tenantId, id) || state.gone.has(id)) return "document_gone";
      chunks.set(id, rows.map((r) => ({ content: r.content, embedding: r.embedding })));
      return "stored";
    },
    async failStaleProcessing(olderThanMs, error) {
      calls.push("failStaleProcessing");
      maybeFail("failStaleProcessing");
      const cutoff = state.now() - olderThanMs;
      let failed = 0;
      for (const doc of docs.values()) {
        if (doc.status === "processing" && Date.parse(doc.createdAt) < cutoff) {
          doc.status = "failed";
          doc.error = error;
          failed++;
        }
      }
      return failed;
    },
    async deleteDocument(tenantId, id) {
      calls.push("deleteDocument");
      maybeFail("deleteDocument");
      const doc = mine(tenantId, id);
      if (!doc || doc.sourceType === "manual") return false;
      docs.delete(id);
      chunks.delete(id); // cascade
      return true;
    },
  };

  return { store, docs, chunks, calls, state, add };
}
