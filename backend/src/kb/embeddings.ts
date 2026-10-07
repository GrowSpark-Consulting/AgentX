import { z } from "zod";
import { serverEnv } from "../lib/env";
import { AppError } from "../lib/errors";

// Embeddings for the knowledge base: Voyage `voyage-4` at 1024 dimensions (docs/embeddings-evaluation.md),
// through the endpoint EMBEDDINGS_BASE_URL names. Documents and queries use different input types.

export const EMBEDDING_DIMENSIONS = 1024;
export const EMBED_BATCH_SIZE = 64;

export interface EmbeddingsClient {
  embedDocuments(texts: string[]): Promise<number[][]>;
  embedQuery(text: string): Promise<number[]>;
}

export interface EmbeddingsConfig {
  apiKey: string | undefined;
  baseUrl: string;
  model: string;
  fetch?: typeof fetch;
}

const response = z.object({
  data: z.array(z.object({ index: z.number().int().nonnegative(), embedding: z.array(z.number()).length(EMBEDDING_DIMENSIONS) })),
});

const upstreamFailed = () => new AppError("upstream_failed", "We couldn't reach the embeddings service. Try again in a moment.");

export function createEmbeddingsClient(config: EmbeddingsConfig): EmbeddingsClient {
  const call = config.fetch ?? fetch;
  const url = `${config.baseUrl.replace(/\/+$/, "")}/embeddings`;

  async function embedBatch(input: string[], inputType: "document" | "query"): Promise<number[][]> {
    let res: Response;
    try {
      res = await call(url, {
        method: "POST",
        headers: { authorization: `Bearer ${config.apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({ input, model: config.model, input_type: inputType, output_dimension: EMBEDDING_DIMENSIONS }),
      });
    } catch {
      throw upstreamFailed();
    }
    // The provider's body is never copied into an error: it can echo request details.
    if (!res.ok) throw upstreamFailed();
    const parsed = response.safeParse(await res.json().catch(() => null));
    if (!parsed.success || parsed.data.data.length !== input.length) throw upstreamFailed();
    return parsed.data.data.sort((a, b) => a.index - b.index).map((row) => row.embedding);
  }

  async function embed(texts: string[], inputType: "document" | "query"): Promise<number[][]> {
    if (texts.length === 0) return [];
    if (!config.apiKey) throw new AppError("not_available", "Embeddings aren't set up on this server: EMBEDDINGS_API_KEY is missing.");
    const vectors: number[][] = [];
    for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
      vectors.push(...(await embedBatch(texts.slice(i, i + EMBED_BATCH_SIZE), inputType)));
    }
    return vectors;
  }

  return {
    embedDocuments: (texts) => embed(texts, "document"),
    embedQuery: async (text) => (await embed([text], "query"))[0],
  };
}

/** The client for this server's environment. */
export function embeddingsClient(): EmbeddingsClient {
  const env = serverEnv();
  return createEmbeddingsClient({ apiKey: env.EMBEDDINGS_API_KEY, baseUrl: env.EMBEDDINGS_BASE_URL, model: env.EMBEDDINGS_MODEL });
}
