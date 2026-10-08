// Time zones for bookings (docs/handover.md, module 4). Every time is stored in UTC and read in the
// business's own time zone, so "tomorrow evening" is the business's tomorrow whatever the server's clock
// says. Only Intl with an explicit timeZone is used here, never the server's local time.

export const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

/** Local windows for the parts of a day, in minutes from local midnight. */
export const DAY_PARTS = {
  morning: [9 * 60, 12 * 60],
  afternoon: [12 * 60, 17 * 60],
  evening: [17 * 60, 21 * 60],
  any: [0, 24 * 60],
} as const satisfies Record<string, readonly [number, number]>;
export type DayPart = keyof typeof DAY_PARTS;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
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
      weekday: "short",
    });
    formatters.set(timeZone, f);
  }
  return f;
}

function wallClock(instant: Date, timeZone: string) {
  const p: Record<string, string> = {};
  for (const part of formatter(timeZone).formatToParts(instant)) p[part.type] = part.value;
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour) % 24,
    minute: Number(p.minute),
    second: Number(p.second),
    weekday: p.weekday.slice(0, 3).toLowerCase() as Weekday,
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

function parseDate(date: string): [number, number, number] {
  const m = DATE.exec(date);
  if (!m) throw new RangeError(`not a YYYY-MM-DD date: ${date}`);
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const check = new Date(Date.UTC(y, mo - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) {
    throw new RangeError(`not a calendar date: ${date}`);
  }
  return [y, mo, d];
}

/** The local date (YYYY-MM-DD), weekday and minute of the day of an instant in a time zone. */
export function localParts(instant: Date, timeZone: string): { date: string; weekday: Weekday; minuteOfDay: number } {
  const w = wallClock(instant, timeZone);
  return { date: `${w.year}-${pad(w.month)}-${pad(w.day)}`, weekday: w.weekday, minuteOfDay: w.hour * 60 + w.minute };
}

/** The weekday of a calendar date (the same in every time zone). */
export function weekdayOf(date: string): Weekday {
  const [y, m, d] = parseDate(date);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

/** The date `days` after a YYYY-MM-DD date. */
export function addDays(date: string, days: number): string {
  const [y, m, d] = parseDate(date);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

// Local wall time minus UTC, in milliseconds, at an instant.
function offsetMs(instantMs: number, timeZone: string): number {
  const w = wallClock(new Date(instantMs), timeZone);
  return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second) - Math.floor(instantMs / 1000) * 1000;
}

/**
 * The instant when a local date and minute of the day (0 to 1440) happen in a time zone. The offset
 * is checked twice, so daylight-saving changes resolve: a repeated local time gives the earlier
 * instant, and a skipped one lands next to the gap.
 */
export function zonedTime(date: string, minuteOfDay: number, timeZone: string): Date {
  const [y, m, d] = parseDate(date);
  const wall = Date.UTC(y, m - 1, d, 0, minuteOfDay);
  const first = wall - offsetMs(wall, timeZone);
  return new Date(wall - offsetMs(first, timeZone));
}

/**
 * The UTC window for a day in the business's time zone ("today", "tomorrow" or YYYY-MM-DD) and a part
 * of it (morning 9–12, afternoon 12–5, evening 5–9; the whole day by default). This is how "tomorrow
 * evening" becomes findSlots' from and to.
 */
export function localWindow(
  timeZone: string,
  when: { day: string; part?: DayPart },
  now: Date = new Date(),
): { date: string; from: Date; to: Date } {
  const today = localParts(now, timeZone).date;
  const date = when.day === "today" ? today : when.day === "tomorrow" ? addDays(today, 1) : (parseDate(when.day), when.day);
  const [start, end] = DAY_PARTS[when.part ?? "any"];
  return { date, from: zonedTime(date, start, timeZone), to: zonedTime(date, end, timeZone) };
}

/** How a slot reads to the customer, in the business's time zone: "Thu 9 Oct, 5:30 pm". */
export function slotLabel(instant: Date, timeZone: string): string {
  const w = wallClock(instant, timeZone);
  const hour12 = w.hour % 12 === 0 ? 12 : w.hour % 12;
  const weekday = w.weekday.charAt(0).toUpperCase() + w.weekday.slice(1);
  return `${weekday} ${w.day} ${MONTHS[w.month - 1]}, ${hour12}:${pad(w.minute)} ${w.hour < 12 ? "am" : "pm"}`;
}
