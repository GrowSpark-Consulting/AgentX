import { describe, expect, it } from "vitest";
import { freeSlots, spreadSlots, WeeklyHours, type BusyTime, type FreeSlot, type SlotRequest } from "./slots";
import { slotLabel, zonedTime } from "./time";

const TZ = "Asia/Kolkata";
const at = (date: string, hhmm: string) => zonedTime(date, Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)), TZ);
const times = (slots: FreeSlot[]) => slots.map((s) => slotLabel(s.start, TZ));

const WEEKDAY_HOURS: WeeklyHours = {
  thu: [{ start: "10:00", end: "18:00" }],
  fri: [{ start: "10:00", end: "18:00" }],
};
const FRIDAY = "2026-10-09";

function request(over: Partial<SlotRequest> = {}): SlotRequest {
  return {
    timeZone: TZ,
    durationMin: 60,
    bufferMin: 0,
    minNoticeMin: 60,
    from: at(FRIDAY, "00:00"),
    to: at("2026-10-10", "00:00"),
    now: at("2026-10-08", "09:00"),
    resources: [{ id: "a", hours: WEEKDAY_HOURS }],
    busy: [],
    ...over,
  };
}
const busy = (resourceId: string, from: string, to: string, date = FRIDAY): BusyTime => ({ resourceId, start: at(date, from), end: at(date, to) });

describe("freeSlots", () => {
  it("offers every 30 minutes inside working hours, ending by closing time", () => {
    const slots = freeSlots(request());
    expect(slots).toHaveLength(15);
    expect(times(slots).at(0)).toBe("Fri 9 Oct, 10:00 am");
    expect(times(slots).at(-1)).toBe("Fri 9 Oct, 5:00 pm");
    expect(slots[0].end.getTime() - slots[0].start.getTime()).toBe(60 * 60_000);
  });

  it("keeps the minimum notice from now, on the 30-minute grid", () => {
    const sameDay = request({ from: at("2026-10-08", "00:00"), to: at("2026-10-09", "00:00"), now: at("2026-10-08", "10:07") });
    expect(times(freeSlots(sameDay)).at(0)).toBe("Thu 8 Oct, 11:30 am");
    expect(times(freeSlots({ ...sameDay, minNoticeMin: 240 })).at(0)).toBe("Thu 8 Oct, 2:30 pm");
  });

  it("keeps the buffer clear on both sides of an existing booking", () => {
    const slots = times(freeSlots(request({ bufferMin: 15, busy: [busy("a", "12:00", "13:00")] })));
    expect(slots).toContain("Fri 9 Oct, 10:30 am"); // ends 11:30, before 11:45
    for (const blocked of ["11:00 am", "11:30 am", "12:00 pm", "12:30 pm", "1:00 pm"]) expect(slots).not.toContain(`Fri 9 Oct, ${blocked}`);
    expect(slots).toContain("Fri 9 Oct, 1:30 pm"); // starts after 13:15
  });

  it("ignores bookings on other resources", () => {
    expect(freeSlots(request({ busy: [busy("someone-else", "10:00", "18:00")] }))).toHaveLength(15);
  });

  it("respects split shifts and closed days", () => {
    const hours: WeeklyHours = { fri: [{ start: "10:00", end: "13:00" }, { start: "14:00", end: "16:00" }] };
    expect(times(freeSlots(request({ resources: [{ id: "a", hours }] })))).toEqual([
      "Fri 9 Oct, 10:00 am",
      "Fri 9 Oct, 10:30 am",
      "Fri 9 Oct, 11:00 am",
      "Fri 9 Oct, 11:30 am",
      "Fri 9 Oct, 12:00 pm",
      "Fri 9 Oct, 2:00 pm",
      "Fri 9 Oct, 2:30 pm",
      "Fri 9 Oct, 3:00 pm",
    ]);
    const saturday = request({ from: at("2026-10-10", "00:00"), to: at("2026-10-11", "00:00") });
    expect(freeSlots(saturday)).toEqual([]);
  });

  it("stays inside the window and fits the service length", () => {
    expect(times(freeSlots(request({ from: at(FRIDAY, "17:00"), to: at(FRIDAY, "21:00") })))).toEqual(["Fri 9 Oct, 5:00 pm"]);
    expect(freeSlots(request({ durationMin: 9 * 60 }))).toEqual([]);
  });

  it("gives each time to the least busy free resource, and uses another when one is booked", () => {
    const slots = freeSlots(
      request({
        resources: [
          { id: "a", hours: WEEKDAY_HOURS },
          { id: "b", hours: WEEKDAY_HOURS },
        ],
        busy: [busy("a", "10:00", "12:00"), busy("a", "15:00", "16:00")],
      }),
    );
    expect(slots).toHaveLength(15);
    expect(new Set(slots.map((s) => s.resourceId))).toEqual(new Set(["b"]));
    const onlyA = freeSlots(request({ resources: [{ id: "a", hours: WEEKDAY_HOURS }], busy: [busy("a", "10:00", "12:00")] }));
    expect(times(onlyA).at(0)).toBe("Fri 9 Oct, 12:00 pm");
  });

  it("covers several days in one window", () => {
    const twoDays = request({ from: at("2026-10-08", "00:00"), to: at("2026-10-10", "00:00"), now: at("2026-10-08", "16:00") });
    expect(times(freeSlots(twoDays)).slice(0, 2)).toEqual(["Thu 8 Oct, 5:00 pm", "Fri 9 Oct, 10:00 am"]);
  });
});

describe("spreadSlots", () => {
  it("picks the first, the middle and the last of the day", () => {
    expect(times(spreadSlots(freeSlots(request())))).toEqual(["Fri 9 Oct, 10:00 am", "Fri 9 Oct, 1:30 pm", "Fri 9 Oct, 5:00 pm"]);
  });

  it("returns what there is when there are three or fewer", () => {
    const two = freeSlots(request({ from: at(FRIDAY, "16:00"), to: at(FRIDAY, "18:00") }));
    expect(times(spreadSlots(two))).toEqual(["Fri 9 Oct, 4:00 pm", "Fri 9 Oct, 4:30 pm", "Fri 9 Oct, 5:00 pm"].slice(0, two.length));
    expect(spreadSlots([])).toEqual([]);
    expect(times(spreadSlots(freeSlots(request()), 1))).toEqual(["Fri 9 Oct, 10:00 am"]);
  });
});

describe("WeeklyHours", () => {
  it("accepts the seeded shape and refuses broken intervals", () => {
    expect(WeeklyHours.safeParse({ mon: [{ start: "09:30", end: "19:00" }], sun: [] }).success).toBe(true);
    expect(WeeklyHours.safeParse({ mon: [{ start: "19:00", end: "09:30" }] }).success).toBe(false);
    expect(WeeklyHours.safeParse({ mon: [{ start: "9:30", end: "19:00" }] }).success).toBe(false);
    expect(WeeklyHours.safeParse({ funday: [] }).success).toBe(false);
  });
});
