import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_POLLS, POLL_INTERVAL_MS, startPolling } from "./document-watch";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("polling a processing document", () => {
  it("re-reads on every interval until stopped, and never after", async () => {
    const tick = vi.fn().mockResolvedValue(undefined);
    const onGiveUp = vi.fn();
    const poller = startPolling({ tick, onGiveUp });
    expect(tick).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    expect(tick).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 2);
    expect(tick).toHaveBeenCalledTimes(3);
    poller.stop();
    poller.stop();
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 10);
    expect(tick).toHaveBeenCalledTimes(3);
    expect(onGiveUp).not.toHaveBeenCalled();
  });

  it("gives up after the polling window instead of polling forever", async () => {
    const tick = vi.fn().mockResolvedValue(undefined);
    const onGiveUp = vi.fn();
    startPolling({ tick, onGiveUp });
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * (MAX_POLLS + 20));
    expect(tick).toHaveBeenCalledTimes(MAX_POLLS);
    expect(onGiveUp).toHaveBeenCalledTimes(1);
  });

  it("never overlaps a slow read with the next one", async () => {
    let finish: () => void = () => undefined;
    const tick = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    startPolling({ tick, onGiveUp: vi.fn(), intervalMs: 1000 });
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(5000);
    expect(tick).toHaveBeenCalledTimes(1);
    finish();
    await vi.advanceTimersByTimeAsync(1000);
    expect(tick).toHaveBeenCalledTimes(2);
  });

  it("keeps polling after a failed read", async () => {
    const tick = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(undefined);
    startPolling({ tick, onGiveUp: vi.fn(), intervalMs: 1000, maxPolls: 5 });
    await vi.advanceTimersByTimeAsync(3000);
    expect(tick).toHaveBeenCalledTimes(3);
  });

  it("stopping during a read cancels what would come after it", async () => {
    let finish: () => void = () => undefined;
    const tick = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    const onGiveUp = vi.fn();
    const poller = startPolling({ tick, onGiveUp, intervalMs: 1000, maxPolls: 1 });
    await vi.advanceTimersByTimeAsync(1000);
    poller.stop();
    finish();
    await vi.advanceTimersByTimeAsync(5000);
    expect(tick).toHaveBeenCalledTimes(1);
    expect(onGiveUp).not.toHaveBeenCalled();
  });
});
