import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { askedText, documentMeta, KbDataError, KbDocumentRow, listKbDocuments, toKbDocument, type KbDocumentRow as Row } from "./kb-content";

const TENANT = "c0000000-0000-0000-0000-00000000000a";
const id = (n: number) => `f0000000-0000-0000-0000-${String(n).padStart(12, "0")}`;

const row = (over: Partial<Row> = {}): Row => ({
  id: id(1),
  tenant_id: TENANT,
  source_type: "upload",
  source_url: null,
  title: "Bridal price list.pdf",
  created_at: "2026-10-06T19:00:00+00:00",
  ...over,
});
const doc = (over: Partial<Row> = {}) => toKbDocument(KbDocumentRow.parse(row(over)));

function fakeClient(result: { data: unknown; error: unknown }) {
  const calls: [string, unknown[]][] = [];
  const builder: Record<string, unknown> = {};
  for (const name of ["select", "eq", "order", "limit"]) {
    builder[name] = (...args: unknown[]) => {
      calls.push([name, args]);
      return builder;
    };
  }
  builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
  const client = {
    from: (table: string) => {
      calls.push(["from", [table]]);
      return builder;
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

describe("knowledge documents", () => {
  it("labels the tile from the file extension, else from where it came from", () => {
    expect(doc()).toMatchObject({ name: "Bridal price list.pdf", label: "PDF", sourceType: "upload" });
    expect(doc({ title: "Services page", source_type: "website" }).label).toBe("WEB");
    expect(doc({ title: "Parking", source_type: "manual" }).label).toBe("TXT");
    expect(doc({ title: "Notes", source_type: "something_new" }).label).toBe("DOC");
  });

  it("names an untitled document from its URL, or says it's untitled", () => {
    expect(doc({ title: null, source_url: "https://glowstudio.in/services/bridal" }).name).toBe("bridal");
    expect(doc({ title: " ", source_url: "https://glowstudio.in/" }).name).toBe("glowstudio.in");
    expect(doc({ title: null, source_url: null }).name).toBe("Untitled document");
  });

  it("describes the source and date in the business's time zone", () => {
    // 19:00 UTC on the 6th is the 7th in Chennai.
    expect(documentMeta(doc(), "Asia/Kolkata")).toBe("Uploaded · 7 Oct 2026");
    expect(documentMeta(doc({ source_type: "website" }), "UTC")).toBe("From your website · 6 Oct 2026");
    expect(documentMeta(doc({ source_type: "crawler_v2" }), "UTC")).toBe("crawler_v2 · 6 Oct 2026");
  });

  it("reads the session's business's documents, newest first, and drops anything else", async () => {
    const { client, calls } = fakeClient({ data: [row(), row({ id: id(2), tenant_id: "c0000000-0000-0000-0000-00000000000b" })], error: null });
    const docs = await listKbDocuments(client, TENANT);
    expect(calls).toContainEqual(["from", ["kb_documents"]]);
    expect(calls).toContainEqual(["eq", ["tenant_id", TENANT]]);
    expect(calls).toContainEqual(["order", ["created_at", { ascending: false }]]);
    expect(docs.map((d) => d.id)).toEqual([id(1)]);
  });

  it("passes database errors on and rejects rows of the wrong shape", async () => {
    const pg = { code: "42501", message: "permission denied", details: null, hint: null };
    await expect(listKbDocuments(fakeClient({ data: null, error: pg }).client, TENANT)).rejects.toBe(pg);
    await expect(listKbDocuments(fakeClient({ data: [{ id: "x" }], error: null }).client, TENANT)).rejects.toBeInstanceOf(KbDataError);
  });
});

describe("unanswered questions wording", () => {
  it("counts like the prototype", () => {
    expect(askedText(1)).toBe("once");
    expect(askedText(2)).toBe("twice");
    expect(askedText(5)).toBe("5 times");
  });
});
