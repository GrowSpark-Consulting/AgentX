import { describe, expect, it } from "vitest";
import { TURN_HARD_STOP_MS, TURN_TARGET_MS, turnClock } from "./turn-deadline";

// One budget for the whole turn, shared by every step of a run, worked out from when the turn started.

describe("turnClock", () => {
  it("aims for 10 seconds and stops everything at 25", () => {
    expect(TURN_TARGET_MS).toBe(10_000);
    expect(TURN_HARD_STOP_MS).toBe(25_000);
  });

  it("has the whole budget at the start", () => {
    const clock = turnClock(1_000, 1_000);
    expect(clock).toMatchObject({ remainingMs: 25_000, exceeded: false });
    expect(clock.signal.aborted).toBe(false);
  });

  it("has what is left, however many steps ago the turn started", () => {
    expect(turnClock(0, 12_500)).toMatchObject({ remainingMs: 12_500, exceeded: false });
    expect(turnClock(0, 24_999)).toMatchObject({ remainingMs: 1, exceeded: false });
  });

  it("is exceeded, with an already aborted signal, at and after the hard stop", () => {
    for (const now of [25_000, 25_001, 90_000]) {
      const clock = turnClock(0, now);
      expect(clock).toMatchObject({ remainingMs: 0, exceeded: true });
      expect(clock.signal.aborted).toBe(true);
    }
  });

  it("aborts its signal when the time left passes", async () => {
    const clock = turnClock(0, 24_970); // 30 ms left
    expect(clock.signal.aborted).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(clock.signal.aborted).toBe(true);
  });

  it("does not trust a start time in the future: the budget is never more than the whole", () => {
    expect(turnClock(10_000, 5_000).remainingMs).toBe(TURN_HARD_STOP_MS);
  });
});
