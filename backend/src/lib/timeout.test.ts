import { afterEach, describe, expect, it, vi } from "vitest";
import { TimeoutError, withTimeout } from "./timeout";

afterEach(() => vi.useRealTimers());

describe("withTimeout", () => {
  it("returns what the work returns and leaves no timer behind", async () => {
    vi.useFakeTimers();
    await expect(withTimeout(async () => 42, 1000)).resolves.toBe(42);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("passes the work's own error through unchanged and leaves no timer behind", async () => {
    vi.useFakeTimers();
    const boom = new Error("boom");
    await expect(withTimeout(async () => Promise.reject(boom), 1000)).rejects.toBe(boom);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("rejects with TimeoutError and aborts the signal when the work takes too long", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const pending = withTimeout((s) => {
      signal = s;
      return new Promise<never>(() => {});
    }, 1000);
    const caught = pending.catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(999);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await caught).toBeInstanceOf(TimeoutError);
    expect(signal?.aborted).toBe(true);
  });

  it("still times out when the work ignores the abort signal and rejects later", async () => {
    vi.useFakeTimers();
    const caught = withTimeout(() => new Promise<never>((_, reject) => setTimeout(() => reject(new Error("late")), 5000)), 1000).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await caught).toBeInstanceOf(TimeoutError);
    await vi.advanceTimersByTimeAsync(5000); // the late rejection must not surface as an unhandled rejection
  });

  it("gives a TimeoutError message that carries no input", () => {
    expect(new TimeoutError().message).toBe("timed out");
  });
});
