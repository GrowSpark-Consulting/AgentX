import type { TenantContext } from "@pakka/types";
import { z } from "zod";
import { inngest } from "../inngest/client";
import { AppError } from "../lib/errors";
import { requireRole } from "../lib/tenant";
import { stripUnsafeCharacters } from "../lib/text";
import { TimeoutError, withTimeout } from "../lib/timeout";
import { chunkText } from "./chunk";
import { KB_UPLOAD_EVENT, kbUploadEventId } from "./events";
import { extractText, MAX_FILE_BYTES } from "./extract";
import { createKbStore, type KbStore } from "./store";

// POST /api/kb/documents and DELETE /api/kb/documents/:id (docs/contracts.md, section 9). An upload is
// read here, while the file is in hand (it is not kept): the text is checked, stored in kb_documents.body
// as a `processing` document, and the ingest job (inngest/kb-ingest.ts) chunks and embeds it. The
// business comes from the caller's verified context; owner or admin only.

export { KB_UPLOAD_EVENT };

/** A 5 MB file plus its multipart wrapping: the router refuses a bigger body before this runs (413). */
export const KB_UPLOAD_MAX_BODY_BYTES = 6 * 1024 * 1024;
export const TITLE_MAX = 200;
/** Uploaded or imported documents a business may keep (FAQs are not counted). A price list is a handful; this stops a script. */
export const MAX_DOCUMENTS = 100;
const SEND_TIMEOUT_MS = 10_000;
const START_FAILED = "We couldn't start processing this file. Upload it again.";

export interface UploadedDocument {
  id: string;
  title: string;
  sourceType: "upload";
  status: "processing";
  createdAt: string;
}

export interface UploadDeps {
  store: KbStore;
  extract: (file: { name: string; bytes: Uint8Array }) => Promise<string>;
  send: (event: { id: string; name: string; data: { tenantId: string; documentId: string } }) => Promise<unknown>;
}

const defaults = (): UploadDeps => ({
  store: createKbStore(),
  extract: extractText,
  send: (event) => withTimeout(() => inngest.send(event), SEND_TIMEOUT_MS),
});

const fileError = (message: string) => new AppError("validation_failed", message, { file: message });

/** Single spaces, no control characters or lone surrogates (Postgres refuses NUL), no blanks around it. */
const tidy = (text: string) => stripUnsafeCharacters(text).replace(/\s+/g, " ").trim();
const truncate = (text: string, max: number) => [...text].slice(0, max).join("");

/** The file name as a title: no folders (a Windows or Unix path), no extension. */
function titleFromName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? name;
  const dot = base.lastIndexOf(".");
  return tidy(dot > 0 ? base.slice(0, dot) : base);
}

function chosenTitle(form: FormData, fileName: string): string {
  const given = form.get("title");
  if (typeof given === "string") {
    const title = tidy(given);
    if ([...title].length > TITLE_MAX) {
      throw new AppError("validation_failed", `Titles can be at most ${TITLE_MAX} characters.`, { title: `Use at most ${TITLE_MAX} characters.` });
    }
    if (title) return title;
  }
  return truncate(titleFromName(fileName), TITLE_MAX) || "Untitled document";
}

async function readForm(request: Request): Promise<FormData> {
  if (!/^multipart\/form-data/i.test(request.headers.get("content-type") ?? "")) throw fileError("Send the file as a form upload.");
  try {
    return await request.formData();
  } catch {
    throw fileError("We couldn't read the upload. Try again.");
  }
}

export async function uploadDocument(context: TenantContext, request: Request, given?: UploadDeps): Promise<UploadedDocument> {
  requireRole(context, ["owner", "admin"], "add documents");
  const deps = given ?? defaults(); // after the role check: a missing setting must not turn "forbidden" into a 500
  const tenantId = context.tenant.id;

  const form = await readForm(request);
  const entry = form.get("file");
  if (!(entry instanceof File)) throw fileError("Choose a file to upload.");
  if (entry.size === 0) throw fileError("This file is empty.");
  if (entry.size > MAX_FILE_BYTES) throw fileError("This file is larger than 5 MB. Split it into smaller files.");
  const title = chosenTitle(form, entry.name);

  if ((await deps.store.countDocuments(tenantId)) >= MAX_DOCUMENTS) {
    throw fileError(`You can keep up to ${MAX_DOCUMENTS} documents. Delete one you no longer need, then upload again.`);
  }

  const text = await deps.extract({ name: entry.name, bytes: new Uint8Array(await entry.arrayBuffer()) });
  chunkText(text); // too long for the knowledge base is refused now, with fields.file, not found out by the job

  const { id, createdAt } = await deps.store.insertUpload(tenantId, { title, body: text });
  try {
    await deps.send({ id: kbUploadEventId(id), name: KB_UPLOAD_EVENT, data: { tenantId, documentId: id } });
  } catch (error) {
    // The class only: the message can carry the Inngest address or key.
    const ambiguous = error instanceof TimeoutError;
    console.error(`[kb] could not start the ingest job: ${ambiguous ? "timed out" : error instanceof Error ? error.name : "unknown"}`);
    // No answer in time is not a refusal: Inngest may have the event and the job may be running, even done. The
    // upload then stands as `processing`, and the sweep (inngest/kb-sweep.ts) fails it if no job ever finishes it.
    if (ambiguous) return { id, title, sourceType: "upload", status: "processing", createdAt };
    // A refusal: the document would sit as `processing`; the list shows it as failed instead, and it can be deleted.
    // Only while it is still processing, so a job that did start can never be told it failed.
    await deps.store.setStatus(tenantId, id, "failed", START_FAILED, { onlyIf: "processing" }).catch(() => undefined);
    throw new AppError("upstream_failed", "We couldn't start processing this file. Try again in a moment.");
  }
  return { id, title, sourceType: "upload", status: "processing", createdAt };
}

/** Deletes an upload or imported document and its chunks. FAQs are deleted through their own route. */
export async function deleteDocument(context: TenantContext, id: string, given?: KbStore): Promise<void> {
  requireRole(context, ["owner", "admin"], "delete documents");
  const store = given ?? createKbStore();
  const notFound = () => new AppError("not_found", "That document was not found.");
  if (!z.guid().safeParse(id).success) throw notFound();
  if (!(await store.deleteDocument(context.tenant.id, id))) throw notFound();
}
