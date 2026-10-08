import { describe, expect, it, vi } from "vitest";
import { fakeKbStore } from "../test-support/fake-kb-store";
import { embedAndStore, embedBatch, storeChunks } from "./embed-store";

// The one place text becomes searchable: the ingest job (documents) and the FAQ routes (FAQs and gap answers) both
// embed text into vectors and store them as a document's chunks, then mark the document ready.

const A = "e0000000-0000-0000-0000-00000000000a";
const B = "e0000000-0000-0000-0000-00000000000b";
const vec = (n: number) => [n, 0, 0];

describe("embedBatch", () => {
  it("gives back one vector per text, in order", async () => {
    const embed = vi.fn(async (texts: string[]) => texts.map((_, i) => vec(i)));
    expect(await embedBatch(embed, ["a", "b"])).toEqual([vec(0), vec(1)]);
  });

  it("refuses an answer with the wrong number of vectors: nothing is ever stored against the wrong text", async () => {
    await expect(embedBatch(async () => [vec(0)], ["a", "b"])).rejects.toThrow(/wrong length/);
  });

  it("lets the provider's own error through, so the caller can tell a rejection from an outage", async () => {
    const failure = new Error("provider down");
    await expect(embedBatch(async () => Promise.reject(failure), ["a"])).rejects.toBe(failure);
  });
});

describe("storeChunks", () => {
  it("replaces the document's chunks and marks it ready", async () => {
    const f = fakeKbStore([{ id: "d1", tenantId: A, status: "processing" }]);
    expect(await storeChunks(f.store, A, "d1", ["one", "two"], [vec(1), vec(2)])).toBe("stored");
    expect(f.chunks.get("d1")).toEqual([{ content: "one", embedding: vec(1) }, { content: "two", embedding: vec(2) }]);
    expect(f.docs.get("d1")?.status).toBe("ready");
  });

  it("leaves the document as it was when it is not the business's, or was deleted meanwhile", async () => {
    const f = fakeKbStore([{ id: "d1", tenantId: B, status: "processing" }]);
    expect(await storeChunks(f.store, A, "d1", ["x"], [vec(1)])).toBe("document_gone");
    expect(f.docs.get("d1")?.status).toBe("processing");
    expect(f.chunks.has("d1")).toBe(false);
  });
});

describe("embedAndStore", () => {
  it("chunks the text, embeds the chunks and stores them, ready", async () => {
    const f = fakeKbStore([{ id: "d1", tenantId: A, status: "processing" }]);
    const embed = vi.fn(async (texts: string[]) => texts.map((_, i) => vec(i)));
    expect(await embedAndStore({ store: f.store, embed }, A, "d1", "Parking?\n\nYes, two covered slots.")).toBe("stored");
    expect(embed).toHaveBeenCalledOnce();
    expect(f.chunks.get("d1")?.[0].content).toContain("two covered slots");
    expect(f.docs.get("d1")?.status).toBe("ready");
  });

  it("stores nothing, and does not mark the document ready, when embedding fails", async () => {
    const f = fakeKbStore([{ id: "d1", tenantId: A, status: "processing" }]);
    await expect(embedAndStore({ store: f.store, embed: async () => Promise.reject(new Error("429")) }, A, "d1", "text")).rejects.toThrow("429");
    expect(f.docs.get("d1")?.status).toBe("processing");
    expect(f.chunks.has("d1")).toBe(false);
  });

  it("drops the vectors, storing nothing, when the text was changed while it was embedded", async () => {
    const f = fakeKbStore([{ id: "d1", tenantId: A, status: "processing" }]);
    const result = await embedAndStore({ store: f.store, embed: async (t) => t.map(() => vec(1)) }, A, "d1", "old text", async () => false);
    expect(result).toBe("superseded");
    expect(f.chunks.has("d1")).toBe(false);
    expect(f.docs.get("d1")?.status).toBe("processing");
  });

  it("stores when the check says the text is still current", async () => {
    const f = fakeKbStore([{ id: "d1", tenantId: A, status: "processing" }]);
    const result = await embedAndStore({ store: f.store, embed: async (t) => t.map(() => vec(1)) }, A, "d1", "text", async () => true);
    expect(result).toBe("stored");
  });

  it("embeds a long text in batches of 32", async () => {
    const f = fakeKbStore([{ id: "d1", tenantId: A, status: "processing" }]);
    const embed = vi.fn(async (texts: string[]) => texts.map(() => vec(1)));
    await embedAndStore({ store: f.store, embed }, A, "d1", Array.from({ length: 80 }, (_, i) => `Paragraph ${i} ${"word ".repeat(150)}`).join("\n\n"));
    expect(embed.mock.calls.every(([texts]) => texts.length <= 32)).toBe(true);
    expect(embed.mock.calls.length).toBeGreaterThan(1);
  });
});
