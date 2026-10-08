import { z } from "zod";
import { supabaseAdmin } from "../lib/supabase-admin";
import { TimeoutError, withTimeout } from "../lib/timeout";
import { embeddingsClient } from "./embeddings";

/** How long the similarity search may take. It is an index lookup: seconds mean something is wrong. */
export const KB_RPC_TIMEOUT_MS = 5000;

/**
 * Lowest similarity (1 - cosine distance) at which a chunk counts as an answer. PROVISIONAL: a
 * starting value, to be tuned with the 15-query eval set (scripts/embeddings-eval) before launch.
 */
export const KB_MIN_SIMILARITY = 0.45;

const DEFAULT_K = 5;
const MAX_K = 50; // match_kb_chunks caps k at 50 too
const TENANT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const matchRow = z.object({
  chunk_id: z.string(),
  document_id: z.string(),
  title: z.string().nullable(),
  content: z.string(),
  similarity: z.number(),
});

export interface KbMatch {
  chunkId: string;
  documentId: string;
  title: string | null;
  content: string;
  similarity: number;
}

/**
 * The chunks of one business's ready documents that best answer a question, most similar first, with
 * those below KB_MIN_SIMILARITY dropped. An empty list means the knowledge base has no answer.
 * `tenantId` must come from a verified context (the route's requireTenant, the webhook's connection
 * row), never from anything the customer or browser sent. Tenant and ready-only filtering happen in
 * match_kb_chunks (supabase/tests/knowledge_base.test.sql).
 */
export async function retrieveKb(tenantId: string, query: string, k = DEFAULT_K): Promise<KbMatch[]> {
  if (!TENANT_ID.test(tenantId)) throw new Error("retrieveKb needs a tenant id");
  const text = query.trim();
  if (!text) return [];

  const vector = await embeddingsClient().embedQuery(text);
  // The messages name the function only: the query text is the customer's. No retry: this is the live
  // reply path, and the caller decides what a failed search means.
  let result;
  try {
    result = await withTimeout(
      (signal) =>
        supabaseAdmin()
          .rpc("match_kb_chunks", { p_tenant_id: tenantId, p_query: JSON.stringify(vector), p_k: Math.min(Math.max(Math.trunc(k), 1), MAX_K) })
          .abortSignal(signal),
      KB_RPC_TIMEOUT_MS,
    );
  } catch (err) {
    // The class only: its text could carry the query or a connection string.
    console.error(`[kb] match_kb_chunks threw ${err instanceof Error ? err.name : "unknown"}`);
    throw new Error(err instanceof TimeoutError ? "match_kb_chunks timed out" : "match_kb_chunks failed");
  }
  const { data, error } = result;
  if (error) {
    console.error(`[kb] match_kb_chunks failed: code ${typeof error.code === "string" ? error.code.slice(0, 16) : "none"}`);
    throw new Error("match_kb_chunks failed");
  }

  return z
    .array(matchRow)
    .parse(data ?? [])
    .filter((row) => row.similarity >= KB_MIN_SIMILARITY)
    .map((row) => ({ chunkId: row.chunk_id, documentId: row.document_id, title: row.title, content: row.content, similarity: row.similarity }));
}
