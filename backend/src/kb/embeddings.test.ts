import { afterEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../lib/errors";
import {
  createEmbeddingsClient,
  EMBEDDING_DIMENSIONS,
  EMBEDDINGS_RETRY_DELAYS_MS,
  EMBEDDINGS_TIMEOUT_MS,
  EMBED_BATCH_SIZE,
  EmbeddingsError,
} from "./embeddings";

const KEY = "test-embeddings-key";
const BASE = "https://embeddings.example.test/v1";

const vector = (seed: number) => Array.from({ length: EMBEDDING_DIMENSIONS }, (_, i) => (i === 0 ? seed : 0));

type Call = (url: string | URL | Request, init?: RequestInit) => Promise<Response>;

const answer = (init: RequestInit | undefined, options: { dimensions?: number; shuffle?: boolean } = {}) => {
  const { input } = JSON.parse(String(init?.body)) as { input: string[] };
  const data = input.map((text, index) => ({
    index,
    embedding: Array.from({ length: options.dimensions ?? EMBEDDING_DIMENSIONS }, (_, i) => (i === 0 ? Number(text.replace(/\D/g, "")) : 0)),
  }));
  return Response.json({ data: options.shuffle ? data.reverse() : data });
};

/** A fake provider: answers each request with one vector per input, the first number being its position in the request's input. */
function fakeProvider(options: { dimensions?: number; shuffle?: boolean; status?: number; body?: unknown } = {}) {
  return vi.fn<Call>(async (_url, init) => {
    if (options.status) return new Response(JSON.stringify(options.body ?? { detail: `secret ${KEY}` }), { status: options.status });
    if (options.body !== undefined) return Response.json(options.body);
    return answer(init, options);
  });
}

type Step = number | "ok" | "network" | "hang" | "body-error" | { status: number; headers: Record<string, string> };

/** A fake provider that follows a script, one step per request; the last step repeats. */
function scripted(...steps: Step[]) {
  let n = 0;
  return vi.fn<Call>(async (_url, init) => {
    const step = steps[Math.min(n++, steps.length - 1)];
    if (step === "ok") return answer(init);
    if (step === "network") throw new TypeError("fetch failed");
    if (step === "body-error") return new Response(new ReadableStream({ start: (c) => c.error(new TypeError("terminated")) }), { status: 200 });
    if (step === "hang") return new Promise<Response>(() => {}); // ignores the abort signal, like a stuck socket
    if (typeof step === "number") return new Response(JSON.stringify({ detail: `secret ${KEY}` }), { status: step });
    return new Response("{}", { status: step.status, headers: step.headers });
  });
}

const NO_WAIT = { retryDelaysMs: [0, 0] };
const client = (fetch: ReturnType<typeof fakeProvider>, overrides = {}) =>
  createEmbeddingsClient({ apiKey: KEY, baseUrl: BASE, model: "voyage-4", fetch, ...NO_WAIT, ...overrides });

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("createEmbeddingsClient", () => {
  it("posts documents to {baseUrl}/embeddings with the bearer key, model, input type and 1024 dimensions", async () => {
    const fetch = fakeProvider();
    await client(fetch).embedDocuments(["doc 1"]);
    const [url, init] = fetch.mock.calls[0];
    expect(String(url)).toBe(`${BASE}/embeddings`);
    expect(init?.redirect).toBe("error"); // the key must not follow a redirect
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

  describe("answer validation", () => {
    it("rejects a vector that is not 1024 numbers long", async () => {
      await expect(client(fakeProvider({ dimensions: 512 })).embedDocuments(["doc 1"])).rejects.toMatchObject({ code: "upstream_failed" });
    });

    it("rejects an answer with the wrong shape or the wrong number of rows", async () => {
      await expect(client(fakeProvider({ body: { nope: true } })).embedDocuments(["doc 1"])).rejects.toMatchObject({ code: "upstream_failed" });
      await expect(client(fakeProvider({ body: { data: [] } })).embedDocuments(["doc 1"])).rejects.toMatchObject({ code: "upstream_failed" });
    });

    it.each([
      ["a duplicate index", [0, 0]],
      ["a gap", [0, 2]],
      ["indexes that start at 1", [1, 2]],
      ["an index past the end", [0, 5]],
    ])("rejects %s, since the rows would be matched to the wrong texts", async (_name, indexes) => {
      const body = { data: indexes.map((index) => ({ index, embedding: vector(index) })) };
      const fetch = fakeProvider({ body });
      await expect(client(fetch).embedDocuments(["doc 1", "doc 2"])).rejects.toMatchObject({ code: "upstream_failed" });
      expect(fetch).toHaveBeenCalledTimes(1); // a wrong answer is not retried
    });

    it("does not retry an answer that parsed badly or came back as 200 with no JSON", async () => {
      const fetch = vi.fn<Call>(async () => new Response("<html>oops</html>", { status: 200 }));
      await expect(client(fetch).embedQuery("hi")).rejects.toMatchObject({ code: "upstream_failed" });
      expect(fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("timeout", () => {
    it("defaults to 10 seconds like the WhatsApp adapter, with at most 3 tries", () => {
      expect(EMBEDDINGS_TIMEOUT_MS).toBe(10_000);
      expect(EMBEDDINGS_RETRY_DELAYS_MS).toHaveLength(2);
    });

    it("gives up on a provider that never answers, even if it ignores the abort signal", async () => {
      vi.useFakeTimers();
      const fetch = scripted("hang");
      const caught = client(fetch, { timeoutMs: 1000, retryDelaysMs: [] }).embedQuery("hi").catch((e: unknown) => e);
      await vi.advanceTimersByTimeAsync(1000);
      const error = await caught;
      expect(error).toBeInstanceOf(AppError);
      expect(error).toMatchObject({ code: "upstream_failed" });
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    });

    it("sends an abort signal that fires at the timeout", async () => {
      vi.useFakeTimers();
      const fetch = scripted("hang");
      const caught = client(fetch, { timeoutMs: 1000, retryDelaysMs: [] }).embedQuery("hi").catch((e: unknown) => e);
      await vi.advanceTimersByTimeAsync(0);
      const signal = fetch.mock.calls[0][1]?.signal as AbortSignal;
      expect(signal.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1000);
      expect(signal.aborted).toBe(true);
      await caught;
    });

    it("counts a timeout as a network failure and tries again", async () => {
      vi.useFakeTimers();
      const fetch = scripted("hang", "ok");
      const result = client(fetch, { timeoutMs: 1000, retryDelaysMs: [10] }).embedQuery("query 4");
      await vi.advanceTimersByTimeAsync(1010);
      await expect(result).resolves.toEqual(vector(4));
      expect(fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe("retries", () => {
    it.each([429, 500, 502, 503, 504])("retries a %i and returns the next good answer", async (status) => {
      const fetch = scripted(status, "ok");
      await expect(client(fetch).embedQuery("query 3")).resolves.toEqual(vector(3));
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it("retries a network failure", async () => {
      const fetch = scripted("network", "network", "ok");
      await expect(client(fetch).embedQuery("query 3")).resolves.toEqual(vector(3));
      expect(fetch).toHaveBeenCalledTimes(3);
    });

    it("stops after 3 tries in total and keeps the last status", async () => {
      const fetch = scripted(503);
      const error = await client(fetch).embedQuery("hi").catch((e: unknown) => e);
      expect(fetch).toHaveBeenCalledTimes(3);
      expect(error).toBeInstanceOf(EmbeddingsError);
      expect(error).toBeInstanceOf(AppError);
      expect(error).toMatchObject({ code: "upstream_failed", upstreamStatus: 503 });
    });

    it("waits between tries, longer each time", async () => {
      vi.useFakeTimers();
      const fetch = scripted(500);
      const caught = client(fetch, { retryDelaysMs: [250, 750] }).embedQuery("hi").catch((e: unknown) => e);
      await vi.advanceTimersByTimeAsync(0);
      expect(fetch).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(249);
      expect(fetch).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(fetch).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(749);
      expect(fetch).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(1);
      expect(fetch).toHaveBeenCalledTimes(3);
      await caught;
    });

    it("retries when the connection drops while the answer is being read", async () => {
      const fetch = scripted("body-error", "ok");
      await expect(client(fetch).embedQuery("query 6")).resolves.toEqual(vector(6));
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it("uses the longer of the backoff and Retry-After, and ignores Retry-After: 0", async () => {
      vi.useFakeTimers();
      const fetch = scripted({ status: 429, headers: { "retry-after": "0" } }, { status: 429, headers: { "retry-after": "1" } }, "ok");
      const result = client(fetch, { retryDelaysMs: [250, 250] }).embedQuery("query 2");
      await vi.advanceTimersByTimeAsync(249);
      expect(fetch).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(fetch).toHaveBeenCalledTimes(2); // Retry-After: 0 did not make it immediate
      await vi.advanceTimersByTimeAsync(999);
      expect(fetch).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(1);
      await expect(result).resolves.toEqual(vector(2));
      expect(fetch).toHaveBeenCalledTimes(3);
    });

    it("fails at once when the provider asks for a wait longer than 2 seconds, instead of retrying early", async () => {
      const fetch = scripted({ status: 429, headers: { "retry-after": "120" } }, "ok");
      const error = await client(fetch).embedQuery("hi").catch((e: unknown) => e);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(error).toMatchObject({ code: "upstream_failed", upstreamStatus: 429 });
    });

    it.each([400, 401, 403, 404, 422])("fails at once on a %i, without retrying, and keeps the status", async (status) => {
      const fetch = scripted(status, "ok");
      const error = await client(fetch).embedQuery("hi").catch((e: unknown) => e);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(error).toBeInstanceOf(EmbeddingsError);
      expect(error).toMatchObject({ code: "upstream_failed", upstreamStatus: status });
    });

    it("leaves upstreamStatus off when the failure was a network error", async () => {
      const error = await client(scripted("network")).embedQuery("hi").catch((e: unknown) => e);
      expect(error).toMatchObject({ code: "upstream_failed" });
      expect((error as EmbeddingsError).upstreamStatus).toBeUndefined();
    });

    it("retries each batch on its own and keeps the order", async () => {
      const calls: number[] = [];
      const fetch = vi.fn<Call>(async (_url, init) => {
        const { input } = JSON.parse(String(init?.body)) as { input: string[] };
        calls.push(input.length);
        if (calls.length === 2) return new Response("{}", { status: 503 }); // second request: the second batch's first try
        return answer(init);
      });
      const texts = Array.from({ length: EMBED_BATCH_SIZE + 2 }, (_, i) => `doc ${i}`);
      const result = await client(fetch).embedDocuments(texts);
      expect(calls).toEqual([EMBED_BATCH_SIZE, 2, 2]);
      expect(result).toHaveLength(texts.length);
    });
  });

  describe("what an error and the log may say", () => {
    it("turns a provider error into upstream_failed without echoing the key or the provider's body", async () => {
      const error = await client(fakeProvider({ status: 429 })).embedDocuments(["doc 1"]).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe("upstream_failed");
      expect((error as AppError).message).not.toContain(KEY);
      expect((error as AppError).message).not.toContain("secret");
      expect(JSON.stringify(error)).not.toContain(KEY);
    });

    it("logs the status of a failed try and nothing else: no key, no body, no text", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      await client(fakeProvider({ status: 429 })).embedDocuments(["my private question"]).catch(() => undefined);
      const logged = [...warn.mock.calls, ...error.mock.calls].flat().join("\n");
      expect(logged).toContain("429");
      for (const forbidden of [KEY, "secret", "my private question", BASE, "authorization"]) expect(logged).not.toContain(forbidden);
    });

    it("logs a network failure without the underlying error's text", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const fetch = vi.fn<Call>().mockRejectedValue(new TypeError(`connect ECONNREFUSED ${BASE} with ${KEY}`));
      await client(fetch).embedQuery("hi").catch(() => undefined);
      const logged = warn.mock.calls.flat().join("\n");
      expect(logged).not.toContain(KEY);
      expect(logged).not.toContain("ECONNREFUSED");
    });

    it("turns a network failure into upstream_failed", async () => {
      const fetch = vi.fn<Call>().mockRejectedValue(new TypeError("fetch failed"));
      await expect(client(fetch).embedQuery("hi")).rejects.toMatchObject({ code: "upstream_failed" });
    });
  });

  describe("configuration", () => {
    it("refuses a base URL that isn't https, naming the variable and not echoing the URL", () => {
      expect(() => client(fakeProvider(), { baseUrl: "http://embeddings.example.test/v1" })).toThrow(/EMBEDDINGS_BASE_URL/);
      expect(() => client(fakeProvider(), { baseUrl: "http://embeddings.example.test/v1" })).not.toThrow(/embeddings\.example/);
      expect(() => client(fakeProvider(), { baseUrl: "ftp://x.test" })).toThrow(/EMBEDDINGS_BASE_URL/);
      expect(() => client(fakeProvider(), { baseUrl: "not a url" })).toThrow(/EMBEDDINGS_BASE_URL/);
    });

    it("requires a key: an empty one is refused when the client is made, naming the variable", () => {
      expect(() => client(fakeProvider(), { apiKey: "" })).toThrow(/EMBEDDINGS_API_KEY/);
    });
  });
});
