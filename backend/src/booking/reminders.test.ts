import { describe, expect, it } from "vitest";
import { Interactive } from "../notify/interactive";
import { fakeSupabase } from "../test-support/fake-supabase";
import { loadReminderBooking, parseBookingButton, reminderMessage, reminderOffsets, type ReminderBooking } from "./reminders";

const TENANT = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const BOOKING = "9b2f0a4e-1c3d-4e5f-8a6b-7c8d9e0f1a2b";
const CONTACT = "6fa459ea-ee8a-4ca4-894e-db77e160355e";
const CONVERSATION = "3f2a1b4c-5d6e-4f70-8a91-b2c3d4e5f601";

describe("reminderOffsets", () => {
  it("uses 24 hours and 2 hours when the business set nothing", async () => {
    const db = fakeSupabase({ tenant_features: { data: [], error: null } });
    await expect(reminderOffsets(TENANT, db.client)).resolves.toEqual({ reminder_24h: 1440, reminder_2h: 120 });
    expect(db.calls).toContainEqual({ table: "tenant_features", method: "eq", args: ["tenant_id", TENANT] });
    expect(db.calls).toContainEqual({ table: "tenant_features", method: "in", args: ["feature_key", ["reminder_24h", "reminder_2h"]] });
  });

  it("uses the business's offsets, ignoring any that are not whole minutes within a week", async () => {
    const rows = (s24: unknown, s2: unknown) => ({
      tenant_features: { data: [{ feature_key: "reminder_24h", settings: s24 }, { feature_key: "reminder_2h", settings: s2 }], error: null },
    });
    await expect(reminderOffsets(TENANT, fakeSupabase(rows({ offset_minutes: 3 }, { offset_minutes: 1 })).client)).resolves.toEqual({ reminder_24h: 3, reminder_2h: 1 });
    for (const bad of [{ offset_minutes: 0 }, { offset_minutes: -5 }, { offset_minutes: 2.5 }, { offset_minutes: "60" }, { offset_minutes: 10081 }, {}, null]) {
      await expect(reminderOffsets(TENANT, fakeSupabase(rows(bad, bad)).client)).resolves.toEqual({ reminder_24h: 1440, reminder_2h: 120 });
    }
  });
});

describe("loadReminderBooking", () => {
  const tables = (over: Record<string, unknown> = {}) => ({
    bookings: {
      data: [{ id: BOOKING, status: "confirmed", start_at: "2026-10-10T11:30:00+00:00", kind: "site_visit", leads: { contact_id: CONTACT }, services: { name: "Site visit: Skyline Towers" }, ...over }],
      error: null,
    },
    tenants: { data: [{ name: "Skyline Homes", timezone: "Asia/Kolkata" }], error: null },
    conversations: { data: [{ id: CONVERSATION }], error: null },
  });

  it("reads the booking, the business and the customer's open chat, all for this business", async () => {
    const db = fakeSupabase(tables());
    await expect(loadReminderBooking(TENANT, BOOKING, db.client)).resolves.toEqual({
      bookingId: BOOKING,
      status: "confirmed",
      start: "2026-10-10T11:30:00.000Z",
      what: "Site visit: Skyline Towers",
      business: "Skyline Homes",
      timeZone: "Asia/Kolkata",
      conversationId: CONVERSATION,
    });
    expect(db.calls).toContainEqual({ table: "bookings", method: "eq", args: ["tenant_id", TENANT] });
    expect(db.calls).toContainEqual({ table: "tenants", method: "eq", args: ["id", TENANT] });
    expect(db.calls).toContainEqual({ table: "conversations", method: "eq", args: ["tenant_id", TENANT] });
    expect(db.calls).toContainEqual({ table: "conversations", method: "eq", args: ["contact_id", CONTACT] });
    expect(db.calls).toContainEqual({ table: "conversations", method: "eq", args: ["status", "open"] });
  });

  it("names the kind of booking when there is no service, and has no chat when there is no lead", async () => {
    const booking = await loadReminderBooking(TENANT, BOOKING, fakeSupabase(tables({ kind: "callback", services: null, leads: null })).client);
    expect(booking).toMatchObject({ what: "call", conversationId: null });
  });

  it("is null for a booking this business doesn't have", async () => {
    await expect(loadReminderBooking(TENANT, BOOKING, fakeSupabase({ ...tables(), bookings: { data: [], error: null } }).client)).resolves.toBeNull();
  });
});

describe("reminderMessage", () => {
  const booking: ReminderBooking = {
    bookingId: BOOKING,
    status: "confirmed",
    start: "2026-10-10T11:30:00.000Z",
    what: "site visit",
    business: "Skyline Homes",
    timeZone: "Asia/Kolkata",
    conversationId: CONVERSATION,
  };

  it("gives the local time, with Confirm, Reschedule and Cancel buttons that name the booking", () => {
    const message = reminderMessage(booking);
    expect(message.interactive).toEqual({
      type: "buttons",
      body: "Reminder: your site visit with Skyline Homes is on Sat 10 Oct, 5:00 pm.",
      buttons: [
        { id: `booking:${BOOKING}:confirm`, title: "Confirm" },
        { id: `booking:${BOOKING}:reschedule`, title: "Reschedule" },
        { id: `booking:${BOOKING}:cancel`, title: "Cancel" },
      ],
    });
    expect(Interactive.safeParse(message.interactive).success).toBe(true);
    expect(message.templateParams).toEqual(["site visit", "Skyline Homes", "Sat 10 Oct, 5:00 pm"]);
  });

  it("keeps the template's variables on one line and short", () => {
    const params = reminderMessage({ ...booking, what: `A\tvery   long\nservice ${"x".repeat(60)}`, business: "Skyline\n\nHomes" }).templateParams;
    for (const param of params) expect(param).not.toMatch(/[\t\n]| {2,}/);
    expect(params[0].length).toBeLessThanOrEqual(40);
    expect(params[1]).toBe("Skyline Homes");
  });
});

describe("parseBookingButton", () => {
  it("reads a reminder button's tap", () => {
    expect(parseBookingButton(`booking:${BOOKING}:reschedule`)).toEqual({ bookingId: BOOKING, action: "reschedule" });
    expect(parseBookingButton(`booking:${BOOKING.toUpperCase()}:CANCEL`)).toEqual({ bookingId: BOOKING, action: "cancel" });
  });

  it.each(["slot:1", `booking:${BOOKING}:delete`, "booking:not-a-booking-id-at-all-00000000000:confirm", `booking:${BOOKING}:confirm:extra`, ""])("ignores %j", (id) => {
    expect(parseBookingButton(id)).toBeNull();
  });
});
