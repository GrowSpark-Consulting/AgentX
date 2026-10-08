import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import {
  askedText,
  canAnswerGaps,
  canWriteKnowledge,
  DOCUMENT_LIMIT,
  documentLimitReached,
  documentMeta,
  DUPLICATE_FAQ,
  faqChanges,
  hasProcessing,
  KbDataError,
  KbDocumentRow,
  listFaqs,
  listKbDocuments,
  toKbDocument,
  UPLOAD_MAX_BYTES,
  UPLOAD_TITLE_MAX,
  upsertDocument,
  upsertFaq,
  validateFaq,
  validateGapAnswer,
  validateUploadFile,
  validateUploadTitle,
  type FaqItem,
  type KbDocumentRow as Row,
} from "./kb-content";

const TENANT = "c0000000-0000-0000-0000-00000000000a";
const OTHER = "c0000000-0000-0000-0000-00000000000b";
const id = (n: number) => `f0000000-0000-0000-0000-${String(n).padStart(12, "0")}`;

const row = (over: Partial<Row> = {}): Row => ({
  id: id(1),
  tenant_id: TENANT,
  source_type: "upload",
  source_url: null,
  title: "Bridal price list.pdf",
  status: "ready",
  error: null,
  created_at: "2026-10-06T19:00:00+00:00",
  ...over,
});
const doc = (over: Partial<Row> = {}) => toKbDocument(KbDocumentRow.parse(row(over)));

function fakeClient(result: { data: unknown; error: unknown }) {
  const calls: [string, unknown[]][] = [];
  const builder: Record<string, unknown> = {};
  for (const name of ["select", "eq", "neq", "order", "limit"]) {
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
    const { client, calls } = fakeClient({ data: [row(), row({ id: id(2), tenant_id: OTHER })], error: null });
    const docs = await listKbDocuments(client, TENANT);
    expect(calls).toContainEqual(["from", ["kb_documents"]]);
    expect(calls).toContainEqual(["eq", ["tenant_id", TENANT]]);
    expect(calls).toContainEqual(["order", ["created_at", { ascending: false }]]);
    expect(docs.map((d) => d.id)).toEqual([id(1)]);
  });

  it("reads the status and leaves FAQs (manual rows) to the FAQ list", async () => {
    const { client, calls } = fakeClient({ data: [row({ status: "processing" })], error: null });
    const [first] = await listKbDocuments(client, TENANT);
    expect(first.status).toBe("processing");
    expect(calls).toContainEqual(["select", ["id, tenant_id, source_type, source_url, title, status, error, created_at"]]);
    expect(calls).toContainEqual(["neq", ["source_type", "manual"]]);
  });

  it("passes database errors on and rejects rows of the wrong shape", async () => {
    const pg = { code: "42501", message: "permission denied", details: null, hint: null };
    await expect(listKbDocuments(fakeClient({ data: null, error: pg }).client, TENANT)).rejects.toBe(pg);
    await expect(listKbDocuments(fakeClient({ data: [{ id: "x" }], error: null }).client, TENANT)).rejects.toBeInstanceOf(KbDataError);
  });

  it("accepts only processing, ready and failed as a status", () => {
    expect(KbDocumentRow.safeParse(row({ status: "queued" as Row["status"] })).success).toBe(false);
    for (const status of ["processing", "ready", "failed"] as const) expect(doc({ status }).status).toBe(status);
  });

  it("keeps a failed document's reason as the server wrote it, and nothing for other statuses", () => {
    const reason = "This document has no text to learn from.";
    expect(doc({ status: "failed", error: reason }).error).toBe(reason);
    expect(doc({ status: "failed", error: `  ${reason} ` }).error).toBe(reason);
    expect(doc({ status: "failed", error: null }).error).toBeNull();
    expect(doc({ status: "failed", error: "  " }).error).toBeNull();
    expect(doc({ status: "ready", error: "left over" }).error).toBeNull();
    expect(KbDocumentRow.safeParse(row({ error: 7 as unknown as string })).success).toBe(false);
  });

  it("knows when the business has as many documents as it may keep", () => {
    expect(documentLimitReached(Array.from({ length: DOCUMENT_LIMIT - 1 }))).toBe(false);
    expect(documentLimitReached(Array.from({ length: DOCUMENT_LIMIT }))).toBe(true);
    expect(documentLimitReached([])).toBe(false);
  });

  it("knows when something is still processing", () => {
    expect(hasProcessing([doc(), doc({ status: "failed" })])).toBe(false);
    expect(hasProcessing([doc(), doc({ status: "processing" })])).toBe(true);
    expect(hasProcessing([])).toBe(false);
  });

  it("puts an uploaded document first and replaces one already listed", () => {
    const older = doc({ id: id(1), created_at: "2026-10-01T00:00:00Z" });
    const newer = doc({ id: id(2), created_at: "2026-10-07T00:00:00Z", status: "processing" });
    expect(upsertDocument([older], newer).map((d) => d.id)).toEqual([id(2), id(1)]);
    expect(upsertDocument([newer, older], { ...newer, status: "ready" })).toEqual([{ ...newer, status: "ready" }, older]);
  });
});

describe("FAQs", () => {
  const faq = (n: number, q: string, a = "Yes."): FaqItem => ({ id: id(n), q, a, status: "ready" });

  it("reads the business's manual rows, oldest first, as question and answer", async () => {
    const { client, calls } = fakeClient({
      data: [
        { id: id(1), tenant_id: TENANT, title: "Parking?", body: "Yes, at the back.", status: "ready" },
        { id: id(2), tenant_id: TENANT, title: "Home visits?", body: null, status: "failed" },
        { id: id(3), tenant_id: OTHER, title: "Elsewhere", body: "x", status: "ready" },
      ],
      error: null,
    });
    expect(await listFaqs(client, TENANT)).toEqual([
      { id: id(1), q: "Parking?", a: "Yes, at the back.", status: "ready" },
      { id: id(2), q: "Home visits?", a: "", status: "failed" },
    ]);
    expect(calls).toContainEqual(["eq", ["tenant_id", TENANT]]);
    expect(calls).toContainEqual(["eq", ["source_type", "manual"]]);
    expect(calls).toContainEqual(["order", ["created_at", { ascending: true }]]);
  });

  it("rejects FAQ rows of the wrong shape", async () => {
    await expect(listFaqs(fakeClient({ data: [{ id: id(1) }], error: null }).client, TENANT)).rejects.toBeInstanceOf(KbDataError);
  });

  it("requires a question and an answer within the contract's limits", () => {
    expect(validateFaq({ q: " ", a: "" }, [], null)).toEqual({
      ok: false,
      fields: { q: "Write the question the way customers ask it", a: "Write the answer" },
    });
    expect(validateFaq({ q: "x".repeat(301), a: "y".repeat(2001) }, [], null)).toEqual({
      ok: false,
      fields: { q: "Keep the question under 300 characters", a: "Keep the answer under 2000 characters" },
    });
    expect(validateFaq({ q: "x".repeat(300), a: "y".repeat(2000) }, [], null).ok).toBe(true);
    expect(validateFaq({ q: "  Parking?  ", a: " Yes. " }, [], null)).toEqual({ ok: true, input: { q: "Parking?", a: "Yes." } });
  });

  it("refuses a question another FAQ already has, ignoring case and spaces, but not the FAQ itself", () => {
    const existing = [faq(1, "Do you have parking?")];
    expect(validateFaq({ q: "  do YOU have parking? ", a: "Yes" }, existing, null)).toEqual({ ok: false, fields: { q: DUPLICATE_FAQ } });
    expect(validateFaq({ q: "Do you have parking?", a: "No" }, existing, id(1)).ok).toBe(true);
  });

  it("sends only what changed in an edit", () => {
    const before = { q: "Parking?", a: "Yes." };
    expect(faqChanges(before, { q: "Parking?", a: "Yes." })).toEqual({});
    expect(faqChanges(before, { q: "Parking?", a: "No." })).toEqual({ a: "No." });
    expect(faqChanges(before, { q: "Car parking?", a: "No." })).toEqual({ q: "Car parking?", a: "No." });
  });

  it("replaces an edited FAQ in place and adds a new one at the end", () => {
    const list = [faq(1, "A?"), faq(2, "B?")];
    expect(upsertFaq(list, faq(1, "A2?")).map((f) => f.q)).toEqual(["A2?", "B?"]);
    expect(upsertFaq(list, faq(3, "C?")).map((f) => f.q)).toEqual(["A?", "B?", "C?"]);
  });
});

describe("upload validation", () => {
  const file = (name: string, size = 1024) => ({ name, size });

  it("accepts pdf, docx, txt and md in any case, up to exactly 5 MB", () => {
    for (const name of ["a.pdf", "b.DOCX", "c.txt", "notes.final.md"]) expect(validateUploadFile(file(name))).toBeNull();
    expect(validateUploadFile(file("a.pdf", UPLOAD_MAX_BYTES))).toBeNull();
  });

  it("refuses other types, no file, empty files and anything over 5 MB", () => {
    const wrongType = "Choose a PDF, Word (.docx), text (.txt) or Markdown (.md) file";
    for (const name of ["a.doc", "a.exe", "a.pdf.zip", "README", "image.png"]) expect(validateUploadFile(file(name))).toBe(wrongType);
    expect(validateUploadFile(null)).toBe("Choose a file to upload");
    expect(validateUploadFile(file("a.pdf", 0))).toBe("This file is empty");
    expect(validateUploadFile(file("a.pdf", UPLOAD_MAX_BYTES + 1))).toBe("This file is 5.1 MB. The limit is 5 MB");
    expect(validateUploadFile(file("a.pdf", Math.round(6.4 * 1024 * 1024)))).toBe("This file is 6.4 MB. The limit is 5 MB");
  });

  it("allows an empty title and up to 200 characters, counted like the API (code points, trimmed)", () => {
    expect(validateUploadTitle("")).toBeNull();
    expect(validateUploadTitle("x".repeat(UPLOAD_TITLE_MAX))).toBeNull();
    expect(validateUploadTitle(`  ${"x".repeat(UPLOAD_TITLE_MAX)}  `)).toBeNull();
    // 200 emoji are 400 UTF-16 units but 200 characters.
    expect(validateUploadTitle("📄".repeat(UPLOAD_TITLE_MAX))).toBeNull();
    expect(validateUploadTitle("x".repeat(UPLOAD_TITLE_MAX + 1))).toBe("Use at most 200 characters");
  });
});

describe("roles", () => {
  it("lets owners and admins write, and keeps staff read-only", () => {
    expect(canWriteKnowledge("owner")).toBe(true);
    expect(canWriteKnowledge("admin")).toBe(true);
    expect(canWriteKnowledge("staff")).toBe(false);
    expect(canWriteKnowledge("")).toBe(false);
  });

  it("lets every member, staff too, answer a question the AI couldn't", () => {
    for (const role of ["owner", "admin", "staff"]) expect(canAnswerGaps(role)).toBe(true);
    expect(canAnswerGaps("")).toBe(false);
  });
});

describe("unanswered questions", () => {
  it("counts like the prototype", () => {
    expect(askedText(1)).toBe("once");
    expect(askedText(2)).toBe("twice");
    expect(askedText(5)).toBe("5 times");
  });

  it("requires an answer within the FAQ answer limit", () => {
    expect(validateGapAnswer("  ")).toBe("Write the answer");
    expect(validateGapAnswer("y".repeat(2001))).toBe("Keep the answer under 2000 characters");
    expect(validateGapAnswer("Yes, on Sundays too.")).toBeNull();
  });
});
