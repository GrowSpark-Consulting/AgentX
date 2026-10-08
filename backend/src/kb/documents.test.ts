import type { TenantContext } from "@pakka/types";
import { describe, expect, it, vi } from "vitest";
import { AppError } from "../lib/errors";
import { fakeKbStore } from "../test-support/fake-kb-store";
import { TimeoutError } from "../lib/timeout";
import { deleteDocument, KB_UPLOAD_EVENT, KB_UPLOAD_MAX_BODY_BYTES, MAX_DOCUMENTS, uploadDocument, type UploadDeps } from "./documents";
import { MAX_FILE_BYTES } from "./extract";

// The upload and delete services behind POST /api/kb/documents and DELETE /api/kb/documents/:id
// (docs/contracts.md, section 9). The store is in memory and enforces the tenant filter; the text
// extraction is replaced unless a test is about what it refuses.

const A = "e0000000-0000-0000-0000-00000000000a";
const B = "e0000000-0000-0000-0000-00000000000b";

const ctx = (role: "owner" | "admin" | "staff", tenantId = A): TenantContext => ({
  user: { id: "00000000-0000-0000-0000-0000000000a1", email: "owner@test.local" },
  role,
  tenant: { id: tenantId, name: "Test", vertical: "real-estate", timezone: "Asia/Kolkata", status: "active", planKey: "pro", trialEndsAt: null },
});

function formRequest(parts: { file?: File | string | null; title?: string }): Request {
  const form = new FormData();
  if (parts.file !== undefined && parts.file !== null) form.set("file", parts.file);
  if (parts.title !== undefined) form.set("title", parts.title);
  return new Request("http://localhost:4000/api/kb/documents", { method: "POST", body: form });
}
const file = (name = "Price list.txt", content: string | Uint8Array = "2BHK from 60 lakh") =>
  new File([content] as unknown as ConstructorParameters<typeof File>[0], name, { type: "text/plain" });

function setup(overrides: Partial<UploadDeps> = {}) {
  const fake = fakeKbStore();
  const send = vi.fn<UploadDeps["send"]>(async () => undefined);
  const extract = vi.fn<UploadDeps["extract"]>(async () => "Extracted text of the file.");
  const deps: UploadDeps = { store: fake.store, extract, send, ...overrides };
  return { ...fake, send, extract, deps };
}

const failure = async (promise: Promise<unknown>): Promise<AppError> => {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(AppError);
  return error as AppError;
};

describe("the upload limits", () => {
  it("leave room for a 5 MB file plus its multipart wrapping, as the contract says", () => {
    expect(KB_UPLOAD_MAX_BODY_BYTES).toBe(6 * 1024 * 1024);
    expect(KB_UPLOAD_MAX_BODY_BYTES).toBeGreaterThan(MAX_FILE_BYTES);
  });
});

describe("uploadDocument", () => {
  it("accepts an owner and an admin, and answers with the 202 shape", async () => {
    for (const role of ["owner", "admin"] as const) {
      const { deps, docs } = setup();
      const result = await uploadDocument(ctx(role), formRequest({ file: file("Price list 2026.txt") }), deps);
      const [doc] = [...docs.values()];
      expect(result).toEqual({ id: doc.id, title: "Price list 2026", sourceType: "upload", status: "processing", createdAt: doc.createdAt });
      expect(Number.isNaN(Date.parse(result.createdAt))).toBe(false);
    }
  });

  it("refuses staff before it reads the upload at all", async () => {
    const { deps, docs, extract, send } = setup();
    const request = formRequest({ file: file() });
    const formData = vi.spyOn(request, "formData");
    const error = await failure(uploadDocument(ctx("staff"), request, deps));
    expect(error.code).toBe("forbidden");
    expect(formData).not.toHaveBeenCalled();
    expect(extract).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    expect(docs.size).toBe(0);
  });

  it("stores the extracted text for the signed-in business, as a processing upload", async () => {
    const { deps, docs, extract } = setup();
    await uploadDocument(ctx("owner", B), formRequest({ file: file("Brochure.pdf", "bytes") }), deps);
    const [doc] = [...docs.values()];
    expect(doc).toMatchObject({ tenantId: B, sourceType: "upload", status: "processing", body: "Extracted text of the file.", error: null });
    expect(extract).toHaveBeenCalledOnce();
    const given = extract.mock.calls[0][0];
    expect(given.name).toBe("Brochure.pdf");
    expect(new TextDecoder().decode(given.bytes)).toBe("bytes");
  });

  it("starts the ingest job with ids only and a fixed event id, so a repeat is dropped", async () => {
    const { deps, docs, send } = setup();
    await uploadDocument(ctx("owner"), formRequest({ file: file() }), deps);
    const [doc] = [...docs.values()];
    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0][0]).toEqual({
      id: `kb_document_uploaded:${doc.id}`,
      name: KB_UPLOAD_EVENT,
      data: { tenantId: A, documentId: doc.id },
    });
    expect(KB_UPLOAD_EVENT).toBe("kb/document.uploaded");
  });

  describe("the title", () => {
    const titleOf = async (parts: { file?: File; title?: string }) => {
      const { deps } = setup();
      return (await uploadDocument(ctx("owner"), formRequest({ file: parts.file ?? file(), title: parts.title }), deps)).title;
    };

    it("is the file name without its extension by default", async () => {
      expect(await titleOf({ file: file("Price list 2026.final.txt") })).toBe("Price list 2026.final");
    });
    it("is the one given, trimmed and with spaces collapsed", async () => {
      expect(await titleOf({ title: "  Price   list \n 2026 " })).toBe("Price list 2026");
    });
    it("loses control characters, which the database would refuse (NUL) or which would garble the list", async () => {
      expect(await titleOf({ title: "Price\u0000 list\u0007\u009f" })).toBe("Price list");
    });
    it("falls back to the file name when the title is blank", async () => {
      expect(await titleOf({ file: file("Brochure.md"), title: "   " })).toBe("Brochure");
    });
    it("drops any folder from the file name", async () => {
      expect(await titleOf({ file: file("C:\\Users\\me\\Docs\\Plan.txt") })).toBe("Plan");
      expect(await titleOf({ file: file("../../etc/Notes.md") })).toBe("Notes");
    });
    it("is cut to 200 characters when it comes from a long file name", async () => {
      expect((await titleOf({ file: file(`${"a".repeat(300)}.txt`) })).length).toBe(200);
    });
    it("is refused over 200 characters when the person typed it", async () => {
      const { deps, docs } = setup();
      const error = await failure(uploadDocument(ctx("owner"), formRequest({ file: file(), title: "x".repeat(201) }), deps));
      expect(error.code).toBe("validation_failed");
      expect(error.fields).toHaveProperty("title");
      expect(docs.size).toBe(0);
    });
  });

  describe("what it refuses before doing any work", () => {
    const refused = async (request: Request, over: Partial<UploadDeps> = {}) => {
      const s = setup(over);
      const error = await failure(uploadDocument(ctx("owner"), request, s.deps));
      expect(error.code).toBe("validation_failed");
      expect(error.fields).toHaveProperty("file");
      expect(s.docs.size).toBe(0);
      expect(s.send).not.toHaveBeenCalled();
      return { error, ...s };
    };

    it("a body that is not a form upload", async () => {
      const request = new Request("http://localhost:4000/api/kb/documents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ file: "x" }),
      });
      const { extract } = await refused(request);
      expect(extract).not.toHaveBeenCalled();
    });

    it("a multipart body that cannot be read", async () => {
      const request = new Request("http://localhost:4000/api/kb/documents", {
        method: "POST",
        headers: { "content-type": "multipart/form-data; boundary=xyz" },
        body: "this is not multipart",
      });
      await refused(request);
    });

    it("no file at all", async () => {
      await refused(formRequest({ title: "Only a title" }));
    });

    it("a file field that is plain text, not a file", async () => {
      await refused(formRequest({ file: "just text" }));
    });

    it("an empty file", async () => {
      const { extract } = await refused(formRequest({ file: file("Empty.txt", "") }));
      expect(extract).not.toHaveBeenCalled();
    });

    it("a file over 5 MB, with the advice on the file field, without reading it", async () => {
      const { error, extract } = await refused(formRequest({ file: file("Big.pdf", new Uint8Array(MAX_FILE_BYTES + 1)) }));
      expect(error.fields?.file).toMatch(/5 MB/);
      expect(extract).not.toHaveBeenCalled();
    });

    it("lets a file of exactly 5 MB through to the reader", async () => {
      const { deps, extract } = setup();
      await uploadDocument(ctx("owner"), formRequest({ file: file("Edge.txt", new Uint8Array(MAX_FILE_BYTES)) }), deps);
      expect(extract).toHaveBeenCalledOnce();
    });

    it("a kind of file that is not accepted, using the real reader", async () => {
      const real = (await import("./extract")).extractText;
      const { error } = await refused(formRequest({ file: file("Run.exe", "MZ") }), { extract: real });
      expect(error.fields?.file).toMatch(/PDF|Word|text/i);
    });
  });

  it("reads a text file end to end with the real reader", async () => {
    const real = (await import("./extract")).extractText;
    const { deps, docs } = setup({ extract: real });
    await uploadDocument(ctx("owner"), formRequest({ file: file("Faq.md", "Parking is free.\r\nGym on level 2.") }), deps);
    expect([...docs.values()][0].body).toBe("Parking is free.\nGym on level 2.");
  });

  it("stores nothing and starts nothing when the file cannot be read", async () => {
    const reason = new AppError("validation_failed", "We couldn't read this file.", { file: "We couldn't read this file." });
    const { deps, docs, send } = setup({ extract: async () => Promise.reject(reason) });
    const error = await failure(uploadDocument(ctx("owner"), formRequest({ file: file() }), deps));
    expect(error).toBe(reason);
    expect(docs.size).toBe(0);
    expect(send).not.toHaveBeenCalled();
  });

  it("refuses a file with more text than the knowledge base holds, before storing anything", async () => {
    const huge = "Sentence about the project. ".repeat(40_000); // about 1.1 million characters: over 500 chunks
    const { deps, docs, send } = setup({ extract: async () => huge });
    const error = await failure(uploadDocument(ctx("owner"), formRequest({ file: file() }), deps));
    expect(error.code).toBe("validation_failed");
    expect(error.fields).toHaveProperty("file");
    expect(docs.size).toBe(0);
    expect(send).not.toHaveBeenCalled();
  });

  it("marks the document failed, and says so in fixed words, when the job could not be started", async () => {
    const { deps, docs } = setup({ send: async () => Promise.reject(new Error("connect ECONNREFUSED 10.0.0.5:8288 key sk-secret")) });
    const error = await failure(uploadDocument(ctx("owner"), formRequest({ file: file() }), deps));
    expect(error.code).toBe("upstream_failed");
    expect(error.message).not.toMatch(/10\.0\.0\.5|sk-secret|ECONNREFUSED/);
    const [doc] = [...docs.values()];
    expect(doc.status).toBe("failed");
    expect(doc.error).toMatch(/upload it again/i);
    expect(doc.error).not.toMatch(/10\.0\.0\.5|sk-secret/);
  });

  it("does not hide the failure when it also cannot mark the document failed", async () => {
    const s = setup({ send: async () => Promise.reject(new Error("down")) });
    s.state.failNext.add("setStatus");
    const error = await failure(uploadDocument(ctx("owner"), formRequest({ file: file() }), s.deps));
    expect(error.code).toBe("upstream_failed");
  });

  it("passes on a store failure without making a document", async () => {
    const s = setup();
    s.state.failNext.add("insertUpload");
    await expect(uploadDocument(ctx("owner"), formRequest({ file: file() }), s.deps)).rejects.toThrow();
    expect(s.docs.size).toBe(0);
    expect(s.send).not.toHaveBeenCalled();
  });

  it("keeps each business's documents to itself", async () => {
    const s = setup();
    await uploadDocument(ctx("owner", A), formRequest({ file: file("A.txt") }), s.deps);
    await uploadDocument(ctx("owner", B), formRequest({ file: file("B.txt") }), s.deps);
    const tenants = [...s.docs.values()].map((d) => [d.title, d.tenantId]);
    expect(tenants).toEqual([["A", A], ["B", B]]);
  });
});

describe("deleteDocument", () => {
  const ID = "e2000000-0000-0000-0000-0000000000a1";
  const seeded = () => {
    const s = fakeKbStore([
      { id: ID, tenantId: A, sourceType: "upload", title: "Brochure", status: "ready" },
      { id: "e2000000-0000-0000-0000-0000000000a2", tenantId: A, sourceType: "manual", title: "Parking?", status: "ready" },
      { id: "e2000000-0000-0000-0000-0000000000b1", tenantId: B, sourceType: "upload", title: "Other", status: "ready" },
    ]);
    return s;
  };

  it("removes an upload (its chunks go with it) and answers with nothing, for an owner or an admin", async () => {
    for (const role of ["owner", "admin"] as const) {
      const s = seeded();
      s.chunks.set(ID, [{ content: "x", embedding: [1] }]);
      await expect(deleteDocument(ctx(role), ID, s.store)).resolves.toBeUndefined();
      expect(s.docs.has(ID)).toBe(false);
      expect(s.chunks.has(ID)).toBe(false);
    }
  });

  it("refuses staff, and changes nothing", async () => {
    const s = seeded();
    const error = await failure(deleteDocument(ctx("staff"), ID, s.store));
    expect(error.code).toBe("forbidden");
    expect(s.docs.has(ID)).toBe(true);
    expect(s.calls).toEqual([]);
  });

  it("does not find another business's document, and leaves it alone", async () => {
    const s = seeded();
    const error = await failure(deleteDocument(ctx("owner", A), "e2000000-0000-0000-0000-0000000000b1", s.store));
    expect(error.code).toBe("not_found");
    expect(s.docs.has("e2000000-0000-0000-0000-0000000000b1")).toBe(true);
  });

  it("does not delete an FAQ here (FAQs have their own routes)", async () => {
    const s = seeded();
    const error = await failure(deleteDocument(ctx("owner"), "e2000000-0000-0000-0000-0000000000a2", s.store));
    expect(error.code).toBe("not_found");
    expect(s.docs.has("e2000000-0000-0000-0000-0000000000a2")).toBe(true);
  });

  it.each(["not-an-id", "", "1", "e2000000-0000-0000-0000-0000000000a1'; drop table kb_documents;--"])("treats %j as not found without asking the store", async (id) => {
    const s = seeded();
    const error = await failure(deleteDocument(ctx("owner"), id, s.store));
    expect(error.code).toBe("not_found");
    expect(s.calls).toEqual([]);
  });

  it("is not found the second time", async () => {
    const s = seeded();
    await deleteDocument(ctx("owner"), ID, s.store);
    expect((await failure(deleteDocument(ctx("owner"), ID, s.store))).code).toBe("not_found");
  });
});

describe("uploadDocument: limits and an unsure start", () => {
  it("refuses a business that already has 100 documents, before reading the file, and counts neither FAQs nor other businesses", async () => {
    const s = setup();
    for (let i = 0; i < MAX_DOCUMENTS; i++) s.add({ tenantId: A, sourceType: "upload", status: "ready" });
    const error = await failure(uploadDocument(ctx("owner", A), formRequest({ file: file() }), s.deps));
    expect(error.code).toBe("validation_failed");
    expect(error.fields?.file).toMatch(/100 documents/);
    expect(s.extract).not.toHaveBeenCalled();
    expect(s.send).not.toHaveBeenCalled();

    // FAQs do not count, and neither do another business's documents
    const t = setup();
    for (let i = 0; i < MAX_DOCUMENTS; i++) t.add({ tenantId: A, sourceType: "manual", status: "ready" });
    for (let i = 0; i < MAX_DOCUMENTS; i++) t.add({ tenantId: B, sourceType: "upload", status: "ready" });
    await expect(uploadDocument(ctx("owner", A), formRequest({ file: file() }), t.deps)).resolves.toMatchObject({ status: "processing" });
  });

  it("lets the 100th document in", async () => {
    const s = setup();
    for (let i = 0; i < MAX_DOCUMENTS - 1; i++) s.add({ tenantId: A, sourceType: "upload", status: "ready" });
    await expect(uploadDocument(ctx("owner", A), formRequest({ file: file() }), s.deps)).resolves.toMatchObject({ status: "processing" });
  });

  it("does not call a send that timed out a failure: the job may be running, so the upload stands as processing", async () => {
    const s = setup({ send: async () => Promise.reject(new TimeoutError()) });
    const result = await uploadDocument(ctx("owner"), formRequest({ file: file() }), s.deps);
    expect(result.status).toBe("processing");
    expect([...s.docs.values()][0]).toMatchObject({ status: "processing", error: null });
  });

  it("cannot tell a document that a job already finished that it failed", async () => {
    const holder: { docs?: Map<string, { status: string }> } = {};
    const s = setup({
      send: async () => {
        // the event had in fact been accepted and the job ran to the end before the answer came back as an error
        for (const doc of holder.docs?.values() ?? []) doc.status = "ready";
        throw new Error("connection reset");
      },
    });
    holder.docs = s.docs;
    const error = await failure(uploadDocument(ctx("owner"), formRequest({ file: file() }), s.deps));
    expect(error.code).toBe("upstream_failed");
    expect([...s.docs.values()][0].status).toBe("ready");
  });

  it("answers a refused role before it needs any setting, with no dependencies given", async () => {
    // Nothing is configured in a test, so building the real store would throw; a staff member must get "forbidden".
    const error = await failure(uploadDocument(ctx("staff"), formRequest({ file: file() })));
    expect(error.code).toBe("forbidden");
    expect((await failure(deleteDocument(ctx("staff"), "e2000000-0000-0000-0000-0000000000a1"))).code).toBe("forbidden");
  });

  it("counts a title's length in characters people see (code points), not in UTF-16 units", async () => {
    const { deps } = setup();
    const ok = await uploadDocument(ctx("owner"), formRequest({ file: file(), title: "\u{1F600}".repeat(150) }), deps);
    expect([...ok.title]).toHaveLength(150);
    const tooLong = await failure(uploadDocument(ctx("owner"), formRequest({ file: file(), title: "\u{1F600}".repeat(201) }), deps));
    expect(tooLong.fields).toHaveProperty("title");
  });
});
