// The turn's own clock: one budget for understanding, searching, replying and sending, across all the steps of a run
// (docs/handover.md: the customer should have an answer within 10 seconds). Inngest runs each step as its own
// invocation of the function, so a timer in memory would not survive; instead the first step records when the turn
// started, and every invocation works out how much of the budget is left and makes a signal for exactly that.
//
// TARGET is what we aim for (nothing stops at it; it is what the exit test measures). HARD_STOP is when everything
// still waiting is cancelled and the customer gets the safe fallback instead of silence.

export const TURN_TARGET_MS = 10_000;
export const TURN_HARD_STOP_MS = 25_000;

export interface TurnClock {
  /** Milliseconds left until the hard stop, never below 0. */
  remainingMs: number;
  /** The hard stop has passed. */
  exceeded: boolean;
  /** Aborts when the hard stop passes (already aborted when it has). Pass it to every call that can wait. */
  signal: AbortSignal;
}

export function turnClock(startedAt: number, now: number = Date.now()): TurnClock {
  const remainingMs = Math.min(TURN_HARD_STOP_MS, Math.max(0, TURN_HARD_STOP_MS - (now - startedAt)));
  const exceeded = remainingMs === 0;
  return { remainingMs, exceeded, signal: exceeded ? AbortSignal.abort() : AbortSignal.timeout(remainingMs) };
}
