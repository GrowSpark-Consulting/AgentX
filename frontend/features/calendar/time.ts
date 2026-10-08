// Dates in the business's time zone, for display. Bookings are stored as UTC instants (timestamptz) and
// shown in tenants.timezone, whatever the browser's own zone is (docs/dashboard-screen-contracts.md,
// rule 7). Only Intl with an explicit timeZone is used, never the browser's local time. Calendar dates
// are "YYYY-MM-DD" strings in that zone.

const partsFormatters = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let f = partsFormatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    partsFormatters.set(timeZone, f);
  }
  return f;
}

/** Whether Intl knows the zone; an unknown one would throw on every format. */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** The local calendar date and minutes since local midnight of an instant. */
export function localParts(instant: Date, timeZone: string): { date: string; minutes: number } {
  const p = Object.fromEntries(partsFormatter(timeZone).formatToParts(instant).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) + Number(p.second) / 60 };
}

function offsetMs(instant: number, timeZone: string): number {
  const p = Object.fromEntries(partsFormatter(timeZone).formatToParts(new Date(instant)).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/** The instant a local wall-clock time happens: `minutes` after midnight on `date` in the zone. */
export function zonedTime(date: string, minutes: number, timeZone: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d) + minutes * 60_000;
  const first = guess - offsetMs(guess, timeZone);
  const second = guess - offsetMs(first, timeZone);
  return new Date(second);
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** 0 = Monday … 6 = Sunday. */
export function weekdayIndex(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

/** The Monday of the week holding `date`. */
export function weekStart(date: string): string {
  return addDays(date, -weekdayIndex(date));
}

export function isDateString(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

/** "10:00 am" */
export function formatTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone }).format(new Date(iso));
}

/** "Mon 12 Oct" for a calendar date (the date itself, no zone shift). */
export function formatDate(date: string, opts: { weekday?: "short" | "long"; year?: boolean } = {}): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", {
    weekday: opts.weekday ?? "short",
    day: "numeric",
    month: "short",
    ...(opts.year ? { year: "numeric" } : {}),
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** "Mon 12 Oct, 10:00 am" in the business's zone. */
export function formatWhen(iso: string, timeZone: string): string {
  return `${formatDate(localParts(new Date(iso), timeZone).date)}, ${formatTime(iso, timeZone)}`;
}

/** "45 min", "1 h 30 min", "2 days". */
export function formatSpan(startIso: string, endIso: string): string {
  const minutes = Math.round((Date.parse(endIso) - Date.parse(startIso)) / 60_000);
  if (minutes >= 1440 && minutes % 1440 === 0) return minutes === 1440 ? "1 day" : `${minutes / 1440} days`;
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}
