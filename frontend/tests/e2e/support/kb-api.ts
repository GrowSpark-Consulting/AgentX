import type { APIRequestContext, Page, Route } from "@playwright/test";
import { MOCK_SUPABASE_URL } from "./app";

// The knowledge-base routes of docs/contracts.md section 9, emulated in the browser with page.route.
// The real routes (backend/src/server/routes.ts, Dev 1) aren't built yet, and the API answers an unknown
// route with a 404 the browser rejects (no CORS headers), so every page that loads the Knowledge base
// needs this. It speaks the contract only: paths, methods, bodies, status codes and the
// `{ error: { code, message, fields? } }` envelope. Rows live in mock-supabase.mjs, so the page's RLS
// reads see what the "API" wrote. Like the real API, the business comes from X-Pakka-Tenant and the
// member's role decides writes (owner and admin; staff may answer a gap); nothing is read from the body.

export type Gap = { id: string; question: string; askedCount: number; lastAskedBy: string | null };
export type KbCall = {
  /** "POST /api/kb/faqs", "PATCH /api/kb/faqs/:id" … */
  route: string;
  path: string;
  tenant: string | null;
  authorization: string | null;
  contentType: string | null;
  body: string;
};
export type KbFailure = { status: number; code: string; message: string; fields?: Record<string, string> };
type StoredDoc = { id: string; tenant_id: string; source_type: string; title: string | null; body: string | null; status: string; created_at: string };

const UUID_SEGMENT = /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const UPLOAD_MAX_BYTES = 5 * 1024 * 1024;
const UPLOAD_TYPES = /\.(pdf|docx|txt|md)$/i;

export interface KbApi {
  calls: KbCall[];
  /** Writes only (anything but GET). */
  writes(): KbCall[];
  /** The open gaps GET /api/kb/gaps answers with, most asked first. */
  setGaps(gaps: Gap[]): void;
  /** Answers `route` (e.g. "POST /api/kb/faqs") with this error until cleared with null. */
  fail(route: string, failure: KbFailure | null): void;
  /** Holds `route` until the returned function is called, to see the in-flight state. */
  hold(route: string): () => void;
}

export async function mockKbApi(page: Page, request: APIRequestContext, { role = "owner" }: { role?: "owner" | "admin" | "staff" } = {}): Promise<KbApi> {
  const calls: KbCall[] = [];
  let gaps: Gap[] = [];
  const failures = new Map<string, KbFailure>();
  const holds = new Map<string, Promise<void>>();

  const json = (route: Route, status: number, body: unknown) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  const error = (route: Route, f: KbFailure) => json(route, f.status, { error: { code: f.code, message: f.message, ...(f.fields && { fields: f.fields }) } });
  const stored = async (tenant: string): Promise<StoredDoc[]> => (await request.get(`${MOCK_SUPABASE_URL}/__mock/kb-documents?tenant=${tenant}`)).json();
  const insert = async (row: Partial<StoredDoc> & { tenant_id: string; source_type: string }): Promise<StoredDoc> =>
    (await request.post(`${MOCK_SUPABASE_URL}/__mock/kb-documents`, { data: row })).json();
  const sameQuestion = (a: string | null, b: string) => (a ?? "").trim().toLowerCase() === b.trim().toLowerCase();

  await page.route(/\/api\/kb\//, async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const name = `${req.method()} ${path.replace(UUID_SEGMENT, "/:id")}`;
    const tenant = req.headers()["x-pakka-tenant"] ?? null;
    const contentType = req.headers()["content-type"] ?? null;
    const bytes = req.postDataBuffer() ?? Buffer.alloc(0);
    const raw = bytes.toString("utf8");
    calls.push({ route: name, path, tenant, authorization: req.headers()["authorization"] ?? null, contentType, body: raw });

    const held = holds.get(name);
    if (held) await held;
    const failure = failures.get(name);
    if (failure) return error(route, failure);
    if (!tenant) return error(route, { status: 403, code: "no_membership", message: "Choose a business first." });
    if (req.method() !== "GET" && role === "staff" && name !== "POST /api/kb/gaps/:id/answer") {
      return error(route, { status: 403, code: "forbidden", message: "Only an owner or admin can change the knowledge base." });
    }
    const id = /\/([0-9a-f-]{36})(?:\/|$)/i.exec(path)?.[1] ?? "";
    const docs = await stored(tenant);
    const notFound = () => error(route, { status: 404, code: "not_found", message: "Not found." });

    switch (name) {
      case "POST /api/kb/faqs": {
        const { q, a } = JSON.parse(raw) as { q: string; a: string };
        if (docs.some((d) => d.source_type === "manual" && sameQuestion(d.title, q))) {
          return error(route, { status: 409, code: "conflict", message: "There's already an FAQ with this question." });
        }
        const row = await insert({ tenant_id: tenant, source_type: "manual", title: q, body: a, status: "ready" });
        return json(route, 201, { id: row.id, q: row.title, a: row.body });
      }
      case "PATCH /api/kb/faqs/:id": {
        const row = docs.find((d) => d.id === id && d.source_type === "manual");
        if (!row) return notFound();
        const { q, a } = JSON.parse(raw) as { q?: string; a?: string };
        if (q !== undefined && docs.some((d) => d.id !== id && d.source_type === "manual" && sameQuestion(d.title, q))) {
          return error(route, { status: 409, code: "conflict", message: "There's already an FAQ with this question." });
        }
        const patched = await (await request.patch(`${MOCK_SUPABASE_URL}/__mock/kb-documents?id=${id}`, { data: { title: q, body: a, status: "ready" } })).json();
        return json(route, 200, { id, q: patched.title, a: patched.body });
      }
      case "DELETE /api/kb/faqs/:id":
      case "DELETE /api/kb/documents/:id": {
        const manual = name.includes("/faqs/");
        if (!docs.some((d) => d.id === id && (d.source_type === "manual") === manual)) return notFound();
        await request.delete(`${MOCK_SUPABASE_URL}/__mock/kb-documents?id=${id}`);
        return route.fulfill({ status: 204 });
      }
      case "POST /api/kb/documents": {
        if (!contentType?.startsWith("multipart/form-data")) {
          return error(route, { status: 400, code: "validation_failed", message: "Send the file as multipart/form-data.", fields: { file: "Choose a file to upload." } });
        }
        const fileName = /name="file"; filename="([^"]*)"/.exec(raw)?.[1] ?? "";
        const title = /name="title"\r\n\r\n([^\r]*)\r\n/.exec(raw)?.[1];
        if (!UPLOAD_TYPES.test(fileName)) {
          return error(route, { status: 400, code: "validation_failed", message: "Check the file.", fields: { file: "Upload a PDF, DOCX, TXT or MD file." } });
        }
        if (bytes.length > UPLOAD_MAX_BYTES + 4096) {
          return error(route, { status: 400, code: "validation_failed", message: "Check the file.", fields: { file: "Files can be at most 5 MB." } });
        }
        const row = await insert({ tenant_id: tenant, source_type: "upload", title: title || fileName, status: "processing" });
        return json(route, 202, { id: row.id, title: row.title, sourceType: "upload", status: "processing", createdAt: row.created_at });
      }
      case "GET /api/kb/gaps":
        return json(route, 200, [...gaps].sort((a, b) => b.askedCount - a.askedCount));
      case "POST /api/kb/gaps/:id/answer": {
        const gap = gaps.find((g) => g.id === id);
        if (!gap) return notFound();
        const { a } = JSON.parse(raw) as { a: string };
        // answer_kb_gap: a question an FAQ already asks is 23505 -> conflict, and the gap stays open.
        if (docs.some((d) => d.source_type === "manual" && sameQuestion(d.title, gap.question))) {
          return error(route, { status: 409, code: "conflict", message: "There's already an FAQ with this question." });
        }
        const row = await insert({ tenant_id: tenant, source_type: "manual", title: gap.question, body: a, status: "ready" });
        gaps = gaps.filter((g) => g.id !== id);
        return json(route, 200, { faq: { id: row.id, q: row.title, a: row.body } });
      }
      case "POST /api/kb/gaps/:id/dismiss": {
        if (!gaps.some((g) => g.id === id)) return notFound();
        gaps = gaps.filter((g) => g.id !== id);
        return route.fulfill({ status: 204 });
      }
      default:
        return notFound();
    }
  });

  return {
    calls,
    writes: () => calls.filter((c) => !c.route.startsWith("GET ")),
    setGaps: (next) => {
      gaps = [...next];
    },
    fail: (name, failure) => {
      if (failure) failures.set(name, failure);
      else failures.delete(name);
    },
    hold: (name) => {
      let release!: () => void;
      holds.set(name, new Promise<void>((r) => (release = r)));
      return () => {
        holds.delete(name);
        release();
      };
    },
  };
}
