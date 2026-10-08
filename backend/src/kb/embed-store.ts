import { chunkText } from "./chunk";
import type { KbStore } from "./store";

// Where text becomes searchable, shared by the ingest job (an uploaded document, one Inngest step per piece) and
// the FAQ routes (a FAQ or a gap's answer, inline in the request): embed the text's chunks into vectors, replace the
// document's chunks with them, and mark the document `ready`. One implementation, so a document and a FAQ can never
// be stored differently (docs/contracts.md section 9).

/** Chunks per embed call. The provider takes more, but the ingest job memoises each call as a step, so it stays small. */
export const EMBED_BATCH_SIZE = 32;

export type Embed = (texts: string[]) => Promise<number[][]>;

/** Vectors for these texts, in order. An answer of the wrong length is refused: it would be stored against the wrong text. */
export async function embedBatch(embed: Embed, texts: string[]): Promise<number[][]> {
  const vectors = await embed(texts);
  if (vectors.length !== texts.length) throw new Error("embeddings answer has the wrong length");
  return vectors;
}

/** Replaces the document's chunks with these and marks it ready. `document_gone`: not the business's, or deleted meanwhile. */
export async function storeChunks(store: KbStore, tenantId: string, documentId: string, texts: string[], vectors: number[][]): Promise<"stored" | "document_gone"> {
  const result = await store.replaceChunks(tenantId, documentId, texts.map((content, i) => ({ content, embedding: vectors[i] })));
  if (result === "stored") await store.setStatus(tenantId, documentId, "ready");
  return result;
}

/**
 * Chunk, embed (in batches) and store a document's text in one go, for callers that are not a step function.
 * `stillCurrent` (optional) is asked after embedding and before anything is stored: false means the text was changed
 * while it was being embedded, so these vectors are for old text and are dropped (`superseded`): the newer save stores its own.
 */
export async function embedAndStore(
  deps: { store: KbStore; embed: Embed },
  tenantId: string,
  documentId: string,
  text: string,
  stillCurrent?: () => Promise<boolean>,
): Promise<"stored" | "document_gone" | "superseded"> {
  const texts = chunkText(text);
  const vectors: number[][] = [];
  for (let start = 0; start < texts.length; start += EMBED_BATCH_SIZE) {
    vectors.push(...(await embedBatch(deps.embed, texts.slice(start, start + EMBED_BATCH_SIZE))));
  }
  if (stillCurrent && !(await stillCurrent())) return "superseded";
  return storeChunks(deps.store, tenantId, documentId, texts, vectors);
}
