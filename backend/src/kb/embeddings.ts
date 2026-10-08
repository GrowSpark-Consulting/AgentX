import { z } from "zod";
import { serverEnv } from "../lib/env";
import { AppError } from "../lib/errors";
import { TimeoutError, withTimeout } from "../lib/timeout";

// Embeddings for the knowledge base: Voyage `voyage-4` at 1024 dimensions (docs/embeddings-evaluation.md),
// through the endpoint EMBEDDINGS_BASE_URL names. Documents and queries use different input types.
//
// - Each try has a timeout (10 s, like the WhatsApp adapter). 429, 5xx, network failures and timeouts
//   are retried up to 3 tries in all, with backoff (or the provider's Retry-After when that is longer, up to 2 s); 400/401/403 and every other 4xx fail at once.
//   Embeddings are read-only, so a retry cannot do anything twice.
// - The failure keeps the HTTP status (EmbeddingsError.upstreamStatus) for callers and tests. Its
//   message is fixed, and the log line carries the status only: never the key, the body or the text.

export const EMBEDDING_DIMENSIONS = 1024;
export const EMBED_BATCH_SIZE = 64;
export const EMBEDDINGS_TIMEOUT_MS = 10_000;
export const EMBEDDINGS_RETRY_DELAYS_MS = [250, 750];
const RETRY_AFTER_CAP_MS = 2000;
const TAG = "[embeddings]";

export interface EmbeddingsClient {
  embedDocuments(texts: string[]): Promise<number[][]>;
  embedQuery(text: string): Promise<number[]>;
}

export interface EmbeddingsConfig {
  apiKey: string;
  /** Must be https: the key travels to it. */
  baseUrl: string;
  model: string;
  fetch?: typeof fetch;
  /** Per try; default 10 seconds. */
  timeoutMs?: number;
  /** The wait before each retry; its length is the number of retries. Default 250 ms, 750 ms. */
  retryDelaysMs?: number[];
}

const response = z.object({
  data: z.array(z.object({ index: z.number().int().nonnegative(), embedding: z.array(z.number()).length(EMBEDDING_DIMENSIONS) })),
});

/** The embeddings service could not be used. `upstreamStatus` is the HTTP status when there was one. */
export class EmbeddingsError extends AppError {
  constructor(readonly upstreamStatus?: number) {
    super("upstream_failed", "We couldn't reach the embeddings service. Try again in a moment.");
    this.name = "EmbeddingsError";
  }
}

type Outcome = { ok: true; vectors: number[][] } | { ok: false; retryable: boolean; status?: number; retryAfterMs?: number; reason?: "timeout" | "network" };

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Retry-After in whole seconds, as milliseconds; anything else (a date, junk) is ignored. */
function retryAfterMs(header: string | null): number | undefined {
  return header !== null && /^\d{1,6}$/.test(header.trim()) ? Number(header) * 1000 : undefined;
}

export function createEmbeddingsClient(config: EmbeddingsConfig): EmbeddingsClient {
  if (!config.apiKey) throw new Error("EMBEDDINGS_API_KEY is required");
  if (!URL.canParse(config.baseUrl) || new URL(config.baseUrl).protocol !== "https:") {
    throw new Error("EMBEDDINGS_BASE_URL must be an https URL");
  }
  const call = config.fetch ?? fetch;
  const url = `${config.baseUrl.replace(/\/+$/, "")}/embeddings`;
  const timeoutMs = config.timeoutMs ?? EMBEDDINGS_TIMEOUT_MS;
  const retryDelays = config.retryDelaysMs ?? EMBEDDINGS_RETRY_DELAYS_MS;

  async function attempt(input: string[], inputType: "document" | "query"): Promise<Outcome> {
    let reply: { ok: boolean; status: number; retryAfter: string | null; body: unknown };
    try {
      reply = await withTimeout(async (signal) => {
        const res = await call(url, {
          method: "POST",
          headers: { authorization: `Bearer ${config.apiKey}`, "content-type": "application/json" },
          body: JSON.stringify({ input, model: config.model, input_type: inputType, output_dimension: EMBEDDING_DIMENSIONS }),
          signal,
          redirect: "error", // the key must not follow a redirect
        });
        // The provider's body is never read on an error and never copied into one: it can echo request details.
        // Not JSON is a bad answer (never retried); a connection dropped mid-body is a network failure (retried).
        const body = res.ok
          ? await res.json().catch((e: unknown) => {
              if (e instanceof SyntaxError) return null;
              throw e;
            })
          : await res.body?.cancel().catch(() => undefined);
        return { ok: res.ok, status: res.status, retryAfter: res.headers.get("retry-after"), body };
      }, timeoutMs);
    } catch (err) {
      return { ok: false, retryable: true, reason: err instanceof TimeoutError ? "timeout" : "network" };
    }
    if (!reply.ok) {
      const retryable = reply.status === 429 || reply.status >= 500;
      return { ok: false, retryable, status: reply.status, retryAfterMs: retryable ? retryAfterMs(reply.retryAfter) : undefined };
    }
    const parsed = response.safeParse(reply.body);
    if (!parsed.success || parsed.data.data.length !== input.length) return { ok: false, retryable: false, status: reply.status };
    const rows = parsed.data.data.sort((a, b) => a.index - b.index);
    // Indexes must be exactly 0..n-1, or a vector could be saved against the wrong text.
    if (rows.some((row, i) => row.index !== i)) return { ok: false, retryable: false, status: reply.status };
    return { ok: true, vectors: rows.map((row) => row.embedding) };
  }

  async function embedBatch(input: string[], inputType: "document" | "query"): Promise<number[][]> {
    const tries = retryDelays.length + 1;
    for (let n = 1; ; n++) {
      const outcome = await attempt(input, inputType);
      if (outcome.ok) return outcome.vectors;
      console.warn(`${TAG} try ${n} of ${tries} failed: ${outcome.status !== undefined ? `status ${outcome.status}` : (outcome.reason ?? "bad answer")}`);
      if (!outcome.retryable || n >= tries) throw new EmbeddingsError(outcome.status);
      // A wait the provider asks for that is longer than we will hold a request open: stop, don't retry early.
      if ((outcome.retryAfterMs ?? 0) > RETRY_AFTER_CAP_MS) throw new EmbeddingsError(outcome.status);
      await sleep(Math.max(retryDelays[n - 1], outcome.retryAfterMs ?? 0));
    }
  }

  async function embed(texts: string[], inputType: "document" | "query"): Promise<number[][]> {
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
