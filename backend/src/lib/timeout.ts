// A timeout that holds even when the work ignores its abort signal (the pattern of the WhatsApp
// adapter's post(), shared). The work gets a signal that fires at the deadline; the caller gets a
// TimeoutError at the same moment whatever the work does afterwards.

export class TimeoutError extends Error {
  constructor() {
    super("timed out");
    this.name = "TimeoutError";
  }
}

export async function withTimeout<T>(run: (signal: AbortSignal) => PromiseLike<T> | T, ms: number): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new TimeoutError());
    }, ms);
  });
  deadline.catch(() => undefined); // if the work wins, the deadline is cleared and never rejects
  try {
    const work = Promise.resolve(run(controller.signal));
    work.catch(() => undefined); // if the deadline wins, a later rejection must not go unhandled
    return await Promise.race([work, deadline]);
  } finally {
    clearTimeout(timer);
  }
}
