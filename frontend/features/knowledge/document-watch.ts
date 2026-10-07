// Polling for documents that are still processing (contracts.md section 9: "the dashboard watches
// kb_documents through Realtime, polling while a row is processing"). Framework-free so the timing
// rules can be tested with fake timers; use-document-watch.ts wires it to React and Realtime.

/** How often a processing document is re-read. */
export const POLL_INTERVAL_MS = 3_000;
/** About five minutes, then the screen offers "Check again" instead of polling on forever. */
export const MAX_POLLS = 100;

export interface Poller {
  /** Stops for good: no more ticks, and onGiveUp isn't called. Safe to call twice. */
  stop(): void;
}

/**
 * Calls `tick` every `intervalMs`, one at a time: the next wait starts only after the previous tick
 * settles, so a slow read never overlaps the next. After `maxPolls` ticks it stops and calls
 * `onGiveUp`. The caller stops it when nothing is processing any more or the screen unmounts.
 */
export function startPolling({
  tick,
  onGiveUp,
  intervalMs = POLL_INTERVAL_MS,
  maxPolls = MAX_POLLS,
}: {
  tick: () => Promise<unknown>;
  onGiveUp: () => void;
  intervalMs?: number;
  maxPolls?: number;
}): Poller {
  let stopped = false;
  let polls = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const schedule = () => {
    timer = setTimeout(async () => {
      if (stopped) return;
      polls += 1;
      try {
        await tick();
      } catch {
        // A failed read is retried on the next tick; the list keeps what it last showed.
      }
      if (stopped) return;
      if (polls >= maxPolls) {
        stopped = true;
        onGiveUp();
        return;
      }
      schedule();
    }, intervalMs);
  };
  schedule();

  return {
    stop() {
      stopped = true;
      clearTimeout(timer);
    },
  };
}
