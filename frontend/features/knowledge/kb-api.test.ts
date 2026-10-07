import { beforeEach, describe, expect, it, vi } from "vitest";

// The knowledge-base API calls in kb-content.ts against docs/contracts.md section 9: paths, methods,
// bodies, the bearer token and X-Pakka-Tenant (never a tenant in the body), response parsing and how
// each error reads in the UI.

const getSession = vi.fn();
vi.mock("@/lib/supabase/browser", () => ({ getSupabaseBrowserClient: () => ({ auth: { getSession } }) }));
const fetchMock = vi.fn<typeof fetch>();
vi.stubGlobal("fetch", fetchMock);

const kb = await import("./kb-content");
const { TENANT_HEADER } = await import("@/lib/api/client");
const { ApiError } = await import("@/lib/errors");

const TENANT = "c0000000-0000-0000-0000-00000000000a";
const FAQ_ID = "f0000000-0000-0000-0000-000000000001";
const DOC_ID = "d0000000-0000-0000-0000-000000000001";
const GAP_ID = "a0000000-0000-0000-0000-000000000001";

const sent = (n = 0) => {
  const [url, init] = fetchMock.mock.calls[n];
  return { url: String(url), method: init!.method, body: init!.body, headers: new Headers(init!.headers) };
};
const apiError = (status: number, code: string, message: string, fields?: Record<string, string>) =>
  Response.json({ error: { code, message, ...(fields && { fields }) } }, { status });
const noContent = () => new Response(null, { status: 204 });

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.pakkaagent.in");
  getSession.mockReset().mockResolvedValue({ data: { session: { access_token: "header.payload.sig" } } });
  fetchMock.mockReset();
});

function expectSignedRequest(n = 0) {
  const { headers, body } = sent(n);
  expect(headers.get("authorization")).toBe("Bearer header.payload.sig");
  expect(headers.get(TENANT_HEADER)).toBe(TENANT);
  if (typeof body === "string") expect(body).not.toContain(TENANT);
}

describe("FAQ writes", () => {
  it("creates an FAQ with POST /api/kb/faqs { q, a }", async () => {
    fetchMock.mockResolvedValue(Response.json({ id: FAQ_ID, q: "Parking?", a: "Yes." }, { status: 201 }));
    expect(await kb.createFaq(TENANT, { q: "Parking?", a: "Yes." })).toEqual({ id: FAQ_ID, q: "Parking?", a: "Yes.", status: "ready" });
    expect(sent()).toMatchObject({ url: "https://api.pakkaagent.in/api/kb/faqs", method: "POST", body: '{"q":"Parking?","a":"Yes."}' });
    expect(sent().headers.get("content-type")).toBe("application/json");
    expectSignedRequest();
  });

  it("edits with PATCH /api/kb/faqs/:id and only the changed fields", async () => {
    fetchMock.mockResolvedValue(Response.json({ id: FAQ_ID, q: "Parking?", a: "No." }));
    await kb.updateFaq(TENANT, FAQ_ID, { a: "No." });
    expect(sent()).toMatchObject({ url: `https://api.pakkaagent.in/api/kb/faqs/${FAQ_ID}`, method: "PATCH", body: '{"a":"No."}' });
    expectSignedRequest();
  });

  it("deletes with DELETE /api/kb/faqs/:id and accepts 204", async () => {
    fetchMock.mockResolvedValue(noContent());
    await expect(kb.deleteFaq(TENANT, FAQ_ID)).resolves.toBeUndefined();
    expect(sent()).toMatchObject({ url: `https://api.pakkaagent.in/api/kb/faqs/${FAQ_ID}`, method: "DELETE", body: undefined });
    expect(sent().headers.has("content-type")).toBe(false);
    expectSignedRequest();
  });

  it("escapes ids in the path", async () => {
    fetchMock.mockResolvedValue(noContent());
    await kb.deleteFaq(TENANT, "a/b?c");
    expect(sent().url).toBe("https://api.pakkaagent.in/api/kb/faqs/a%2Fb%3Fc");
  });

  it("shows a duplicate question (conflict) on the question field", async () => {
    fetchMock.mockResolvedValue(apiError(409, "conflict", "A FAQ with this question exists."));
    const err = await kb.createFaq(TENANT, { q: "Parking?", a: "Yes." }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(kb.describeKbWriteError(err, "Couldn't save the FAQ", "FAQ")).toMatchObject({
      code: "conflict",
      title: "Couldn't save the FAQ",
      message: kb.DUPLICATE_FAQ,
      fields: { q: kb.DUPLICATE_FAQ },
      retryable: false,
    });
  });

  it("keeps the API's field messages for validation_failed", async () => {
    fetchMock.mockResolvedValue(apiError(400, "validation_failed", "Check the fields.", { a: "Keep the answer under 2000 characters." }));
    const err = await kb.updateFaq(TENANT, FAQ_ID, { a: "x" }).catch((e: unknown) => e);
    expect(kb.describeKbWriteError(err, "Couldn't save the FAQ", "FAQ")).toMatchObject({
      code: "validation_failed",
      fields: { a: "Keep the answer under 2000 characters." },
    });
  });

  it("explains not_found, forbidden, offline and an unexpected reply", async () => {
    fetchMock.mockResolvedValueOnce(apiError(404, "not_found", "Not found."));
    const gone = await kb.deleteFaq(TENANT, FAQ_ID).catch((e: unknown) => e);
    expect(kb.describeKbWriteError(gone, "Couldn't delete the FAQ", "FAQ").message).toBe("This FAQ no longer exists. Refresh to see the current list.");

    fetchMock.mockResolvedValueOnce(apiError(403, "forbidden", "Only an owner or admin can do this."));
    const staff = await kb.createFaq(TENANT, { q: "a", a: "b" }).catch((e: unknown) => e);
    expect(kb.describeKbWriteError(staff, "Couldn't save the FAQ", "FAQ").message).toBe("Only an owner or admin can change the knowledge base.");

    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const offline = await kb.createFaq(TENANT, { q: "a", a: "b" }).catch((e: unknown) => e);
    expect(kb.describeKbWriteError(offline, "Couldn't save the FAQ", "FAQ")).toMatchObject({ code: "network", title: "Couldn't save the FAQ", retryable: true });

    fetchMock.mockResolvedValueOnce(Response.json({ id: "not-a-uuid" }));
    const odd = await kb.createFaq(TENANT, { q: "a", a: "b" }).catch((e: unknown) => e);
    expect(odd).toBeInstanceOf(kb.KbDataError);
    expect(kb.describeKbWriteError(odd, "Couldn't save the FAQ", "FAQ").message).toMatch(/unexpected/);
  });

  it("never shows an error message that carries a credential", async () => {
    fetchMock.mockResolvedValue(apiError(502, "upstream_failed", "embed failed: Bearer abc.def.ghi"));
    const err = await kb.createFaq(TENANT, { q: "a", a: "b" }).catch((e: unknown) => e);
    expect(kb.describeKbWriteError(err, "Couldn't save the FAQ", "FAQ").message).not.toContain("abc.def");
  });
});

describe("document upload and delete", () => {
  const file = new File(["# Prices\nHaircut 300"], "prices.md", { type: "text/markdown" });

  it("uploads multipart with file and title, letting the browser set the boundary", async () => {
    fetchMock.mockResolvedValue(
      Response.json({ id: DOC_ID, title: "Price list", sourceType: "upload", status: "processing", createdAt: "2026-10-07T05:30:00Z" }, { status: 202 }),
    );
    const doc = await kb.uploadDocument(TENANT, file, "  Price list ");
    expect(doc).toMatchObject({ id: DOC_ID, name: "Price list", sourceType: "upload", status: "processing", createdAt: "2026-10-07T05:30:00.000Z" });

    const { url, method, body, headers } = sent();
    expect(url).toBe("https://api.pakkaagent.in/api/kb/documents");
    expect(method).toBe("POST");
    expect(body).toBeInstanceOf(FormData);
    const form = body as FormData;
    expect((form.get("file") as File).name).toBe("prices.md");
    expect(form.get("title")).toBe("Price list");
    expect([...form.keys()].sort()).toEqual(["file", "title"]);
    // No hand-written multipart content type: fetch adds it with the boundary.
    expect(headers.has("content-type")).toBe(false);
    expectSignedRequest();
  });

  it("leaves out a blank title", async () => {
    fetchMock.mockResolvedValue(Response.json({ id: DOC_ID, title: "prices.md", sourceType: "upload", status: "processing", createdAt: "2026-10-07T05:30:00Z" }, { status: 202 }));
    await kb.uploadDocument(TENANT, file, "   ");
    expect((sent().body as FormData).has("title")).toBe(false);
  });

  it("puts the API's file error on the file field", async () => {
    fetchMock.mockResolvedValue(apiError(400, "validation_failed", "Check the file.", { file: "Files can be at most 5 MB." }));
    const err = await kb.uploadDocument(TENANT, file).catch((e: unknown) => e);
    expect(kb.describeKbWriteError(err, "Couldn't upload the document", "document")).toMatchObject({ fields: { file: "Files can be at most 5 MB." } });
  });

  it("rejects an upload reply that isn't the contract's shape", async () => {
    fetchMock.mockResolvedValue(Response.json({ id: DOC_ID, status: "done" }, { status: 202 }));
    await expect(kb.uploadDocument(TENANT, file)).rejects.toBeInstanceOf(kb.KbDataError);
  });

  it("deletes with DELETE /api/kb/documents/:id", async () => {
    fetchMock.mockResolvedValue(noContent());
    await kb.deleteDocument(TENANT, DOC_ID);
    expect(sent()).toMatchObject({ url: `https://api.pakkaagent.in/api/kb/documents/${DOC_ID}`, method: "DELETE" });
    expectSignedRequest();
  });
});

describe("gaps", () => {
  it("lists open gaps with GET /api/kb/gaps in the API's order", async () => {
    const gaps = [
      { id: GAP_ID, question: "Do you do home visits?", askedCount: 4, lastAskedBy: "Priya" },
      { id: "a0000000-0000-0000-0000-000000000002", question: "Parking?", askedCount: 1, lastAskedBy: "+91 98••• ••321" },
    ];
    fetchMock.mockResolvedValue(Response.json(gaps));
    expect(await kb.listGaps(TENANT)).toEqual(gaps);
    expect(sent()).toMatchObject({ url: "https://api.pakkaagent.in/api/kb/gaps", method: "GET", body: undefined });
    expectSignedRequest();
  });

  it("accepts a gap whose contact was deleted, and rejects other shapes", async () => {
    fetchMock.mockResolvedValueOnce(Response.json([{ id: GAP_ID, question: "Q?", askedCount: 2, lastAskedBy: null }]));
    expect((await kb.listGaps(TENANT))[0].lastAskedBy).toBeNull();
    fetchMock.mockResolvedValueOnce(Response.json([{ id: GAP_ID, question: "Q?", askedCount: 0, lastAskedBy: "A" }]));
    await expect(kb.listGaps(TENANT)).rejects.toBeInstanceOf(kb.KbDataError);
  });

  it("throws the API's error for a failed list", async () => {
    fetchMock.mockResolvedValue(apiError(500, "internal", "Something went wrong."));
    await expect(kb.listGaps(TENANT)).rejects.toMatchObject({ status: 500, body: { error: { code: "internal" } } });
  });

  it("answers with POST /api/kb/gaps/:id/answer { a } and returns the new FAQ", async () => {
    fetchMock.mockResolvedValue(Response.json({ faq: { id: FAQ_ID, q: "Do you do home visits?", a: "Yes, within 5 km." } }));
    expect(await kb.answerGap(TENANT, GAP_ID, "Yes, within 5 km.")).toEqual({ id: FAQ_ID, q: "Do you do home visits?", a: "Yes, within 5 km.", status: "ready" });
    expect(sent()).toMatchObject({ url: `https://api.pakkaagent.in/api/kb/gaps/${GAP_ID}/answer`, method: "POST", body: '{"a":"Yes, within 5 km."}' });
    expectSignedRequest();
  });

  it("rejects an answer reply without the FAQ", async () => {
    fetchMock.mockResolvedValue(Response.json({ id: FAQ_ID }));
    await expect(kb.answerGap(TENANT, GAP_ID, "Yes")).rejects.toBeInstanceOf(kb.KbDataError);
  });

  it("dismisses with POST /api/kb/gaps/:id/dismiss and accepts 204", async () => {
    fetchMock.mockResolvedValue(noContent());
    await kb.dismissGap(TENANT, GAP_ID);
    expect(sent()).toMatchObject({ url: `https://api.pakkaagent.in/api/kb/gaps/${GAP_ID}/dismiss`, method: "POST", body: undefined });
    expectSignedRequest();
  });

  it("explains a conflicting answer without blaming the question field", async () => {
    fetchMock.mockResolvedValue(apiError(409, "conflict", "This question was already answered."));
    const err = await kb.answerGap(TENANT, GAP_ID, "Yes").catch((e: unknown) => e);
    const shown = kb.describeKbWriteError(err, "Couldn't save the answer", "question");
    expect(shown).toMatchObject({ code: "conflict", message: kb.GAP_CONFLICT });
    expect(shown.fields).toBeUndefined();
  });

  it("reports a gap someone else already closed", async () => {
    fetchMock.mockResolvedValue(apiError(404, "not_found", "Not found."));
    const err = await kb.dismissGap(TENANT, GAP_ID).catch((e: unknown) => e);
    expect(kb.describeKbWriteError(err, "Couldn't dismiss the question", "question").message).toBe("This question no longer exists. Refresh to see the current list.");
  });
});
