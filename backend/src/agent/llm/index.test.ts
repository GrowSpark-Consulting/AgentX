import { beforeEach, describe, expect, it, vi } from "vitest";

// llm() builds one client from the server's environment. The environment is replaced, and the SDK and the
// tracing library are real but never called.

const env = { ANTHROPIC_API_KEY: "sk-ant-test", LANGFUSE_PUBLIC_KEY: undefined, LANGFUSE_SECRET_KEY: undefined } as Record<string, string | undefined>;
vi.mock("../../lib/env", () => ({ serverEnv: () => env }));

beforeEach(() => {
  vi.resetModules();
});

describe("llm()", () => {
  it("is one client for the whole process", async () => {
    const { llm } = await import("./index");
    expect(llm()).toBe(llm());
    expect(typeof llm().complete).toBe("function");
  });

  it("builds nothing until it is first used, and works without Langfuse keys", async () => {
    const { shutdownLlm, llm } = await import("./index");
    await expect(shutdownLlm()).resolves.toBeUndefined(); // nothing was started
    expect(() => llm()).not.toThrow();
    await expect(shutdownLlm()).resolves.toBeUndefined();
  });
});
