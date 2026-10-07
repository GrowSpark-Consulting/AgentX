import { describe, expect, it, vi } from "vitest";
import { AppError } from "../lib/errors";
import { createEmbeddingsClient, EMBEDDING_DIMENSIONS, EMBED_BATCH_SIZE } from "./embeddings";

const KEY = "test-embeddings-key";
const BASE = "https://embeddings.example.test/v1";

const vector = (seed: number) => Array.from({ length: EMBEDDING_DIMENSIONS }, (_, i) => (i === 0 ? seed : 0));

/** A fake provider: answers each request with one vector per input, the first number being its position in the request's input. */
function fakeProvider(options: { dimensions?: number; shuffle?: boolean; status?: number; body?: unknown } = {}) {
  return vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    if (options.status) return new Response(JSON.stringify(options.body ?? { detail: `secret ${KEY}` }), { status: options.status });
    if (options.body !== undefined) return Response.json(options.body);
    const { input } = JSON.parse(String(init?.body)) as { input: string[] };
    const data = input.map((text, index) => ({
      index,
      embedding: Array.from({ length: options.dimensions ?? EMBEDDING_DIMENSIONS }, (_, i) => (i === 0 ? Number(text.replace(/\D/g, "")) : 0)),
    }));
    return Response.json({ data: options.shuffle ? data.reverse() : data });
  });
}

const client = (fetch: ReturnType<typeof fakeProvider>, overrides = {}) =>
  createEmbeddingsClient({ apiKey: KEY, baseUrl: BASE, model: "voyage-4", fetch, ...overrides });

describe("createEmbeddingsClient", () => {
  it("posts documents to {baseUrl}/embeddings with the bearer key, model, input type and 1024 dimensions", async () => {
    const fetch = fakeProvider();
    await client(fetch).embedDocuments(["doc 1"]);
    const [url, init] = fetch.mock.calls[0];
    expect(String(url)).toBe(`${BASE}/embeddings`);
    expect((init?.headers as Record<string, string>).authorization).toBe(`Bearer ${KEY}`);
    expect(JSON.parse(String(init?.body))).toEqual({
      input: ["doc 1"],
      model: "voyage-4",
      input_type: "document",
      output_dimension: 1024,
    });
  });

  it("embeds a query with input_type query and returns one vector", async () => {
    const fetch = fakeProvider();
    const result = await client(fetch).embedQuery("query 7");
    expect(JSON.parse(String(fetch.mock.calls[0][1]?.body)).input_type).toBe("query");
    expect(result).toEqual(vector(7));
  });

  it("tolerates a trailing slash on the base URL", async () => {
    const fetch = fakeProvider();
    await client(fetch, { baseUrl: `${BASE}/` }).embedDocuments(["doc 1"]);
    expect(String(fetch.mock.calls[0][0])).toBe(`${BASE}/embeddings`);
  });

  it("sends nothing for an empty list", async () => {
    const fetch = fakeProvider();
    await expect(client(fetch).embedDocuments([])).resolves.toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("splits large inputs into batches and keeps the input order", async () => {
    const fetch = fakeProvider();
    const texts = Array.from({ length: EMBED_BATCH_SIZE * 2 + 3 }, (_, i) => `doc ${i}`);
    const result = await client(fetch).embedDocuments(texts);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(result.map((v) => v[0])).toEqual(texts.map((_, i) => i));
  });

  it("orders rows by the provider's index when it answers out of order", async () => {
    const result = await client(fakeProvider({ shuffle: true })).embedDocuments(["doc 1", "doc 2", "doc 3"]);
    expect(result.map((v) => v[0])).toEqual([1, 2, 3]);
  });

  it("rejects a vector that is not 1024 numbers long", async () => {
    await expect(client(fakeProvider({ dimensions: 512 })).embedDocuments(["doc 1"])).rejects.toMatchObject({ code: "upstream_failed" });
  });

  it("rejects an answer with the wrong shape or the wrong number of rows", async () => {
    await expect(client(fakeProvider({ body: { nope: true } })).embedDocuments(["doc 1"])).rejects.toMatchObject({ code: "upstream_failed" });
    await expect(client(fakeProvider({ body: { data: [] } })).embedDocuments(["doc 1"])).rejects.toMatchObject({ code: "upstream_failed" });
  });

  it("turns a provider error into upstream_failed without echoing the key or the provider's body", async () => {
    const error = await client(fakeProvider({ status: 429 })).embedDocuments(["doc 1"]).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe("upstream_failed");
    expect((error as AppError).message).not.toContain(KEY);
    expect((error as AppError).message).not.toContain("secret");
  });

  it("turns a network failure into upstream_failed", async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    await expect(createEmbeddingsClient({ apiKey: KEY, baseUrl: BASE, model: "voyage-4", fetch }).embedQuery("hi")).rejects.toMatchObject({
      code: "upstream_failed",
    });
  });

  it("says the key is missing, plainly, and never calls the provider", async () => {
    const fetch = fakeProvider();
    const error = await client(fetch, { apiKey: undefined }).embedDocuments(["doc 1"]).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe("not_available");
    expect((error as AppError).message).toContain("EMBEDDINGS_API_KEY");
    expect(fetch).not.toHaveBeenCalled();
  });
});
