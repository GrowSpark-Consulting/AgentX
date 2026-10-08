import { z } from "zod";
import { addDays, localParts, weekdayOf, WEEKDAYS, zonedTime } from "./time";

// The slot engine's arithmetic, with no database (docs/handover.md, module 4): free times respect
// working hours, service length, the buffer around existing bookings and the minimum notice. findSlots
// loads the data and calls these. Times are compared as UTC instants; working hours are local.

const HHMM = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$|^24:00$/, "must be HH:MM");
const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

export const WorkingInterval = z
  .object({ start: HHMM, end: HHMM })
  .refine((i) => minutes(i.end) > minutes(i.start), "end must be after start");

/** `{ "mon": [{ "start": "10:00", "end": "19:00" }], ... }`: local times; a missing day or [] is closed. */
export const WeeklyHours = z.partialRecord(z.enum(WEEKDAYS), z.array(WorkingInterval));
export type WeeklyHours = z.infer<typeof WeeklyHours>;

/** Start times are offered every 30 minutes from the opening time. */
export const SLOT_STEP_MIN = 30;
/** findSlots looks at most this far ahead in one call. */
export const MAX_WINDOW_DAYS = 14;

export interface SlotResource {
  id: string;
  hours: WeeklyHours;
}

export interface BusyTime {
  resourceId: string;
  start: Date;
  end: Date;
}

export interface SlotRequest {
  timeZone: string;
  durationMin: number;
  bufferMin: number;
  minNoticeMin: number;
  from: Date;
  to: Date;
  now: Date;
  resources: readonly SlotResource[];
  busy: readonly BusyTime[];
  stepMin?: number;
}

export interface FreeSlot {
  start: Date;
  end: Date;
  resourceId: string;
}

/**
 * Every free start time in the window, earliest first. Each time gets one free resource: the one with
 * the fewest bookings in the window, so work spreads across staff. A slot must start at least
 * minNoticeMin from now, fit inside a working interval and the window, and keep bufferMin clear of
 * every booking on its resource.
 */
export function freeSlots(req: SlotRequest): FreeSlot[] {
  const step = req.stepMin ?? SLOT_STEP_MIN;
  const durationMs = req.durationMin * 60_000;
  const bufferMs = req.bufferMin * 60_000;
  const earliest = Math.max(req.from.getTime(), req.now.getTime() + req.minNoticeMin * 60_000);
  const latest = req.to.getTime();
  if (req.durationMin <= 0 || earliest + durationMs > latest) return [];

  const load = new Map<string, number>();
  for (const b of req.busy) load.set(b.resourceId, (load.get(b.resourceId) ?? 0) + 1);
  const resources = [...req.resources].sort((a, b) => (load.get(a.id) ?? 0) - (load.get(b.id) ?? 0));

  const clashes = (resourceId: string, start: number, end: number) =>
    req.busy.some((b) => b.resourceId === resourceId && b.start.getTime() - bufferMs < end && start < b.end.getTime() + bufferMs);

  const byStart = new Map<number, FreeSlot>();
  const lastDate = localParts(new Date(latest), req.timeZone).date;
  let date = localParts(new Date(earliest), req.timeZone).date;
  for (let day = 0; date <= lastDate && day <= MAX_WINDOW_DAYS; date = addDays(date, 1), day++) {
    const weekday = weekdayOf(date);
    for (const resource of resources) {
      for (const interval of resource.hours[weekday] ?? []) {
        const close = minutes(interval.end);
        for (let t = minutes(interval.start); t + req.durationMin <= close; t += step) {
          const start = zonedTime(date, t, req.timeZone).getTime();
          const end = start + durationMs;
          if (start < earliest || end > latest || byStart.has(start) || clashes(resource.id, start, end)) continue;
          byStart.set(start, { start: new Date(start), end: new Date(end), resourceId: resource.id });
        }
      }
    }
  }
  return [...byStart.values()].sort((a, b) => a.start.getTime() - b.start.getTime());
}

/**
 * Up to `max` slots spread across the window: the first, the last, and the ones nearest to evenly
 * spaced times in between, so a customer sees, say, a morning, a midday and an evening choice.
 */
export function spreadSlots(slots: readonly FreeSlot[], max = 3): FreeSlot[] {
  if (slots.length <= max) return [...slots];
  if (max <= 1) return slots.slice(0, Math.max(max, 0));
  const first = slots[0].start.getTime();
  const span = slots[slots.length - 1].start.getTime() - first;
  const picked = new Set<number>();
  for (let i = 0; i < max; i++) {
    const target = first + (span * i) / (max - 1);
    let best = -1;
    for (let j = 0; j < slots.length; j++) {
      if (picked.has(j)) continue;
      if (best === -1 || Math.abs(slots[j].start.getTime() - target) < Math.abs(slots[best].start.getTime() - target)) best = j;
    }
    picked.add(best);
  }
  return [...picked].sort((a, b) => a - b).map((i) => slots[i]);
}
