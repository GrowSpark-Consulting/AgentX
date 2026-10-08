import { describe, expect, it, vi } from "vitest";
import { functions } from "./functions";
import { processMessage } from "./process-message";

// onFailure sends one safe line to a customer a failed run left unanswered; the real database is not reached here.
const answerRunThatGaveUp = vi.hoisted(() => vi.fn(async () => "nothing_to_do"));
vi.mock("../agent/pipeline/give-up", () => ({ answerRunThatGaveUp }));

// The wiring of the process-message job: that it is registered, what starts it, and that messages from one
// customer are handled one at a time and together. What it does is tested in agent/pipeline/process-message.test.ts.

describe("process-message", () => {
  const opts = processMessage.opts as unknown as Record<string, unknown>;

  it("is registered with the one Inngest endpoint", () => {
    expect(functions).toContain(processMessage);
  });

  it("starts on whatsapp/message.received", () => {
    expect(opts.id).toBe("process-message");
    expect(opts.triggers).toEqual([{ event: "whatsapp/message.received" }]);
  });

  it("handles one conversation at a time", () => {
    expect(opts.concurrency).toEqual({ key: "event.data.conversationId", limit: 1 });
  });

  it("waits 3 seconds for more messages from the same conversation, and never longer than 15 seconds in all", () => {
    expect(opts.debounce).toEqual({ key: "event.data.conversationId", period: "3s", timeout: "15s" });
  });

  it("retries a failing step 3 times", () => {
    expect(opts.retries).toBe(3);
  });
});

describe("process-message when its retries run out", () => {
  const onFailure = () => (processMessage.opts as unknown as { onFailure: (args: unknown) => Promise<void> }).onFailure;
  const failure = (data: unknown, error = new Error("connect ECONNREFUSED 10.0.0.5 call me on 9812345621")) => ({ event: { data: { event: { name: "whatsapp/message.received", data } } }, error });

  it("leaves a line with the message id and the kind of error, and nothing else", async () => {
    const lines: string[] = [];
    const spy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => void lines.push(args.join(" ")));
    await onFailure()(failure({ tenantId: "e0000000-0000-0000-0000-00000000000a", conversationId: "c0000000-0000-0000-0000-00000000000c", messageId: "a0000000-0000-0000-0000-0000000000a1" }));
    spy.mockRestore();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("a0000000-0000-0000-0000-0000000000a1");
    expect(lines[0]).toContain("Error");
    expect(lines[0]).not.toMatch(/10\.0\.0\.5|9812345621|ECONNREFUSED/);
  });

  it("then sends the customer one safe line if their message is still unanswered (give-up.ts looks first)", async () => {
    answerRunThatGaveUp.mockClear();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const ids = { tenantId: "e0000000-0000-0000-0000-00000000000a", conversationId: "c0000000-0000-0000-0000-00000000000c", messageId: "a0000000-0000-0000-0000-0000000000a1" };
    await onFailure()(failure(ids));
    spy.mockRestore();
    expect(answerRunThatGaveUp).toHaveBeenCalledWith(ids);
    expect(log.mock.calls.flat().join(" ")).toContain("safe line after giving up: nothing_to_do");
    log.mockRestore();
  });

  it("sends nothing for an event it cannot read", async () => {
    answerRunThatGaveUp.mockClear();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await onFailure()(failure({ not: "ids" }));
    spy.mockRestore();
    expect(answerRunThatGaveUp).not.toHaveBeenCalled();
  });

  it("copes with an event it cannot read", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(onFailure()(failure(undefined))).resolves.toBeUndefined();
    spy.mockRestore();
  });
});
