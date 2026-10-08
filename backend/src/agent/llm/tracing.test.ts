import { createServer, type IncomingMessage, type Server } from "node:http";
import { gunzipSync } from "node:zlib";
import type { AddressInfo } from "node:net";
import { trace } from "@opentelemetry/api";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GenerationEvent } from "./anthropic";
import { createLangfuseTracer, noopTracer, TEXT_LIMIT, tracerFromEnv, type TracerHandle } from "./tracing";

// Langfuse tracing, tested through the real exporter into a local HTTP server that records what arrives. That
// is the only way to know what leaves the process: the tenant id and the numbers must, a customer's words
// must not (unless text capture is switched on, and then masked and cut short).

const TENANT = "e0000000-0000-0000-0000-00000000000a";
const CONVERSATION = "c0000000-0000-0000-0000-00000000000c";
const CUSTOMER_TEXT = "Hi, I am Asha, call me on 9812345621 or mail asha.k@example.com. Budget is 80 lakh.";

interface Received {
  method: string;
  url: string;
  authorization: string | undefined;
  body: string;
}

const servers: Server[] = [];
const handles: TracerHandle[] = [];
afterEach(async () => {
  await Promise.all(handles.splice(0).map((h) => h.shutdown().catch(() => undefined)));
  await Promise.all(servers.splice(0).map((s) => new Promise((resolve) => (s.closeAllConnections(), s.close(resolve)))));
});

async function collector() {
  const received: Received[] = [];
  const server = createServer((req: IncomingMessage, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks);
      const body = req.headers["content-encoding"] === "gzip" ? gunzipSync(raw) : raw;
      received.push({ method: req.method ?? "", url: req.url ?? "", authorization: req.headers.authorization, body: body.toString("utf8") });
      res.writeHead(200, { "content-type": "application/json" });
      res.end("{}");
    });
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { received, baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

const event = (over: Partial<GenerationEvent> = {}): GenerationEvent => ({
  tenantId: TENANT,
  conversationId: CONVERSATION,
  role: "reply",
  model: "claude-sonnet-5-5",
  prompt: { name: "reply", version: 1 },
  status: "ok",
  attempts: 1,
  latencyMs: 1800,
  stopReason: "end_turn",
  usage: { inputTokens: 800, outputTokens: 250, cacheReadTokens: 3000, cacheWriteTokens: 0 },
  costUsd: 0.0031,
  input: { system: ["RULES for this business"], messages: [{ role: "user", content: CUSTOMER_TEXT }] },
  output: "The 2BHK starts at 78 lakh. You can reach us on 9812345621.",
  ...over,
});

/** Every attribute of every span that arrived, by name (values as the exporter sent them). */
function attributesOf(received: Received[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const request of received) {
    const parsed = JSON.parse(request.body) as { resourceSpans: { scopeSpans: { spans: { attributes: { key: string; value: Record<string, unknown> }[] }[] }[] }[] };
    for (const span of parsed.resourceSpans.flatMap((r) => r.scopeSpans.flatMap((sc) => sc.spans))) {
      for (const { key, value } of span.attributes) out[key] = Object.values(value)[0];
    }
  }
  return out;
}

async function traced(over: Partial<Parameters<typeof createLangfuseTracer>[0]> = {}, e: GenerationEvent = event()) {
  const { received, baseUrl } = await collector();
  const handle = createLangfuseTracer({ publicKey: "pk-lf-test", secretKey: "sk-lf-test", baseUrl, compression: "none", ...over });
  handles.push(handle);
  handle.tracer.record(e);
  await handle.flush();
  return { received, body: received.map((r) => r.body).join("\n"), attributes: attributesOf(received), handle };
}

describe("what is sent to Langfuse", () => {
  it("one generation to the Langfuse OpenTelemetry endpoint, signed with the project's keys", async () => {
    const { received } = await traced();
    expect(received.length).toBeGreaterThanOrEqual(1);
    expect(received[0]).toMatchObject({ method: "POST", url: "/api/public/otel/v1/traces" });
    expect(received[0].authorization).toBe(`Basic ${Buffer.from("pk-lf-test:sk-lf-test").toString("base64")}`);
  });

  it("the tenant id, the conversation id, the model, the prompt version, the tokens, the cost and the time, as the attributes Langfuse reads", async () => {
    const { attributes } = await traced();
    expect(attributes["langfuse.trace.name"]).toBe("reply_v1");
    expect(attributes["session.id"]).toBe(CONVERSATION);
    expect(attributes["langfuse.trace.metadata.tenant_id"]).toBe(TENANT);
    expect(attributes["langfuse.trace.tags"]).toEqual({ values: [{ stringValue: `tenant:${TENANT}` }, { stringValue: "role:reply" }] });
    expect(attributes["langfuse.observation.type"]).toBe("generation");
    expect(attributes["langfuse.observation.model.name"]).toBe("claude-sonnet-5-5");
    expect(attributes["langfuse.observation.level"]).toBe("DEFAULT");
    expect(JSON.parse(String(attributes["langfuse.observation.usage_details"]))).toEqual({ input: 800, output: 250, cache_read_input_tokens: 3000, cache_creation_input_tokens: 0 });
    expect(JSON.parse(String(attributes["langfuse.observation.cost_details"]))).toEqual({ total: 0.0031 });
    expect(attributes["langfuse.observation.metadata.prompt_version"]).toBe("1");
    expect(attributes["langfuse.observation.metadata.latency_ms"]).toBe("1800");
    expect(attributes["langfuse.observation.metadata.attempts"]).toBe("1");
  });

  it("no message text and no reply text by default, only how long they were", async () => {
    const { body } = await traced();
    expect(body).not.toContain("Asha");
    expect(body).not.toContain("9812345621");
    expect(body).not.toContain("asha.k@example.com");
    expect(body).not.toContain("80 lakh");
    expect(body).not.toContain("starts at 78 lakh");
    expect(body).not.toContain("RULES for this business");
    expect(body).toContain("input_chars");
    expect(body).toContain("output_chars");
  });

  it("with text capture on: the customer's words and the reply, with phone numbers and emails masked", async () => {
    const { body } = await traced({ captureText: true });
    expect(body).toContain("80 lakh");
    expect(body).toContain("starts at 78 lakh");
    expect(body).not.toContain("9812345621");
    expect(body).not.toContain("asha.k@example.com");
    expect(body).toMatch(/xxxxxxxx21/); // the last two digits stay, like the logs
    expect(body).toContain("***@***");
    expect(body).not.toContain("RULES for this business"); // our own prompt is not the customer's, and not needed on a trace
  });

  it("with text capture on, long text is cut to a limit and the cut never leaves half a phone number", async () => {
    const long = `${"x".repeat(TEXT_LIMIT - 5)} 9812345621 and more`;
    const { body } = await traced({ captureText: true }, event({ input: { system: [], messages: [{ role: "user", content: long }] } }));
    expect(body).not.toContain("9812345621");
    expect(body).not.toMatch(/98123\d/); // not even the start of it
    expect(body).not.toContain("and more");
  });

  it("a failed call is an error observation with its code and status, and no output", async () => {
    const { attributes } = await traced({}, event({ status: "error", errorCode: "rejected", httpStatus: 401, output: undefined, usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }, costUsd: 0 }));
    expect(attributes["langfuse.observation.level"]).toBe("ERROR");
    expect(attributes["langfuse.observation.status_message"]).toBe("rejected");
    expect(attributes["langfuse.observation.metadata.error_code"]).toBe("rejected");
    expect(attributes["langfuse.observation.metadata.http_status"]).toBe("401");
    expect(attributes).not.toHaveProperty("langfuse.observation.metadata.output_chars");
  });

  it("the environment name, when one is given", async () => {
    const { attributes } = await traced({ environment: "staging" });
    expect(attributes["langfuse.environment"]).toBe("staging");
  });

  it("with text capture on, a cut inside an emoji never leaves half of it", async () => {
    const text = "\u{1F600}".repeat(TEXT_LIMIT + 50); // each is two UTF-16 units, so a cut by units would land inside one
    const { attributes } = await traced({ captureText: true }, event({ input: { system: [], messages: [{ role: "user", content: text }] }, output: "\u{1F600}".repeat(TEXT_LIMIT + 1) }));
    const loneSurrogate = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
    const input = String(attributes["langfuse.observation.input"]);
    const output = String(attributes["langfuse.observation.output"]);
    expect(input).not.toMatch(loneSurrogate);
    expect(output).not.toMatch(loneSurrogate);
    expect([...output]).toHaveLength(TEXT_LIMIT);
  });
});

describe("when Langfuse cannot be reached", () => {
  it("never throws into the caller and never takes long, and a flush still finishes", async () => {
    const handle = createLangfuseTracer({ publicKey: "pk", secretKey: "sk", baseUrl: "http://127.0.0.1:1", compression: "none", timeoutMs: 500, flushTimeoutMs: 300 });
    handles.push(handle);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const started = Date.now();
    expect(() => handle.tracer.record(event())).not.toThrow();
    expect(Date.now() - started).toBeLessThan(1500); // recording does not wait for the network (the failing export takes far longer)
    await expect(handle.flush()).resolves.toBeUndefined();
  });

  it("swallows a malformed event instead of throwing", async () => {
    const { handle } = await traced();
    expect(() => handle.tracer.record({ ...event(), usage: undefined as never, input: undefined as never })).not.toThrow();
  });
});

describe("how it is set up", () => {
  it("does not register itself as the process's tracer: nothing else's spans go to Langfuse", async () => {
    await traced();
    expect(trace.getTracer("something-else").startSpan("x").isRecording()).toBe(false);
  });

  it("can be flushed and shut down more than once", async () => {
    const { handle } = await traced();
    await handle.shutdown();
    await expect(handle.shutdown()).resolves.toBeUndefined();
    expect(() => handle.tracer.record(event())).not.toThrow();
  });
});

describe("noopTracer", () => {
  it("records nothing and throws nothing", () => {
    expect(() => noopTracer.record(event())).not.toThrow();
  });
});

describe("tracerFromEnv", () => {
  const base = {} as Parameters<typeof tracerFromEnv>[0];

  it("is off when there are no keys: the no-op tracer", () => {
    const handle = tracerFromEnv({ ...base });
    expect(handle.tracer).toBe(noopTracer);
  });

  it("is on when both keys are set, against the Langfuse cloud address unless another is given", async () => {
    const { received, baseUrl } = await collector();
    const handle = tracerFromEnv({ ...base, LANGFUSE_PUBLIC_KEY: "pk", LANGFUSE_SECRET_KEY: "sk", LANGFUSE_BASE_URL: baseUrl });
    handles.push(handle);
    handle.tracer.record(event());
    await handle.flush();
    expect(received.length).toBeGreaterThanOrEqual(1);
  });

  it("captures text only when LANGFUSE_CAPTURE_TEXT is exactly true", async () => {
    for (const [value, captured] of [["true", true], ["false", false], [undefined, false], ["yes", false]] as const) {
      const { received, baseUrl } = await collector();
      const handle = tracerFromEnv({ ...base, LANGFUSE_PUBLIC_KEY: "pk", LANGFUSE_SECRET_KEY: "sk", LANGFUSE_BASE_URL: baseUrl, LANGFUSE_CAPTURE_TEXT: value as never });
      handles.push(handle);
      handle.tracer.record(event());
      await handle.flush();
      expect(received.map((r) => r.body).join("").includes("80 lakh"), String(value)).toBe(captured);
    }
  });
});
