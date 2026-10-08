import { z } from "zod";

// Working hours and service areas as the slot engine reads them (docs/contracts.md section 3; Dev 2's
// WeeklyHours in backend/src/booking/slots.ts). tenants.business_hours and resources.working_hours are
// { "mon": [{ "start": "10:00", "end": "19:00" }], … }: keys mon–sun, local times in the business's
// time zone, several intervals for split shifts, a missing day or [] closed. A resource with no days
// set ({}) works the business's hours. resources.service_area is { "pincodes": [...] } or null (every
// pincode). This file only parses, validates and describes those shapes; it never works out slots.

export const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type Day = (typeof DAYS)[number];

export const DAY_NAMES: Record<Day, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};
const DAY_SHORT: Record<Day, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };

/** At most this many intervals in a day (the slot engine has no limit; this keeps the form usable). */
export const MAX_INTERVALS = 4;

const HHMM = /^(?:[01]\d|2[0-3]):[0-5]\d$|^24:00$/;
export const minutesOf = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

export interface Interval {
  start: string;
  end: string;
}
export type WeeklyHours = Partial<Record<Day, Interval[]>>;

/** Same rules as the slot engine's WeeklyHours: HH:MM (or 24:00) and end after start. */
const StoredInterval = z
  .object({ start: z.string().regex(HHMM), end: z.string().regex(HHMM) })
  .refine((i) => minutesOf(i.end) > minutesOf(i.start));
const StoredHours = z.partialRecord(z.enum(DAYS), z.array(StoredInterval));

/**
 * A stored hours value, or null when it doesn't match the contract (the slot engine then ignores it
 * too: a resource falls back to the business's hours, a business has none).
 */
export function parseHours(value: unknown): WeeklyHours | null {
  if (value === null || value === undefined) return {};
  const parsed = StoredHours.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** findSlots' rule: a resource whose hours have no days uses the business's hours. */
export function hasOwnHours(hours: WeeklyHours): boolean {
  return Object.keys(hours).length > 0;
}

// Display -------------------------------------------------------------------------------------------

function dayText(intervals: Interval[] | undefined): string {
  if (!intervals || intervals.length === 0) return "Closed";
  return [...intervals]
    .sort((a, b) => minutesOf(a.start) - minutesOf(b.start))
    .map((i) => `${i.start}–${i.end}`)
    .join(", ");
}

/**
 * "Mon–Sat 10:00–18:00 · Sun 10:00–13:00": consecutive days with the same hours share a range; closed
 * days are left out. "Closed every day" when nothing is open.
 */
export function summarizeHours(hours: WeeklyHours): string {
  const groups: { from: Day; to: Day; text: string }[] = [];
  for (const day of DAYS) {
    const text = dayText(hours[day]);
    const last = groups[groups.length - 1];
    if (last && last.text === text && DAYS.indexOf(last.to) === DAYS.indexOf(day) - 1) last.to = day;
    else groups.push({ from: day, to: day, text });
  }
  const open = groups.filter((g) => g.text !== "Closed");
  if (open.length === 0) return "Closed every day";
  return open.map((g) => `${g.from === g.to ? DAY_SHORT[g.from] : `${DAY_SHORT[g.from]}–${DAY_SHORT[g.to]}`} ${g.text}`).join(" · ");
}

// Form ----------------------------------------------------------------------------------------------

/** What the hours form holds: every day, as typed. An empty list is a closed day. */
export type HoursDraft = Record<Day, Interval[]>;

export function toHoursDraft(hours: WeeklyHours): HoursDraft {
  return Object.fromEntries(DAYS.map((d) => [d, (hours[d] ?? []).map((i) => ({ ...i }))])) as HoursDraft;
}

/** A sensible first week for a business or resource with no hours yet: Monday to Saturday, 10 to 6. */
export function defaultHoursDraft(): HoursDraft {
  return Object.fromEntries(DAYS.map((d) => [d, d === "sun" ? [] : [{ start: "10:00", end: "18:00" }]])) as HoursDraft;
}

/** "9:00" → "09:00", "9" → "09:00", "1830" → "18:30"; null when it isn't a time of day. */
export function normalizeTime(raw: string): string | null {
  const s = raw.trim().replace(".", ":");
  let h: string;
  let m: string;
  const colon = /^(\d{1,2}):(\d{2})$/.exec(s);
  const bare = /^(\d{1,2})(\d{2})?$/.exec(s);
  if (colon) [, h, m] = colon;
  else if (bare) [h, m] = [bare[1], bare[2] ?? "00"];
  else return null;
  const value = `${h.padStart(2, "0")}:${m}`;
  return HHMM.test(value) ? value : null;
}

/** Errors keyed "mon" (the day as a whole) or "mon.0.start" / "mon.0.end" (one box). */
export type HoursErrors = Record<string, string>;

/**
 * Validates every day before anything is saved: each time is HH:MM between 00:00 and 24:00, each
 * interval ends after it starts, and a day's intervals don't overlap. Returns all seven days, closed
 * ones as [] (so a resource whose days are all closed is not mistaken for "uses business hours").
 */
export function validateHours(draft: HoursDraft): { ok: true; hours: Required<WeeklyHours> } | { ok: false; errors: HoursErrors } {
  const errors: HoursErrors = {};
  const hours = {} as Required<WeeklyHours>;
  for (const day of DAYS) {
    const intervals: Interval[] = [];
    draft[day].forEach((interval, i) => {
      const start = normalizeTime(interval.start);
      const end = normalizeTime(interval.end);
      if (!start) errors[`${day}.${i}.start`] = "Enter a time like 09:30";
      if (!end) errors[`${day}.${i}.end`] = "Enter a time like 18:00";
      if (start === "24:00") errors[`${day}.${i}.start`] = "A day can't open at 24:00";
      if (start && end && start !== "24:00" && minutesOf(end) <= minutesOf(start)) {
        errors[`${day}.${i}.end`] = "Closing time must be after opening time";
      }
      if (start && end) intervals.push({ start, end });
    });
    if (draft[day].length > MAX_INTERVALS) errors[day] = `Up to ${MAX_INTERVALS} sets of hours a day`;
    const sorted = [...intervals].sort((a, b) => minutesOf(a.start) - minutesOf(b.start));
    for (let i = 1; i < sorted.length; i++) {
      if (minutesOf(sorted[i].start) < minutesOf(sorted[i - 1].end)) {
        errors[day] ??= `${DAY_NAMES[day]}'s hours overlap`;
      }
    }
    hours[day] = sorted;
  }
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, hours };
}

// Service area --------------------------------------------------------------------------------------

/** An Indian PIN code: six digits, not starting with 0. */
const PINCODE = /^[1-9]\d{5}$/;
export const MAX_PINCODES = 500;

const StoredArea = z.object({ pincodes: z.array(z.string()).optional() }).passthrough().nullable();

/** The pincodes a resource covers, or null for "every pincode" (the slot engine's rule). */
export function parseServiceArea(value: unknown): string[] | null {
  const parsed = StoredArea.safeParse(value ?? null);
  if (!parsed.success || !parsed.data?.pincodes || parsed.data.pincodes.length === 0) return null;
  return parsed.data.pincodes;
}

/**
 * The pincodes box: commas, spaces or new lines between codes. Blank means every pincode (null).
 * Duplicates are dropped; anything that isn't a six-digit PIN code is named in the error.
 */
export function parsePincodes(text: string): { ok: true; pincodes: string[] | null } | { ok: false; error: string } {
  const tokens = text.split(/[\s,;]+/).filter(Boolean);
  if (tokens.length === 0) return { ok: true, pincodes: null };
  const bad = tokens.filter((t) => !PINCODE.test(t));
  if (bad.length > 0) {
    const shown = bad.slice(0, 3).join(", ") + (bad.length > 3 ? ` and ${bad.length - 3} more` : "");
    return { ok: false, error: `${shown} ${bad.length === 1 ? "isn't a" : "aren't"} 6-digit pincode${bad.length === 1 ? "" : "s"}` };
  }
  const pincodes = [...new Set(tokens)];
  if (pincodes.length > MAX_PINCODES) return { ok: false, error: `Up to ${MAX_PINCODES} pincodes` };
  return { ok: true, pincodes };
}

/** "Any pincode", "600041", "600041, 600096 and 2 more". */
export function formatServiceArea(pincodes: string[] | null): string {
  if (!pincodes || pincodes.length === 0) return "Any pincode";
  if (pincodes.length <= 2) return pincodes.join(", ");
  return `${pincodes.slice(0, 2).join(", ")} and ${pincodes.length - 2} more`;
}
