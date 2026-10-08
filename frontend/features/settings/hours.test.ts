import { describe, expect, it } from "vitest";
import {
  defaultHoursDraft,
  formatServiceArea,
  hasOwnHours,
  normalizeTime,
  parseHours,
  parsePincodes,
  parseServiceArea,
  summarizeHours,
  toHoursDraft,
  validateHours,
  type HoursDraft,
} from "./hours";

const closedWeek = (): HoursDraft => ({ mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] });

describe("reading stored hours (the slot engine's WeeklyHours)", () => {
  it("reads the contract's shape, split shifts included", () => {
    const hours = { mon: [{ start: "10:00", end: "13:00" }, { start: "14:00", end: "18:00" }], sun: [] };
    expect(parseHours(hours)).toEqual(hours);
  });

  it("treats empty and missing hours as 'no days set'", () => {
    expect(parseHours({})).toEqual({});
    expect(parseHours(null)).toEqual({});
    expect(hasOwnHours({})).toBe(false);
    expect(hasOwnHours({ sun: [] })).toBe(true);
  });

  it("refuses values the slot engine would ignore", () => {
    expect(parseHours({ mon: [{ start: "18:00", end: "10:00" }] })).toBeNull();
    expect(parseHours({ mon: [{ start: "9am", end: "5pm" }] })).toBeNull();
    expect(parseHours({ monday: [] })).toBeNull();
    expect(parseHours("open")).toBeNull();
  });
});

describe("describing hours", () => {
  it("groups consecutive days with the same hours and leaves closed days out", () => {
    const hours = {
      mon: [{ start: "10:00", end: "18:00" }],
      tue: [{ start: "10:00", end: "18:00" }],
      wed: [{ start: "10:00", end: "18:00" }],
      thu: [],
      fri: [{ start: "10:00", end: "18:00" }],
      sat: [{ start: "10:00", end: "18:00" }],
      sun: [{ start: "10:00", end: "13:00" }],
    };
    expect(summarizeHours(hours)).toBe("Mon–Wed 10:00–18:00 · Fri–Sat 10:00–18:00 · Sun 10:00–13:00");
  });

  it("lists split shifts in time order", () => {
    expect(summarizeHours({ mon: [{ start: "14:00", end: "18:00" }, { start: "10:00", end: "13:00" }] })).toBe("Mon 10:00–13:00, 14:00–18:00");
  });

  it("says when nothing is open", () => {
    expect(summarizeHours({})).toBe("Closed every day");
  });
});

describe("validating the hours form", () => {
  it("normalises what people type", () => {
    expect(normalizeTime("9:30")).toBe("09:30");
    expect(normalizeTime("9")).toBe("09:00");
    expect(normalizeTime("1830")).toBe("18:30");
    expect(normalizeTime("24:00")).toBe("24:00");
    expect(normalizeTime("24:30")).toBeNull();
    expect(normalizeTime("7pm")).toBeNull();
    expect(normalizeTime("")).toBeNull();
  });

  it("returns all seven days, closed ones as [], so a closed week isn't read as 'business hours'", () => {
    const draft = { ...closedWeek(), mon: [{ start: "9:30", end: "18:00" }] };
    const result = validateHours(draft);
    expect(result).toEqual({ ok: true, hours: { ...closedWeek(), mon: [{ start: "09:30", end: "18:00" }] } });
    expect(result.ok && hasOwnHours(result.hours)).toBe(true);
  });

  it("allows open until midnight", () => {
    expect(validateHours({ ...closedWeek(), sat: [{ start: "18:00", end: "24:00" }] }).ok).toBe(true);
  });

  it("needs closing after opening", () => {
    const result = validateHours({ ...closedWeek(), tue: [{ start: "18:00", end: "10:00" }] });
    expect(!result.ok && result.errors["tue.0.end"]).toBe("Closing time must be after opening time");
    const same = validateHours({ ...closedWeek(), tue: [{ start: "10:00", end: "10:00" }] });
    expect(!same.ok && same.errors["tue.0.end"]).toBe("Closing time must be after opening time");
  });

  it("names the box that isn't a time", () => {
    const result = validateHours({ ...closedWeek(), wed: [{ start: "ten", end: "" }] });
    expect(!result.ok && result.errors).toMatchObject({ "wed.0.start": "Enter a time like 09:30", "wed.0.end": "Enter a time like 18:00" });
    const late = validateHours({ ...closedWeek(), wed: [{ start: "24:00", end: "24:00" }] });
    expect(!late.ok && late.errors["wed.0.start"]).toBe("A day can't open at 24:00");
  });

  it("refuses overlapping shifts and sorts the ones that don't overlap", () => {
    const overlap = validateHours({ ...closedWeek(), thu: [{ start: "10:00", end: "14:00" }, { start: "13:00", end: "18:00" }] });
    expect(!overlap.ok && overlap.errors.thu).toBe("Thursday's hours overlap");
    const split = validateHours({ ...closedWeek(), thu: [{ start: "14:00", end: "18:00" }, { start: "10:00", end: "14:00" }] });
    expect(split.ok && split.hours.thu).toEqual([{ start: "10:00", end: "14:00" }, { start: "14:00", end: "18:00" }]);
  });

  it("round-trips stored hours through the form", () => {
    const stored = { mon: [{ start: "10:00", end: "18:00" }] };
    const result = validateHours(toHoursDraft(stored));
    expect(result.ok && result.hours.mon).toEqual(stored.mon);
    expect(result.ok && result.hours.sun).toEqual([]);
  });

  it("offers a sensible first week", () => {
    const result = validateHours(defaultHoursDraft());
    expect(result.ok && summarizeHours(result.hours)).toBe("Mon–Sat 10:00–18:00");
  });
});

describe("service-area pincodes", () => {
  it("accepts commas, spaces and new lines, and drops repeats", () => {
    expect(parsePincodes("600041, 600096\n600041 600097")).toEqual({ ok: true, pincodes: ["600041", "600096", "600097"] });
  });

  it("reads blank as every pincode", () => {
    expect(parsePincodes("  ")).toEqual({ ok: true, pincodes: null });
  });

  it("names what isn't a 6-digit pincode", () => {
    expect(parsePincodes("600041, 60004")).toEqual({ ok: false, error: "60004 isn't a 6-digit pincode" });
    expect(parsePincodes("012345 abcdef")).toEqual({ ok: false, error: "012345, abcdef aren't 6-digit pincodes" });
    expect(parsePincodes("1 2 3 4 5")).toEqual({ ok: false, error: "1, 2, 3 and 2 more aren't 6-digit pincodes" });
  });

  it("reads the stored area, null or empty meaning every pincode", () => {
    expect(parseServiceArea({ pincodes: ["600041"] })).toEqual(["600041"]);
    expect(parseServiceArea({ pincodes: [] })).toBeNull();
    expect(parseServiceArea(null)).toBeNull();
    expect(parseServiceArea("600041")).toBeNull();
  });

  it("describes the area", () => {
    expect(formatServiceArea(null)).toBe("Any pincode");
    expect(formatServiceArea(["600041", "600096"])).toBe("600041, 600096");
    expect(formatServiceArea(["600041", "600096", "600097", "600119"])).toBe("600041, 600096 and 2 more");
  });
});
