import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

// The Knowledge base sections other than services: documents, FAQs and "questions the AI couldn't
// answer" (gaps). Contract status on 7 Oct 2026 (docs/dashboard-screen-contracts.md, Knowledge base;
// docs/handover.md, API table):
//
//   Documents  kb_documents exists (0001) and members can read it under RLS: that read is built here.
//              POST /api/kb/documents (upload, chunk, embed) is HANDOVER · Dev 1 and not built; its
//              request and response shapes, accepted file types and processing states are not defined.
//              kb_documents has no status column, so no processing state is shown.
//   FAQs       PROPOSED POST|PATCH /api/kb/faqs (Dev 1). No table, no route, no read path.
//   Gaps       PROPOSED GET /api/kb/gaps (Dev 1); "needs a table for unanswered questions" (open
//              question 3). No table, no route.
//
// FAQ and gap view models below follow the PROPOSED KnowledgeBase shape, so the ported components are
// ready for data, but nothing reads or writes them: the page shows those sections as not available.

// Documents (real) ---------------------------------------------------------------------------------

export const DOCUMENT_LIMIT = 100;

export const KbDocumentRow = z.object({
  id: z.guid(),
  tenant_id: z.guid(),
  /** Free text in the schema; the handover's comment lists website, upload, manual. */
  source_type: z.string(),
  source_url: z.string().nullable(),
  title: z.string().nullable(),
  created_at: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "must be a timestamp"),
});
export type KbDocumentRow = z.input<typeof KbDocumentRow>;

export interface KbDocument {
  id: string;
  name: string;
  /** Short label for the file tile, e.g. "PDF" or "WEB". */
  label: string;
  sourceType: string;
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
    createdAt: new Date(row.created_at).toISOString(),
  };
}

/** "Uploaded · 7 Oct 2026" in the business's time zone. Unknown source types are shown as stored. */
export function documentMeta(doc: KbDocument, timeZone: string): string {
  const date = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone }).format(new Date(doc.createdAt));
  return `${SOURCE_TEXT[doc.sourceType] ?? doc.sourceType} · ${date}`;
}

export class KbDataError extends Error {
  constructor(what: string) {
    super(`The ${what} data had an unexpected shape.`);
    this.name = "KbDataError";
  }
}

/** The business's knowledge documents, newest first (RLS read; members cannot write kb_documents). */
export async function listKbDocuments(client: SupabaseClient, tenantId: string): Promise<KbDocument[]> {
  const { data, error } = await client
    .from("kb_documents")
    .select("id, tenant_id, source_type, source_url, title, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(DOCUMENT_LIMIT);
  if (error) throw error;
  const parsed = z.array(KbDocumentRow).safeParse(data ?? []);
  if (!parsed.success) throw new KbDataError("document");
  return parsed.data.filter((r) => r.tenant_id === tenantId).map(toKbDocument);
}

// FAQs and gaps (view models only: no storage contract yet) -----------------------------------------

/** docs/dashboard-screen-contracts.md KnowledgeBase.faqs (PROPOSED). */
export interface FaqItem {
  id: string;
  q: string;
  a: string;
}

/** docs/dashboard-screen-contracts.md KnowledgeBase.gaps (PROPOSED). */
export interface GapItem {
  id: string;
  question: string;
  askedCount: number;
  lastAskedBy: string;
}

/**
 * Where a section's data comes from. "unavailable" means the backend contract doesn't exist yet: the
 * section says so and offers no action that would look like it saved something.
 */
export type SectionSource<T> =
  | { status: "unavailable"; reason: string }
  | { status: "loading" }
  | { status: "error"; message: string; retry: () => void }
  | { status: "ready"; items: T[] };

/** "once", "twice", "3 times" (the prototype's wording). */
export function askedText(count: number): string {
  if (count <= 1) return "once";
  if (count === 2) return "twice";
  return `${count} times`;
}
