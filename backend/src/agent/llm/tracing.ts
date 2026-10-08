import { LangfuseSpanProcessor } from "@langfuse/otel";
import { setLangfuseTracerProvider, startObservation } from "@langfuse/tracing";
import { BasicTracerProvider } from "@opentelemetry/sdk-trace-base";
import type { ServerEnv } from "../../lib/env";
import type { GenerationEvent, Tracer } from "./anthropic";
import { maskPersonalData } from "./mask";

// LLM tracing with Langfuse (docs/handover.md: "Steps 4 and 7 are the only LLM calls. Their inputs and outputs
// are logged to Langfuse with the tenant id"). The current Langfuse SDK is built on OpenTelemetry; the `langfuse`
// package on npm is the deprecated v3 client.
//
// - Off when there are no keys: nothing is created, nothing is sent.
// - Its own tracer provider, not the process's: nothing else's spans (Inngest's, for one) can reach Langfuse.
// - Recording never waits for the network and never throws: a Langfuse outage must not slow or change a reply.
// - A trace carries the tenant id (metadata and a tag), the conversation id as the session, the model, the prompt
//   name and version, tokens, an estimated cost, the time and the number of tries. It carries NO message text by
//   default (only how long it was). With LANGFUSE_CAPTURE_TEXT=true it also carries the customer's words and the
//   reply, with phone numbers and emails masked and each cut to TEXT_LIMIT characters (masking first, so a cut
//   can never leave the start of a number). The prompt itself is ours, not the customer's, and is never sent.

export const TEXT_LIMIT = 2000;
const DEFAULT_BASE_URL = "https://cloud.langfuse.com";
const EXPORT_TIMEOUT_MS = 10_000;
const FLUSH_TIMEOUT_MS = 5_000;

export interface LangfuseConfig {
  publicKey: string;
  secretKey: string;
  baseUrl?: string;
  /** Also send masked, shortened message and reply text. Default false. */
  captureText?: boolean;
  /** The Langfuse environment label (lower case letters, digits, - and _). */
  environment?: string;
  compression?: "gzip" | "none";
  /** One export request. Default 10 seconds. */
  timeoutMs?: number;
  /** How long flush() may take in all, whatever the exporter's own retries are doing. Default 5 seconds. */
  flushTimeoutMs?: number;
}

export interface TracerHandle {
  tracer: Tracer;
  /** Sends what is waiting. Resolves, never rejects. */
  flush(): Promise<void>;
  /** Flushes and stops. Safe to call more than once. */
  shutdown(): Promise<void>;
}

export const noopTracer: Tracer = { record: () => undefined };
const noopHandle: TracerHandle = { tracer: noopTracer, flush: async () => undefined, shutdown: async () => undefined };

/** Masked, then shortened. */
const prepare = (text: string) => [...maskPersonalData(text)].slice(0, TEXT_LIMIT).join(""); // by character: never inside an emoji

/** Langfuse accepts lower case letters, digits, - and _, up to 40, and nothing that starts with "langfuse". */
function environmentLabel(raw: string | undefined): string | undefined {
  const label = raw
    ?.toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .slice(0, 40);
  return label && !label.startsWith("langfuse") ? label : undefined;
}

export function createLangfuseTracer(config: LangfuseConfig): TracerHandle {
  const environment = environmentLabel(config.environment);
  const processor = new LangfuseSpanProcessor({
    publicKey: config.publicKey,
    secretKey: config.secretKey,
    baseUrl: config.baseUrl ?? DEFAULT_BASE_URL,
    exportMode: "immediate", // each observation goes out on its own: a restart loses at most the one in flight
    compression: config.compression ?? "gzip",
    timeout: config.timeoutMs ?? EXPORT_TIMEOUT_MS,
    ...(environment && { environment }),
  });
  const provider = new BasicTracerProvider({ spanProcessors: [processor] });
  setLangfuseTracerProvider(provider);
  let stopped = false;

  function record(event: GenerationEvent): void {
    if (stopped) return;
    try {
      const name = `${event.prompt.name}_v${event.prompt.version}`;
      const inputText = event.input.messages.map((m) => `${m.role}: ${m.content}`).join("\n");
      const failed = event.status === "error";
      const generation = startObservation(
        name,
        {
          model: event.model,
          usageDetails: {
            input: event.usage.inputTokens,
            output: event.usage.outputTokens,
            cache_read_input_tokens: event.usage.cacheReadTokens,
            cache_creation_input_tokens: event.usage.cacheWriteTokens,
          },
          ...(event.costUsd !== null && { costDetails: { total: event.costUsd } }),
          level: failed ? "ERROR" : "DEFAULT",
          ...(failed && event.errorCode && { statusMessage: event.errorCode }),
          metadata: {
            role: event.role,
            prompt_name: event.prompt.name,
            prompt_version: event.prompt.version,
            attempts: event.attempts,
            latency_ms: event.latencyMs,
            cost_is_estimate: true,
            input_chars: inputText.length,
            ...(event.output !== undefined && { output_chars: event.output.length }),
            ...(event.stopReason && { stop_reason: event.stopReason }),
            ...(event.errorCode && { error_code: event.errorCode }),
            ...(event.httpStatus !== undefined && { http_status: event.httpStatus }),
          },
          ...(config.captureText && {
            input: event.input.messages.map((m) => ({ role: m.role, content: prepare(m.content) })),
            ...(event.output !== undefined && { output: prepare(event.output) }),
          }),
        },
        { asType: "generation", startTime: new Date(Date.now() - Math.max(0, event.latencyMs)) },
      );
      // Trace-level fields are set on the span itself: propagating them through the OpenTelemetry context would
      // need a context manager registered for the whole process, which this tracer deliberately is not.
      generation.otelSpan.setAttributes({
        "langfuse.trace.name": name,
        ...(event.conversationId && { "session.id": event.conversationId }),
        "langfuse.trace.metadata.tenant_id": event.tenantId,
        "langfuse.trace.metadata.role": event.role,
        "langfuse.trace.tags": [`tenant:${event.tenantId}`, `role:${event.role}`],
      });
      generation.end();
    } catch {
      // a malformed event or an SDK problem: tracing is best effort
    }
  }

  /** Waits for `work`, but never longer than flushTimeoutMs: the exporter retries a failing request for far longer than anyone should wait at shutdown. */
  async function bounded(work: () => Promise<unknown>): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([work(), new Promise<void>((resolve) => (timer = setTimeout(resolve, config.flushTimeoutMs ?? FLUSH_TIMEOUT_MS)))]);
    } catch {
      // the export failed: it was already reported by the exporter, and there is nothing a caller can do
    } finally {
      clearTimeout(timer);
    }
  }
  const flush = () => bounded(() => provider.forceFlush());

  return {
    tracer: { record },
    flush,
    async shutdown() {
      if (stopped) return;
      stopped = true;
      await bounded(() => provider.shutdown());
    },
  };
}

type TracingEnv = Pick<ServerEnv, "LANGFUSE_PUBLIC_KEY" | "LANGFUSE_SECRET_KEY" | "LANGFUSE_BASE_URL" | "LANGFUSE_CAPTURE_TEXT" | "RAILWAY_ENVIRONMENT_NAME">;

/** Langfuse tracing when both keys are set (the environment schema makes them come as a pair); otherwise off. */
export function tracerFromEnv(env: TracingEnv): TracerHandle {
  if (!env.LANGFUSE_PUBLIC_KEY || !env.LANGFUSE_SECRET_KEY) return noopHandle;
  return createLangfuseTracer({
    publicKey: env.LANGFUSE_PUBLIC_KEY,
    secretKey: env.LANGFUSE_SECRET_KEY,
    baseUrl: env.LANGFUSE_BASE_URL,
    captureText: env.LANGFUSE_CAPTURE_TEXT === "true",
    environment: env.RAILWAY_ENVIRONMENT_NAME ?? "local",
  });
}
