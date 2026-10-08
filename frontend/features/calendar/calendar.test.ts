import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { effectiveStatus, kindLabel, parseBookings, type Booking } from "./bookings";
import { buildColumns, fetchBookings, gridHours, minutesOnDate, NO_RESOURCE, placeBookings, rangeFor, summarize, visibleBookings, type CalendarResource, type ShownBooking } from "./data";
import { addDays, formatTime, formatWhen, isDateString, localParts, weekStart, zonedTime } from "./time";

const IST = "Asia/Kolkata";
const NY = "America/New_York";
const TENANT = "c0000000-0000-0000-0000-00000000000a";
const id = (n: number) => `b0000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const RES_A = "a0000000-0000-0000-0000-000000000001";
const RES_B = "a0000000-0000-0000-0000-000000000002";
const NOW = new Date("2026-10-12T05:00:00Z"); // Mon 12 Oct, 10:30 am in Chennai

const booking = (over: Partial<Booking> = {}): Booking => ({
  id: id(1),
  leadId: "d0000000-0000-0000-0000-000000000001",
  resourceId: RES_A,
  resourceName: "Asha",
  serviceName: "Consultation",
  kind: "slot",
  status: "confirmed",
  start: "2026-10-12T04:30:00.000Z", // 10:00 am IST
  end: "2026-10-12T05:30:00.000Z",
  holdExpiresAt: null,
  createdAt: "2026-10-10T10:00:00.000Z",
  rescheduledFrom: null,
  cancelReason: null,
  customerName: "Karthik R",
  phoneMasked: "+91 98xxx xxx21",
  ...over,
});
const shown = (b: Booking): ShownBooking => ({ ...b, shown: effectiveStatus(b, NOW) });

const resources: CalendarResource[] = [
  { id: RES_A, name: "Asha", type: "staff", active: true },
  { id: RES_B, name: "Ravi", type: "staff", active: true },
];

describe("time in the business's zone", () => {
  it("finds the instant of a local wall-clock time", () => {
    expect(zonedTime("2026-10-12", 10 * 60, IST).toISOString()).toBe("2026-10-12T04:30:00.000Z");
    expect(zonedTime("2026-10-12", 0, NY).toISOString()).toBe("2026-10-12T04:00:00.000Z");
  });

  it("handles daylight-saving changes", () => {
    // New York moves to summer time at 2 am on 8 March 2026: midnight is still EST, noon is EDT.
    expect(zonedTime("2026-03-08", 0, NY).toISOString()).toBe("2026-03-08T05:00:00.000Z");
    expect(zonedTime("2026-03-08", 12 * 60, NY).toISOString()).toBe("2026-03-08T16:00:00.000Z");
  });

  it("reads an instant's local date and time", () => {
    expect(localParts(new Date("2026-10-11T20:00:00Z"), IST)).toEqual({ date: "2026-10-12", minutes: 90 });
    expect(localParts(new Date("2026-10-11T20:00:00Z"), NY).date).toBe("2026-10-11");
  });

  it("shows times in the business's zone, not the viewer's", () => {
    expect(formatTime("2026-10-12T04:30:00Z", IST)).toBe("10:00 am");
    expect(formatTime("2026-10-12T04:30:00Z", NY)).toBe("12:30 am");
    expect(formatWhen("2026-10-11T20:00:00Z", IST)).toBe("Mon 12 Oct, 1:30 am");
  });

  it("works with calendar dates", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(weekStart("2026-10-18")).toBe("2026-10-12"); // a Sunday → its Monday
    expect(weekStart("2026-10-12")).toBe("2026-10-12");
    expect(isDateString("2026-02-30")).toBe(false);
    expect(isDateString("2026-10-12")).toBe(true);
  });
});

describe("ranges", () => {
  it("covers one local day, or Monday to Sunday", () => {
    const day = rangeFor("day", "2026-10-14", IST);
    expect(day.days).toEqual(["2026-10-14"]);
    expect([day.from.toISOString(), day.to.toISOString()]).toEqual(["2026-10-13T18:30:00.000Z", "2026-10-14T18:30:00.000Z"]);
    const week = rangeFor("week", "2026-10-14", IST);
    expect(week.days[0]).toBe("2026-10-12");
    expect(week.days).toHaveLength(7);
    expect(week.to.toISOString()).toBe("2026-10-18T18:30:00.000Z");
  });

  it("reads bookings overlapping the range, for the session's business only", async () => {
    const calls: [string, unknown[]][] = [];
    const builder: Record<string, unknown> = {};
    for (const name of ["select", "eq", "lt", "gt", "order", "limit"]) {
      builder[name] = (...args: unknown[]) => {
        calls.push([name, args]);
        return builder;
      };
    }
    builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve);
    const client = { from: (t: string) => (calls.push(["from", [t]]), builder) } as unknown as SupabaseClient;
    const range = rangeFor("day", "2026-10-12", IST);
    await fetchBookings(client, TENANT, range);
    expect(calls).toContainEqual(["from", ["bookings"]]);
    expect(calls).toContainEqual(["eq", ["tenant_id", TENANT]]);
    expect(calls).toContainEqual(["lt", ["start_at", range.to.toISOString()]]);
    expect(calls).toContainEqual(["gt", ["end_at", range.from.toISOString()]]);
  });
});

describe("booking rows", () => {
  const raw = {
    id: id(1),
    tenant_id: TENANT,
    lead_id: "d0000000-0000-0000-0000-000000000001",
    resource_id: null,
    service_id: null,
    kind: "callback",
    status: "confirmed",
    start_at: "2026-10-12T09:30:00+00:00",
    end_at: "2026-10-12T09:45:00+00:00",
    hold_expires_at: null,
    details: { cancel_reason: "replaced", rescheduled_from: "b0000000-0000-0000-0000-000000000009" },
    created_at: "2026-10-10T10:00:00+00:00",
    services: null,
    resources: null,
    leads: { contacts: { name: null, phone: "+919812345621" } },
  };

  it("parses rows and masks the customer's number", () => {
    const [b] = parseBookings([raw], TENANT);
    expect(b).toMatchObject({ resourceId: null, kind: "callback", start: "2026-10-12T09:30:00.000Z", customerName: null, phoneMasked: "+91 98xxx xxx21", cancelReason: "replaced" });
    expect(JSON.stringify(b)).not.toContain("9812345621");
  });

  it("drops rows of another business and refuses rows of the wrong shape", () => {
    expect(parseBookings([{ ...raw, tenant_id: "c0000000-0000-0000-0000-00000000000b" }], TENANT)).toEqual([]);
    expect(() => parseBookings([{ id: "x" }], TENANT)).toThrow(/unexpected shape/);
  });

  it("labels kinds without industry words", () => {
    expect(kindLabel("callback")).toBe("Callback");
    expect(kindLabel("something_new")).toBe("Booking");
  });
});

describe("what the calendar shows", () => {
  it("treats a hold past its expiry as expired, never as an appointment", () => {
    expect(effectiveStatus({ status: "held", holdExpiresAt: "2026-10-12T04:59:00Z" }, NOW)).toBe("expired");
    expect(effectiveStatus({ status: "held", holdExpiresAt: "2026-10-12T05:09:00Z" }, NOW)).toBe("held");
    expect(effectiveStatus({ status: "something", holdExpiresAt: null }, NOW)).toBe("unknown");
  });

  it("hides cancelled, moved and expired bookings unless asked", () => {
    const list = [
      booking({ id: id(1) }),
      booking({ id: id(2), status: "held", holdExpiresAt: "2026-10-12T05:05:00Z" }),
      booking({ id: id(3), status: "held", holdExpiresAt: "2026-10-12T04:00:00Z" }),
      booking({ id: id(4), status: "cancelled" }),
      booking({ id: id(5), status: "expired" }),
      booking({ id: id(6), status: "rescheduled" }),
      booking({ id: id(7), status: "completed" }),
      booking({ id: id(8), status: "no_show" }),
    ];
    const visible = visibleBookings(list, { now: NOW, showInactive: false, resource: "all" });
    expect(visible.map((b) => b.id)).toEqual([id(1), id(2), id(7), id(8)]);
    expect(summarize(visible)).toEqual({ total: 4, held: 1 });
    expect(visibleBookings(list, { now: NOW, showInactive: true, resource: "all" })).toHaveLength(8);
  });

  it("filters by staff member, or by bookings with no one assigned", () => {
    const list = [booking({ id: id(1) }), booking({ id: id(2), resourceId: RES_B }), booking({ id: id(3), resourceId: null, kind: "callback" })];
    expect(visibleBookings(list, { now: NOW, showInactive: false, resource: RES_B }).map((b) => b.id)).toEqual([id(2)]);
    expect(visibleBookings(list, { now: NOW, showInactive: false, resource: NO_RESOURCE }).map((b) => b.id)).toEqual([id(3)]);
  });

  it("gives each staff member a column and keeps callbacks without staff out of them", () => {
    const list = [booking({ id: id(1) }), booking({ id: id(2), resourceId: RES_B }), booking({ id: id(3), resourceId: null, kind: "callback" })].map(shown);
    const range = rangeFor("day", "2026-10-12", IST);
    const cols = buildColumns({ view: "day", range, resources, bookings: list, resource: "all", timeZone: IST });
    expect(cols.map((c) => [c.title, c.bookings.map((b) => b.id)])).toEqual([
      ["Asha", [id(1)]],
      ["Ravi", [id(2)]],
      ["No staff assigned", [id(3)]],
    ]);
    const one = buildColumns({ view: "day", range, resources, bookings: list.filter((b) => b.resourceId === RES_B), resource: RES_B, timeZone: IST });
    expect(one.map((c) => c.title)).toEqual(["Ravi"]);
  });

  it("shows an inactive resource only on days it still has bookings", () => {
    const off = [...resources, { id: "a0000000-0000-0000-0000-000000000003", name: "Old room", type: "room", active: false }];
    const range = rangeFor("day", "2026-10-12", IST);
    expect(buildColumns({ view: "day", range, resources: off, bookings: [], resource: "all", timeZone: IST }).map((c) => c.title)).toEqual(["Asha", "Ravi"]);
    const withBooking = [shown(booking({ resourceId: off[2].id }))];
    const cols = buildColumns({ view: "day", range, resources: off, bookings: withBooking, resource: "all", timeZone: IST });
    expect(cols.map((c) => [c.title, c.subtitle])).toEqual([
      ["Asha", "staff"],
      ["Ravi", "staff"],
      ["Old room", "room · off"],
    ]);
  });

  it("puts each booking on its local day in week view", () => {
    // 11 pm Monday in Chennai is still Monday there, though it's Monday 5:30 pm UTC.
    const late = shown(booking({ id: id(1), start: "2026-10-12T17:30:00Z", end: "2026-10-12T18:00:00Z" }));
    const range = rangeFor("week", "2026-10-12", IST);
    const cols = buildColumns({ view: "week", range, resources, bookings: [late], resource: "all", timeZone: IST });
    expect(cols).toHaveLength(7);
    expect(cols[0].bookings.map((b) => b.id)).toEqual([id(1)]);
    expect(cols.slice(1).every((c) => c.bookings.length === 0)).toBe(true);
  });
});

describe("layout", () => {
  it("places a booking at its local time with its real length", () => {
    expect(minutesOnDate(booking(), "2026-10-12", IST)).toEqual({ start: 600, end: 660 });
    expect(minutesOnDate(booking(), "2026-10-13", IST)).toBeNull();
  });

  it("clips a booking that runs past midnight to each day", () => {
    const overnight = booking({ start: "2026-10-12T16:30:00Z", end: "2026-10-12T20:30:00Z" }); // 10 pm – 2 am IST
    expect(minutesOnDate(overnight, "2026-10-12", IST)).toEqual({ start: 1320, end: 1440 });
    expect(minutesOnDate(overnight, "2026-10-13", IST)).toEqual({ start: 0, end: 120 });
  });

  it("widens the hours to fit early and late bookings", () => {
    expect(gridHours([], ["2026-10-12"], IST)).toEqual({ start: 8, end: 20 });
    const early = booking({ start: "2026-10-12T01:00:00Z", end: "2026-10-12T02:00:00Z" }); // 6:30 – 7:30 am
    const late = booking({ start: "2026-10-12T16:00:00Z", end: "2026-10-12T16:45:00Z" }); // 9:30 – 10:15 pm
    expect(gridHours([early, late], ["2026-10-12"], IST)).toEqual({ start: 6, end: 23 });
  });

  it("sets overlapping bookings side by side and leaves the rest full width", () => {
    const list = [
      booking({ id: id(1), start: "2026-10-12T04:30:00Z", end: "2026-10-12T05:30:00Z" }), // 10–11
      booking({ id: id(2), start: "2026-10-12T05:00:00Z", end: "2026-10-12T06:00:00Z" }), // 10:30–11:30
      booking({ id: id(3), start: "2026-10-12T05:30:00Z", end: "2026-10-12T06:30:00Z" }), // 11–12
      booking({ id: id(4), start: "2026-10-12T08:30:00Z", end: "2026-10-12T09:30:00Z" }), // 2–3 pm
    ].map(shown);
    const placed = placeBookings(list, "2026-10-12", IST);
    const byId = Object.fromEntries(placed.map((p) => [p.booking.id, [p.lane, p.lanes]]));
    expect(byId[id(1)]).toEqual([0, 2]);
    expect(byId[id(2)]).toEqual([1, 2]);
    expect(byId[id(3)]).toEqual([0, 2]);
    expect(byId[id(4)]).toEqual([0, 1]);
  });
});
