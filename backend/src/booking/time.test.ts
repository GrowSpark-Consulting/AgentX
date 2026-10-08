import { afterEach, describe, expect, it } from "vitest";
import { addDays, localParts, localWindow, slotLabel, weekdayOf, zonedTime } from "./time";

const KOLKATA = "Asia/Kolkata";
const NEW_YORK = "America/New_York";
// 8 Oct 2026, 20:00 UTC is already 9 Oct (01:30) in India: the UTC date and the business's date differ.
const LATE_EVENING_UTC = new Date("2026-10-08T20:00:00Z");

const originalTz = process.env.TZ;
afterEach(() => {
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
});

describe("localParts and zonedTime", () => {
  it("read an instant in the business's time zone", () => {
    expect(localParts(LATE_EVENING_UTC, KOLKATA)).toEqual({ date: "2026-10-09", weekday: "fri", minuteOfDay: 90 });
    expect(localParts(LATE_EVENING_UTC, NEW_YORK)).toEqual({ date: "2026-10-08", weekday: "thu", minuteOfDay: 16 * 60 });
  });

  it("turn a local date and time into UTC", () => {
    expect(zonedTime("2026-10-09", 17 * 60, KOLKATA).toISOString()).toBe("2026-10-09T11:30:00.000Z");
    expect(zonedTime("2026-07-01", 9 * 60, NEW_YORK).toISOString()).toBe("2026-07-01T13:00:00.000Z");
    expect(zonedTime("2026-10-09", 24 * 60, KOLKATA).toISOString()).toBe("2026-10-09T18:30:00.000Z");
  });

  it("resolve daylight-saving changes: a repeated hour gives the earlier instant, a skipped one lands next to the gap", () => {
    expect(zonedTime("2026-11-01", 90, NEW_YORK).toISOString()).toBe("2026-11-01T05:30:00.000Z");
    const skipped = zonedTime("2026-03-08", 150, NEW_YORK).getTime();
    expect(skipped).toBeGreaterThanOrEqual(Date.parse("2026-03-08T06:00:00Z"));
    expect(skipped).toBeLessThanOrEqual(Date.parse("2026-03-08T08:00:00Z"));
  });

  it("know calendar dates", () => {
    expect(weekdayOf("2026-10-09")).toBe("fri");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(() => zonedTime("2026-02-30", 0, KOLKATA)).toThrow(RangeError);
  });
});

describe("localWindow", () => {
  it('turns "tomorrow evening" into the business\'s tomorrow, 5 to 9 pm, in UTC', () => {
    expect(localWindow(KOLKATA, { day: "tomorrow", part: "evening" }, LATE_EVENING_UTC)).toEqual({
      date: "2026-10-10",
      from: new Date("2026-10-10T11:30:00Z"),
      to: new Date("2026-10-10T15:30:00Z"),
    });
  });

  it("gives the same answer whatever time zone the server's clock is in", () => {
    const expected = localWindow(KOLKATA, { day: "tomorrow", part: "evening" }, LATE_EVENING_UTC);
    for (const serverZone of ["Pacific/Kiritimati", "America/Los_Angeles", "UTC"]) {
      process.env.TZ = serverZone;
      expect(localWindow(KOLKATA, { day: "tomorrow", part: "evening" }, LATE_EVENING_UTC), serverZone).toEqual(expected);
    }
    process.env.TZ = "Pacific/Kiritimati";
    expect(new Date(LATE_EVENING_UTC).getDate()).toBe(9); // the server's own date really is different here
  });

  it("covers today, a whole day and an explicit date", () => {
    expect(localWindow(KOLKATA, { day: "today" }, LATE_EVENING_UTC)).toEqual({
      date: "2026-10-09",
      from: new Date("2026-10-08T18:30:00Z"),
      to: new Date("2026-10-09T18:30:00Z"),
    });
    expect(localWindow(KOLKATA, { day: "2026-10-12", part: "morning" }, LATE_EVENING_UTC).from.toISOString()).toBe(
      "2026-10-12T03:30:00.000Z",
    );
    expect(() => localWindow(KOLKATA, { day: "next friday" }, LATE_EVENING_UTC)).toThrow(RangeError);
  });
});

describe("slotLabel", () => {
  it("reads in the business's time zone", () => {
    expect(slotLabel(new Date("2026-10-09T11:30:00Z"), KOLKATA)).toBe("Fri 9 Oct, 5:00 pm");
    expect(slotLabel(new Date("2026-10-08T18:30:00Z"), KOLKATA)).toBe("Fri 9 Oct, 12:00 am");
    expect(slotLabel(new Date("2026-10-09T07:00:00Z"), KOLKATA)).toBe("Fri 9 Oct, 12:30 pm");
  });
});
