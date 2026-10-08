import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { AppError } from "../lib/errors";
import { supabaseAdmin } from "../lib/supabase-admin";
import { TimeoutError, withTimeout } from "../lib/timeout";

// The knowledge base's writes and reads of kb_documents and kb_chunks, with the service role. It bypasses
// row-level security, so every query here names its business (`tenant_id`), and the business always comes
// from a verified context (the route's token, the job's event), never from what a customer or the browser
// sent. The one exception is failStaleProcessing, a maintenance sweep across all businesses.
//
// Failures are fixed words: the log line has the Postgres code (or "timed out") and nothing else, and the
// database's own message, which can hold values and hosts, is never copied into an error or a log. Every
// call has a deadline, and the request is aborted when it passes, so a call that gave up cannot land later
// (a late chunk insert would otherwise double a retried step's chunks).

export type KbDocumentStatus = "processing" | "ready" | "failed";

export interface KbDocument {
  id: string;
  title: string | null;
  body: string | null;
  status: KbDocumentStatus;
  sourceType: string;
}

export interface KbStore {
  /** A new upload for the business, `processing`, with its text. */
  insertUpload(tenantId: string, input: { title: string; body: string }): Promise<{ id: string; createdAt: string }>;
  /** How many uploaded or imported documents the business has (FAQs are not counted). */
  countDocuments(tenantId: string): Promise<number>;
  getDocument(tenantId: string, id: string): Promise<KbDocument | null>;
  /** `onlyIf`: change the status only while it is still that one. An error is cut to 200 characters. */
  setStatus(tenantId: string, id: string, status: KbDocumentStatus, error?: string, options?: { onlyIf?: KbDocumentStatus }): Promise<void>;
  /**
   * Replaces all of a document's chunks with these: check, delete, then insert in batches. It is not one
   * transaction, so a failure part-way leaves a partial set; that is harmless because the caller leaves the
   * document `processing` or `failed` until it succeeds, and match_kb_chunks reads only `ready` documents.
   * `document_gone`: the document is not the business's (or was deleted meanwhile), so nothing was written.
   */
  replaceChunks(tenantId: string, id: string, rows: { content: string; embedding: number[] }[]): Promise<"stored" | "document_gone">;
  /** Deletes an uploaded or imported document (never an FAQ); its chunks go with it. False when there was none. */
  deleteDocument(tenantId: string, id: string): Promise<boolean>;
  /**
   * Marks documents that have been `processing` for longer than `olderThanMs` as failed, across all
   * businesses: the ones whose job never started or never finished. Returns how many.
   */
  failStaleProcessing(olderThanMs: number, error: string): Promise<number>;
}

/** Rows per insert: 100 chunks of 1000 characters and 1024 numbers is about 1 to 2 MB of JSON, within a request. */
export const CHUNK_INSERT_BATCH = 100;
/** One query. Inserts of a batch of vectors get twice as much. A call that has not answered by then is not going to. */
export const KB_DB_TIMEOUT_MS = 10_000;
const ERROR_MAX = 200;

const DocumentRow = z.object({
  id: z.string(),
  title: z.string().nullable(),
  body: z.string().nullable(),
  status: z.enum(["processing", "ready", "failed"]),
  source_type: z.string(),
});
const InsertedRow = z.object({ id: z.string(), created_at: z.string() });

type Result = { data: unknown; error: { code?: string; message?: string } | null; count?: number | null };

export function createKbStore(db: SupabaseClient = supabaseAdmin(), { timeoutMs = KB_DB_TIMEOUT_MS }: { timeoutMs?: number } = {}): KbStore {
  /** Runs one query with a deadline, aborting it when the deadline passes. Any failure is the same fixed error. */
  async function run(op: string, query: (signal: AbortSignal) => PromiseLike<Result>, ms = timeoutMs): Promise<Result> {
    try {
      return await withTimeout(query, ms);
    } catch (error) {
      console.error(`[kb] ${op} ${error instanceof TimeoutError ? "timed out" : "threw"}`);
      throw new AppError("upstream_failed", "We couldn't reach the knowledge base just now. Try again in a moment.");
    }
  }
  const fail = (op: string, error: { code?: string }): never => {
    console.error(`[kb] ${op} failed: code ${typeof error.code === "string" ? error.code.slice(0, 16) : "none"}`);
    throw new AppError("upstream_failed", "We couldn't reach the knowledge base just now. Try again in a moment.");
  };

  return {
    async insertUpload(tenantId, { title, body }) {
      const { data, error } = await run("insert document", (signal) =>
        db.from("kb_documents").insert({ tenant_id: tenantId, source_type: "upload", title, body, status: "processing" }).select("id, created_at").abortSignal(signal).single(),
      );
      if (error) fail("insert document", error);
      const row = InsertedRow.parse(data);
      return { id: row.id, createdAt: new Date(row.created_at).toISOString() };
    },

    async countDocuments(tenantId) {
      const { count, error } = await run("count documents", (signal) =>
        db.from("kb_documents").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).neq("source_type", "manual").abortSignal(signal),
      );
      if (error) fail("count documents", error);
      return count ?? 0;
    },

    async getDocument(tenantId, id) {
      const { data, error } = await run("read document", (signal) =>
        db.from("kb_documents").select("id, title, body, status, source_type").eq("id", id).eq("tenant_id", tenantId).abortSignal(signal).maybeSingle(),
      );
      if (error) fail("read document", error);
      if (data === null) return null;
      const row = DocumentRow.parse(data);
      return { id: row.id, title: row.title, body: row.body, status: row.status, sourceType: row.source_type };
    },

    async setStatus(tenantId, id, status, error, options) {
      const result = await run("set document status", (signal) => {
        let query = db
          .from("kb_documents")
          .update({ status, error: error === undefined ? null : error.slice(0, ERROR_MAX) })
          .eq("id", id)
          .eq("tenant_id", tenantId);
        if (options?.onlyIf) query = query.eq("status", options.onlyIf);
        return query.abortSignal(signal);
      });
      if (result.error) fail("set document status", result.error);
    },

    async replaceChunks(tenantId, id, rows) {
      // The document must be the business's: the chunks table only has a foreign key on the document's id,
      // so without this check a wrong pair of ids could put one business's chunks under another's document.
      const found = await run("check document", (signal) =>
        db.from("kb_documents").select("id").eq("id", id).eq("tenant_id", tenantId).abortSignal(signal).maybeSingle(),
      );
      if (found.error) fail("check document", found.error);
      if (found.data === null) return "document_gone";

      const removed = await run("delete chunks", (signal) => db.from("kb_chunks").delete().eq("document_id", id).eq("tenant_id", tenantId).abortSignal(signal));
      if (removed.error) fail("delete chunks", removed.error);

      for (let i = 0; i < rows.length; i += CHUNK_INSERT_BATCH) {
        const batch = rows.slice(i, i + CHUNK_INSERT_BATCH).map((row) => ({
          tenant_id: tenantId,
          document_id: id,
          content: row.content,
          embedding: JSON.stringify(row.embedding), // pgvector reads its text form
        }));
        const inserted = await run("insert chunks", (signal) => db.from("kb_chunks").insert(batch).abortSignal(signal), timeoutMs * 2);
        if (inserted.error) {
          // The document was deleted after the check: its chunks are gone with it, and so is the reason to store more.
          if (inserted.error.code === "23503") return "document_gone";
          fail("insert chunks", inserted.error);
        }
      }
      return "stored";
    },

    async deleteDocument(tenantId, id) {
      const { data, error } = await run("delete document", (signal) =>
        db.from("kb_documents").delete().eq("id", id).eq("tenant_id", tenantId).neq("source_type", "manual").select("id").abortSignal(signal),
      );
      if (error) fail("delete document", error);
      return Array.isArray(data) && data.length > 0;
    },

    async failStaleProcessing(olderThanMs, error) {
      const cutoff = new Date(Date.now() - olderThanMs).toISOString();
      const { data, error: failure } = await run("fail stale documents", (signal) =>
        db.from("kb_documents").update({ status: "failed", error: error.slice(0, ERROR_MAX) }).eq("status", "processing").lt("created_at", cutoff).select("id").abortSignal(signal),
      );
      if (failure) fail("fail stale documents", failure);
      return Array.isArray(data) ? data.length : 0;
    },
  };
}
