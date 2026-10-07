import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { apiFetch, patchJson, postForm, postJson, sendNoContent, type ApiPath } from "@/lib/api/client";
import { apiErrorFrom, formatError, type FormattedError } from "@/lib/errors";

// The Knowledge base sections other than services: documents, FAQs and "questions the AI couldn't
// answer" (gaps), against docs/contracts.md section 9 and docs/kb-contract-checklist.md.
//
//   Reads   Direct RLS reads of kb_documents (0001; status from 0011): FAQs are the manual rows (title =
//           question, body = answer), documents are every other source. Members read, never write.
//   Writes  The Railway API through lib/api/client.ts (bearer token + X-Pakka-Tenant; the tenant is
//           never in a body): POST /api/kb/faqs, PATCH|DELETE /api/kb/faqs/:id, POST /api/kb/documents
//           (multipart), DELETE /api/kb/documents/:id, GET /api/kb/gaps, POST /api/kb/gaps/:id/answer,
//           POST /api/kb/gaps/:id/dismiss. Every response is parsed with Zod before the UI uses it.
//   Roles   Owner and admin write FAQs and documents and dismiss questions; every member (staff too)
//           can answer a question (section 9, Raja confirmed 7 Oct). Dismissing isn't named, so it
//           stays with owner and admin.

export type DocumentStatus = "processing" | "ready" | "failed";
const DocumentStatus = z.enum(["processing", "ready", "failed"]);
const Timestamp = z.string().refine((v) => !Number.isNaN(Date.parse(v)), "must be a timestamp");

export class KbDataError extends Error {
  constructor(what: string) {
    super(`The ${what} data had an unexpected shape.`);
    this.name = "KbDataError";
  }
}

/** Members who may change FAQs and documents, and dismiss questions (section 9: owner and admin). */
export function canWriteKnowledge(role: string): boolean {
  return role === "owner" || role === "admin";
}

/** Members who may answer a question the AI couldn't (section 9: owner, admin and staff). */
export function canAnswerGaps(role: string): boolean {
  return role === "owner" || role === "admin" || role === "staff";
}

const kbPath = (...segments: string[]): ApiPath => `/api/kb/${segments.map(encodeURIComponent).join("/")}`;

// Documents ----------------------------------------------------------------------------------------

export const DOCUMENT_LIMIT = 100;

export const KbDocumentRow = z.object({
  id: z.guid(),
  tenant_id: z.guid(),
  /** Free text in the schema; the handover's comment lists website, upload, manual. */
  source_type: z.string(),
  source_url: z.string().nullable(),
  title: z.string().nullable(),
  status: DocumentStatus,
  created_at: Timestamp,
});
export type KbDocumentRow = z.input<typeof KbDocumentRow>;

export interface KbDocument {
  id: string;
  name: string;
  /** Short label for the file tile, e.g. "PDF" or "WEB". */
  label: string;
  sourceType: string;
  status: DocumentStatus;
  createdAt: string;
}

const SOURCE_LABEL: Record<string, string> = { website: "WEB", upload: "DOC", manual: "TXT" };
const SOURCE_TEXT: Record<string, string> = { website: "From your website", upload: "Uploaded", manual: "Added by hand" };

function fileName(url: string): string {
  try {
    const u = new URL(url);
    const last = u.pathname.split("/").filter(Boolean).pop();
    return last ? decodeURIComponent(last) : u.hostname;
  } catch {
    return url;
  }
}

export function toKbDocument(row: z.output<typeof KbDocumentRow>): KbDocument {
  const name = row.title?.trim() || (row.source_url ? fileName(row.source_url) : "") || "Untitled document";
  const ext = /\.([a-z0-9]{2,4})$/i.exec(name)?.[1];
  return {
    id: row.id,
    name,
    label: (ext ?? SOURCE_LABEL[row.source_type] ?? "DOC").toUpperCase(),
    sourceType: row.source_type,
    status: row.status,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

/** "Uploaded · 7 Oct 2026" in the business's time zone. Unknown source types are shown as stored. */
export function documentMeta(doc: KbDocument, timeZone: string): string {
  const date = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone }).format(new Date(doc.createdAt));
  return `${SOURCE_TEXT[doc.sourceType] ?? doc.sourceType} · ${date}`;
}

/** The status chip: what the AI can do with the document. */
export const DOCUMENT_STATUS_TEXT: Record<DocumentStatus, string> = { processing: "Processing", ready: "Ready", failed: "Failed" };

export function hasProcessing(documents: readonly { status: DocumentStatus }[]): boolean {
  return documents.some((d) => d.status === "processing");
}

/**
 * The business's knowledge documents, newest first (RLS read). FAQs are kb_documents rows too
 * (source_type manual); they are listed under FAQs, not here.
 */
export async function listKbDocuments(client: SupabaseClient, tenantId: string): Promise<KbDocument[]> {
  const { data, error } = await client
    .from("kb_documents")
    .select("id, tenant_id, source_type, source_url, title, status, created_at")
    .eq("tenant_id", tenantId)
    .neq("source_type", "manual")
    .order("created_at", { ascending: false })
    .limit(DOCUMENT_LIMIT);
  if (error) throw error;
  const parsed = z.array(KbDocumentRow).safeParse(data ?? []);
  if (!parsed.success) throw new KbDataError("document");
  return parsed.data.filter((r) => r.tenant_id === tenantId).map(toKbDocument);
}

/** Puts a new or changed document in place, newest first. */
export function upsertDocument(list: KbDocument[], doc: KbDocument): KbDocument[] {
  return [...list.filter((d) => d.id !== doc.id), doc].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
}

// Upload: pdf, docx, txt or md, at most 5 MB (contracts.md section 9). The extension decides, since
// browsers report .md (and sometimes .docx) with different or empty MIME types.

export const UPLOAD_MAX_BYTES = 5 * 1024 * 1024;
export const UPLOAD_EXTENSIONS = ["pdf", "docx", "txt", "md"] as const;
/** For the file picker: extensions plus their usual MIME types. */
export const UPLOAD_ACCEPT = [
  ...UPLOAD_EXTENSIONS.map((e) => `.${e}`),
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
].join(",");

function megabytes(bytes: number): string {
  // Rounded up, so a file just over the limit never reads as "5 MB".
  return `${Math.ceil((bytes / (1024 * 1024)) * 10) / 10} MB`;
}

/** Why a file can't be uploaded, or null if it can. Checked before anything is sent. */
export function validateUploadFile(file: { name: string; size: number } | null | undefined): string | null {
  if (!file) return "Choose a file to upload";
  const ext = /\.([^.]+)$/.exec(file.name)?.[1]?.toLowerCase();
  if (!ext || !(UPLOAD_EXTENSIONS as readonly string[]).includes(ext)) return "Choose a PDF, Word (.docx), text (.txt) or Markdown (.md) file";
  if (file.size === 0) return "This file is empty";
  if (file.size > UPLOAD_MAX_BYTES) return `This file is ${megabytes(file.size)}. The limit is 5 MB`;
  return null;
}

const UploadResponse = z.object({
  id: z.guid(),
  title: z.string(),
  sourceType: z.string(),
  status: DocumentStatus,
  createdAt: Timestamp,
});

/** POST /api/kb/documents (multipart). The API answers 202 with the row in "processing". */
export async function uploadDocument(tenantId: string, file: File, title?: string): Promise<KbDocument> {
  const form = new FormData();
  form.append("file", file);
  const trimmed = title?.trim();
  if (trimmed) form.append("title", trimmed);
  const parsed = UploadResponse.safeParse(await postForm(kbPath("documents"), form, { tenantId }));
  if (!parsed.success) throw new KbDataError("upload");
  const r = parsed.data;
  return toKbDocument({ id: r.id, tenant_id: tenantId, source_type: r.sourceType, source_url: null, title: r.title || file.name, status: r.status, created_at: r.createdAt });
}

export async function deleteDocument(tenantId: string, id: string): Promise<void> {
  await sendNoContent(kbPath("documents", id), "DELETE", { tenantId });
}

// FAQs ---------------------------------------------------------------------------------------------

export const FAQ_Q_MAX = 300;
export const FAQ_A_MAX = 2000;

export interface FaqItem {
  id: string;
  q: string;
  a: string;
  /** From the RLS read; a saved FAQ is ready. "failed": stored, but the AI can't use it yet. */
  status: DocumentStatus;
}

const FaqRow = z.object({
  id: z.guid(),
  tenant_id: z.guid(),
  title: z.string().nullable(),
  body: z.string().nullable(),
  status: DocumentStatus,
});

/** The business's FAQs, oldest first, so a new one appears at the end (RLS read of kb_documents). */
export async function listFaqs(client: SupabaseClient, tenantId: string): Promise<FaqItem[]> {
  const { data, error } = await client
    .from("kb_documents")
    .select("id, tenant_id, title, body, status")
    .eq("tenant_id", tenantId)
    .eq("source_type", "manual")
    .order("created_at", { ascending: true })
    .limit(DOCUMENT_LIMIT);
  if (error) throw error;
  const parsed = z.array(FaqRow).safeParse(data ?? []);
  if (!parsed.success) throw new KbDataError("FAQ");
  return parsed.data.filter((r) => r.tenant_id === tenantId).map((r) => ({ id: r.id, q: r.title ?? "", a: r.body ?? "", status: r.status }));
}

export const FaqInput = z.object({
  q: z
    .string()
    .trim()
    .min(1, "Write the question the way customers ask it")
    .max(FAQ_Q_MAX, `Keep the question under ${FAQ_Q_MAX} characters`),
  a: z
    .string()
    .trim()
    .min(1, "Write the answer")
    .max(FAQ_A_MAX, `Keep the answer under ${FAQ_A_MAX} characters`),
});
export type FaqInput = z.output<typeof FaqInput>;
export type FaqFieldErrors = Partial<Record<keyof FaqInput, string>>;

export const DUPLICATE_FAQ = "You already have an FAQ with this question";
export const GAP_CONFLICT = "This question was already answered, or one of your FAQs already asks it. Refresh to see the current list.";

const sameQuestion = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Validates an FAQ before anything is sent. A question another FAQ already has is refused (the API
 * would answer conflict: one FAQ per question, ignoring case and surrounding spaces).
 */
export function validateFaq(
  draft: { q: string; a: string },
  existing: readonly FaqItem[],
  editingId: string | null,
): { ok: true; input: FaqInput } | { ok: false; fields: FaqFieldErrors } {
  const parsed = FaqInput.safeParse(draft);
  const fields: FaqFieldErrors = {};
  if (!parsed.success) {
    for (const issue of parsed.error.issues) fields[issue.path[0] as keyof FaqInput] ??= issue.message;
  }
  if (!fields.q && existing.some((f) => f.id !== editingId && sameQuestion(f.q, draft.q))) fields.q = DUPLICATE_FAQ;
  if (!parsed.success || Object.keys(fields).length > 0) return { ok: false, fields };
  return { ok: true, input: parsed.data };
}

/** Only what changed, for PATCH /api/kb/faqs/:id (`{ q?, a? }`); empty if nothing did. */
export function faqChanges(before: { q: string; a: string }, input: FaqInput): Partial<FaqInput> {
  return { ...(input.q !== before.q ? { q: input.q } : {}), ...(input.a !== before.a ? { a: input.a } : {}) };
}

const FaqResponse = z.object({ id: z.guid(), q: z.string(), a: z.string() });

function toFaq(json: unknown): FaqItem {
  const parsed = FaqResponse.safeParse(json);
  if (!parsed.success) throw new KbDataError("FAQ");
  return { ...parsed.data, status: "ready" };
}

export async function createFaq(tenantId: string, input: FaqInput): Promise<FaqItem> {
  return toFaq(await postJson(kbPath("faqs"), input, { tenantId }));
}

export async function updateFaq(tenantId: string, id: string, changes: Partial<FaqInput>): Promise<FaqItem> {
  return toFaq(await patchJson(kbPath("faqs", id), changes, { tenantId }));
}

export async function deleteFaq(tenantId: string, id: string): Promise<void> {
  await sendNoContent(kbPath("faqs", id), "DELETE", { tenantId });
}

/** Replaces an FAQ in place, or adds it at the end. */
export function upsertFaq(list: FaqItem[], faq: FaqItem): FaqItem[] {
  return list.some((f) => f.id === faq.id) ? list.map((f) => (f.id === faq.id ? faq : f)) : [...list, faq];
}

// Gaps ---------------------------------------------------------------------------------------------

export interface GapItem {
  id: string;
  question: string;
  askedCount: number;
  /** A contact name or a masked number. null if the contact was deleted (the link is cleared). */
  lastAskedBy: string | null;
}

const GapResponse = z.object({
  id: z.guid(),
  question: z.string(),
  askedCount: z.number().int().min(1),
  lastAskedBy: z.string().nullable(),
});

/** GET /api/kb/gaps: open questions, most asked first (the API's order is kept). */
export async function listGaps(tenantId: string, signal?: AbortSignal): Promise<GapItem[]> {
  const res = await apiFetch(kbPath("gaps"), { method: "GET", tenantId, signal });
  if (!res.ok) throw await apiErrorFrom(res);
  const parsed = z.array(GapResponse).safeParse(await res.json());
  if (!parsed.success) throw new KbDataError("questions");
  return parsed.data;
}

const AnswerResponse = z.object({ faq: FaqResponse });

/** POST /api/kb/gaps/:id/answer `{ a }`: the API creates the FAQ and closes the gap together. */
export async function answerGap(tenantId: string, id: string, answer: string): Promise<FaqItem> {
  const parsed = AnswerResponse.safeParse(await postJson(kbPath("gaps", id, "answer"), { a: answer }, { tenantId }));
  if (!parsed.success) throw new KbDataError("FAQ");
  return { ...parsed.data.faq, status: "ready" };
}

export async function dismissGap(tenantId: string, id: string): Promise<void> {
  await sendNoContent(kbPath("gaps", id, "dismiss"), "POST", { tenantId });
}

export const GAP_ANSWER_MAX = FAQ_A_MAX;

/** Why an answer can't be sent, or null. Same limits as an FAQ answer. */
export function validateGapAnswer(answer: string): string | null {
  const result = FaqInput.shape.a.safeParse(answer);
  return result.success ? null : (result.error.issues[0]?.message ?? "Write the answer");
}

/** "once", "twice", "3 times" (the prototype's wording). */
export function askedText(count: number): string {
  if (count <= 1) return "once";
  if (count === 2) return "twice";
  return `${count} times`;
}

// Sections and errors ------------------------------------------------------------------------------

/** Where a section's data comes from. */
export type SectionSource<T> =
  | { status: "loading" }
  | { status: "error"; message: string; retry: () => void }
  | { status: "ready"; items: T[] };

/**
 * What a failed write shows, titled for the action. The API writes its messages for users, so they
 * are kept; a few cases get wording specific to the knowledge base. `fields` (validation_failed) is
 * passed through so forms can mark the field.
 */
export function describeKbWriteError(err: unknown, title: string, what: "FAQ" | "document" | "question"): FormattedError {
  const e = formatError(err);
  if (e.code === "not_found") return { ...e, title, message: `This ${what} no longer exists. Refresh to see the current list.` };
  if (e.code === "forbidden") return { ...e, title, message: "Only an owner or admin can change the knowledge base." };
  if (e.code === "conflict" && what === "FAQ") return { ...e, title, message: DUPLICATE_FAQ, fields: { q: DUPLICATE_FAQ, ...e.fields } };
  // answer_kb_gap: the question was answered meanwhile, or an FAQ already asks it (the gap stays open).
  if (e.code === "conflict" && what === "question") return { ...e, title, message: GAP_CONFLICT };
  if (err instanceof KbDataError) return { ...e, title, message: "The reply from Spark Agent was unexpected. Refresh to see what was saved." };
  return { ...e, title };
}
