import { describe, expect, it, vi } from "vitest";
import { Interactive } from "../notify/interactive";
import { fakeSupabase } from "../test-support/fake-supabase";
import { DEFAULT_FEEDBACK_DELAY_MINUTES, feedbackDelay, hasAlertNumber, parseRatingButton, ratingMessage, recordVisitRating, reviewLink, reviewMessage } from "./post-visit";
import type { ReminderBooking } from "./reminders";

const TENANT = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const BOOKING = "9b2f0a4e-1c3d-4e5f-8a6b-7c8d9e0f1a2b";
const LEAD = "5c6d7e8f-9a0b-4c1d-8e2f-3a4b5c6d7e8f";
const STAFF = "16fd2706-8baf-433b-82eb-8c7fada847da";

const booking: ReminderBooking = {
  bookingId: BOOKING,
  status: "confirmed",
  start: "2026-10-10T11:30:00.000Z",
  end: "2026-10-10T12:30:00.000Z",
  leadId: LEAD,
  staffUserId: STAFF,
  what: "site visit",
  business: "Skyline Homes",
  timeZone: "Asia/Kolkata",
  conversationId: "3f2a1b4c-5d6e-4f70-8a91-b2c3d4e5f601",
};
const settings = (value: unknown) => fakeSupabase({ tenant_features: { data: value === undefined ? [] : [{ settings: value }], error: null } });

describe("feedbackDelay", () => {
  it("is 2 hours after the end unless the business set minutes, read for this business's feedback setting", async () => {
    const db = settings(undefined);
    await expect(feedbackDelay(TENANT, db.client)).resolves.toBe(DEFAULT_FEEDBACK_DELAY_MINUTES);
    expect(db.calls).toContainEqual({ table: "tenant_features", method: "eq", args: ["feature_key", "feedback_request"] });
    await expect(feedbackDelay(TENANT, settings({ offset_minutes: 0 }).client)).resolves.toBe(0);
    await expect(feedbackDelay(TENANT, settings({ offset_minutes: 5 }).client)).resolves.toBe(5);
    for (const bad of [{ offset_minutes: -1 }, { offset_minutes: 10081 }, { offset_minutes: "5" }, {}]) {
      await expect(feedbackDelay(TENANT, settings(bad).client)).resolves.toBe(DEFAULT_FEEDBACK_DELAY_MINUTES);
    }
  });
});

describe("ratingMessage", () => {
  it("is a list of five ratings that name the booking, and the feedback template's variables", () => {
    const message = ratingMessage(booking);
    expect(Interactive.safeParse(message.interactive).success).toBe(true);
    expect(message.interactive).toMatchObject({ type: "list", body: "How was your site visit with Skyline Homes? Tap a rating, it takes a second.", button: "Rate it" });
    const rows = message.interactive.type === "list" ? message.interactive.sections[0].rows : [];
    expect(rows.map((r) => r.id)).toEqual([5, 4, 3, 2, 1].map((n) => `rating:${BOOKING}:${n}`));
    expect(rows[0]).toEqual({ id: `rating:${BOOKING}:5`, title: "★★★★★ 5/5", description: "Excellent" });
    expect(rows[4]).toEqual({ id: `rating:${BOOKING}:1`, title: "★ 1/5", description: "Very poor" });
    expect(message.templateParams).toEqual(["site visit", "Skyline Homes"]);
  });
});

describe("parseRatingButton", () => {
  it("reads a rating tap", () => {
    expect(parseRatingButton(`rating:${BOOKING}:4`)).toEqual({ bookingId: BOOKING, rating: 4 });
  });

  it.each([`rating:${BOOKING}:0`, `rating:${BOOKING}:6`, `booking:${BOOKING}:confirm`, "rating:not-a-booking-id-at-all-0000000000:5", ""])("ignores %j", (id) => {
    expect(parseRatingButton(id)).toBeNull();
  });
});

describe("recordVisitRating", () => {
  it("saves the rating on the booking's lead and tells the post-visit job, once per booking", async () => {
    const db = fakeSupabase({ bookings: { data: [{ lead_id: LEAD }], error: null }, leads: { data: null, error: null } });
    const send = vi.fn(async () => ({}));
    await expect(recordVisitRating(TENANT, BOOKING, 5, { db: db.client, send })).resolves.toBe(true);
    expect(db.calls).toContainEqual({ table: "bookings", method: "eq", args: ["tenant_id", TENANT] });
    expect(db.calls).toContainEqual({ table: "leads", method: "update", args: [{ feedback_rating: 5 }] });
    expect(db.calls).toContainEqual({ table: "leads", method: "eq", args: ["tenant_id", TENANT] });
    expect(db.calls).toContainEqual({ table: "leads", method: "eq", args: ["id", LEAD] });
    expect(send).toHaveBeenCalledWith({ id: `booking.rated:${BOOKING}`, name: "booking.rated", data: { tenantId: TENANT, bookingId: BOOKING, rating: 5 } });
  });

  it("does nothing for another business's booking, and refuses a rating out of range", async () => {
    const send = vi.fn(async () => ({}));
    await expect(recordVisitRating(TENANT, BOOKING, 3, { db: fakeSupabase({ bookings: { data: [], error: null } }).client, send })).resolves.toBe(false);
    expect(send).not.toHaveBeenCalled();
    await expect(recordVisitRating(TENANT, BOOKING, 6, { db: fakeSupabase({}).client, send })).rejects.toThrow("rating from 1 to 5");
  });
});

describe("reviewLink and reviewMessage", () => {
  it("is the business's https review link, or nothing", async () => {
    await expect(reviewLink(TENANT, settings({ review_url: "https://g.page/r/skyline/review" }).client)).resolves.toBe("https://g.page/r/skyline/review");
    for (const bad of [undefined, {}, { review_url: "http://g.page/r/x" }, { review_url: "not a link" }]) {
      await expect(reviewLink(TENANT, settings(bad).client)).resolves.toBeNull();
    }
  });

  it("thanks the customer with the link, and gives the review template's variables", () => {
    expect(reviewMessage("Skyline\nHomes", "https://g.page/r/skyline/review")).toEqual({
      text: "Thank you! Would you leave Skyline Homes a quick review? It really helps: https://g.page/r/skyline/review",
      templateParams: ["Skyline Homes", "https://g.page/r/skyline/review"],
    });
  });
});

describe("hasAlertNumber", () => {
  it("is true only for a member of this business with an alert number", async () => {
    const db = fakeSupabase({ memberships: { data: [{ user_id: STAFF }], error: null } });
    await expect(hasAlertNumber(TENANT, STAFF, db.client)).resolves.toBe(true);
    expect(db.calls).toContainEqual({ table: "memberships", method: "not", args: ["whatsapp_phone", "is", null] });
    await expect(hasAlertNumber(TENANT, STAFF, fakeSupabase({ memberships: { data: [], error: null } }).client)).resolves.toBe(false);
  });
});
