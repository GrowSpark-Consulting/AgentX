import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { Booking } from "@/features/calendar/bookings";
import type { Lead } from "@/features/leads/data";
import { chooseLead, fetchLeadCard, relevantBooking, toLeadCard } from "./lead-card-data";

// The Inbox lead card: the chat's customer's lead as stored, chosen as the pipeline chooses it,
// answers labelled by the pack (keys when the pack is missing), nothing scored or made up here, and
// every read scoped to the session's business.

const TENANT = "c0000000-0000-0000-0000-00000000000a";
const OTHER_TENANT = "c0000000-0000-0000-0000-00000000000b";
const CONTACT = "b0000000-0000-0000-0000-000000000001";
const OTHER_CONTACT = "b0000000-0000-0000-0000-000000000002";
const TZ = "Asia/Kolkata";
const NOW = new Date("2026-10-09T06:30:00Z"); // 12:00 pm in Chennai, Fri 9 Oct

const id = (n: number) => `a0000000-0000-0000-0000-${String(n).padStart(12, "0")}`;

function lead(over: Partial<Lead> = {}): Lead {
  return {
    id: id(1), contactId: CONTACT, name: "Karthik R", hasName: true, phoneMasked: "+91 98xxx xxx21", stage: "qualified",
    score: 82, temperature: "hot", answers: {}, ownerUserId: null,
    createdAt: "2026-10-01T05:00:00.000Z", updatedAt: "2026-10-08T05:00:00.000Z", ...over,
  };
}
function booking(over: Partial<Booking> = {}): Booking {
  return {
    id: id(500), leadId: id(1), resourceId: null, resourceName: "Asha", serviceName: "Consultation", kind: "slot", status: "confirmed",
    start: "2026-10-12T04:30:00.000Z", end: "2026-10-12T05:30:00.000Z", holdExpiresAt: null, createdAt: "2026-10-08T05:00:00.000Z",
    rescheduledFrom: null, cancelReason: null, customerName: null, phoneMasked: null, ...over,
  };
}

const PACK = [
  { key: "area", label: "Preferred area", type: "text", required: true },
  { key: "budget", label: "Budget", type: "range_inr", required: true },
];

describe("chooseLead", () => {
  it("picks the oldest lead that isn't won or lost, as the pipeline does", () => {
    const old = lead({ id: id(1), stage: "won", createdAt: "2026-09-01T00:00:00.000Z" });
    const open = lead({ id: id(2), stage: "engaged", createdAt: "2026-09-10T00:00:00.000Z" });
    const newer = lead({ id: id(3), stage: "new", createdAt: "2026-10-01T00:00:00.000Z" });
    expect(chooseLead([newer, old, open])?.id).toBe(id(2));
  });

  it("falls back to the newest closed lead, and to null without leads", () => {
    const won = lead({ id: id(1), stage: "won", createdAt: "2026-09-01T00:00:00.000Z" });
    const lost = lead({ id: id(2), stage: "lost", createdAt: "2026-09-20T00:00:00.000Z" });
    expect(chooseLead([lost, won])?.id).toBe(id(2));
    expect(chooseLead([])).toBeNull();
  });
});

describe("relevantBooking", () => {
  it("is the next upcoming booking, with its title, time and status", () => {
    const later = booking({ id: id(502), start: "2026-10-14T09:30:00.000Z", end: "2026-10-14T10:30:00.000Z", resourceName: "Ravi" });
    const past = booking({ id: id(503), status: "completed", start: "2026-10-05T04:30:00.000Z", end: "2026-10-05T05:30:00.000Z" });
    expect(relevantBooking([later, past, booking()], NOW, TZ)).toEqual({
      id: id(500), title: "Consultation with Asha", when: "Mon 12 Oct, 10:00 am", status: "confirmed", statusLabel: "Confirmed",
    });
  });

  it("skips a lapsed hold, and shows the latest booking's status when none is upcoming", () => {
    const lapsed = booking({ id: id(510), status: "held", holdExpiresAt: "2026-10-08T00:00:00.000Z" });
    const cancelled = booking({ id: id(511), status: "cancelled", start: "2026-10-13T04:30:00.000Z", end: "2026-10-13T05:30:00.000Z" });
    expect(relevantBooking([lapsed, cancelled], NOW, TZ)).toMatchObject({ id: id(511), statusLabel: "Cancelled" });
    expect(relevantBooking([lapsed], NOW, TZ)).toMatchObject({ id: id(510), status: "expired", statusLabel: "Hold expired" });
    expect(relevantBooking([], NOW, TZ)).toBeNull();
  });

  it("keeps a held slot whose hold is still running as upcoming", () => {
    const held = booking({ id: id(520), status: "held", holdExpiresAt: "2099-01-01T00:00:00.000Z", kind: "callback", serviceName: null, resourceName: null });
    expect(relevantBooking([held], NOW, TZ)).toMatchObject({ title: "Callback", statusLabel: "Held" });
  });
});

describe("toLeadCard", () => {
  it("labels answers from the pack, marks unanswered fields, and keeps answers the pack doesn't know", () => {
    const card = toLeadCard(lead({ answers: { area: "Velachery", parking_needed: true } }), PACK, [], NOW, TZ);
    expect(card.stage).toBe("Qualified");
    expect(card.answers).toEqual([
      { key: "area", label: "Preferred area", value: "Velachery", required: true, inPack: true },
      { key: "budget", label: "Budget", value: null, required: true, inPack: true },
      { key: "parking_needed", label: "Parking needed", value: "Yes", required: false, inPack: false },
    ]);
  });

  it("falls back to the answers' keys without a pack, and shows nothing for empty fields", () => {
    expect(toLeadCard(lead({ answers: { budget_max: 8000000 } }), [], [], NOW, TZ).answers).toEqual([
      { key: "budget_max", label: "Budget max", value: "80,00,000", required: false, inPack: false },
    ]);
    expect(toLeadCard(lead({ answers: {} }), [], [], NOW, TZ).answers).toEqual([]);
  });

  it("keeps an unscored lead unscored: no score or temperature is worked out", () => {
    const card = toLeadCard(lead({ score: null, temperature: null, stage: "new", answers: {} }), PACK, [], NOW, TZ);
    expect(card.lead.score).toBeNull();
    expect(card.lead.temperature).toBeNull();
    expect(card.answers.every((a) => a.value === null)).toBe(true);
  });

  it("only uses this lead's bookings", () => {
    const card = toLeadCard(lead(), PACK, [booking({ leadId: id(99) })], NOW, TZ);
    expect(card.booking).toBeNull();
  });
});

type Result = { data: unknown; error: unknown };
/** A query builder per table that records filters and resolves to that table's result. */
function fakeClient(results: Record<string, Result>) {
  const calls: { table: string; op: string; args: unknown[] }[] = [];
  const client = {
    from(table: string) {
      const result = results[table] ?? { data: [], error: null };
      const chain: Record<string, unknown> = {};
      for (const op of ["select", "eq", "order", "limit"]) {
        chain[op] = (...args: unknown[]) => {
          calls.push({ table, op, args });
          return chain;
        };
      }
      chain.maybeSingle = () => Promise.resolve(result);
      chain.then = (resolve: (r: Result) => unknown, reject: (e: unknown) => unknown) => Promise.resolve(result).then(resolve, reject);
      return chain;
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}
const leadRow = (over: Record<string, unknown> = {}) => ({
  id: id(1), tenant_id: TENANT, contact_id: CONTACT, stage: "qualified", score: 82, temperature: "hot", fields: { area: "Velachery" },
  owner_user_id: null, created_at: "2026-10-01T05:00:00+00:00", updated_at: "2026-10-08T05:00:00+00:00", contacts: { name: "Karthik R", phone: "+919812345621" }, ...over,
});
const bookingRow = (over: Record<string, unknown> = {}) => ({
  id: id(500), tenant_id: TENANT, lead_id: id(1), resource_id: null, service_id: null, kind: "slot", status: "confirmed",
  start_at: "2026-10-12T04:30:00+00:00", end_at: "2026-10-12T05:30:00+00:00", hold_expires_at: null, details: {}, created_at: "2026-10-08T05:00:00+00:00",
  services: { name: "Consultation" }, resources: { name: "Asha" }, ...over,
});
const tenantResult = { data: { id: TENANT, vertical: "sample-pack", vertical_version: 1 }, error: null };
const packResult = { data: { definition: { fields: PACK } }, error: null };

describe("fetchLeadCard", () => {
  it("reads the contact's leads and the chosen lead's bookings, both scoped to this business", async () => {
    const { client, calls } = fakeClient({ leads: { data: [leadRow()], error: null }, bookings: { data: [bookingRow()], error: null }, tenants: tenantResult, vertical_packs: packResult });
    const card = await fetchLeadCard(client, TENANT, CONTACT, NOW, TZ);
    expect(card?.lead).toMatchObject({ id: id(1), name: "Karthik R", phoneMasked: "+91 98xxx xxx21", score: 82, temperature: "hot" });
    expect(card?.answers[0]).toMatchObject({ label: "Preferred area", value: "Velachery" });
    expect(card?.booking).toMatchObject({ title: "Consultation with Asha", statusLabel: "Confirmed" });
    const eqs = (table: string) => calls.filter((c) => c.table === table && c.op === "eq").map((c) => c.args);
    expect(eqs("leads")).toEqual([["tenant_id", TENANT], ["contact_id", CONTACT]]);
    expect(eqs("bookings")).toEqual([["tenant_id", TENANT], ["lead_id", id(1)]]);
  });

  it("drops rows of another business or another contact even if they arrive", async () => {
    const { client, calls } = fakeClient({
      leads: { data: [leadRow({ id: id(7), tenant_id: OTHER_TENANT }), leadRow({ id: id(8), contact_id: OTHER_CONTACT })], error: null },
    });
    expect(await fetchLeadCard(client, TENANT, CONTACT, NOW, TZ)).toBeNull();
    // No lead, so no bookings are read.
    expect(calls.some((c) => c.table === "bookings")).toBe(false);
  });

  it("is null for a contact without a lead", async () => {
    expect(await fetchLeadCard(fakeClient({ leads: { data: [], error: null } }).client, TENANT, CONTACT, NOW, TZ)).toBeNull();
  });

  it("shows answers with their keys when the pack can't be read", async () => {
    const { client } = fakeClient({ leads: { data: [leadRow()], error: null }, tenants: { data: null, error: { code: "XX000", message: "boom", details: null, hint: null } } });
    const card = await fetchLeadCard(client, TENANT, CONTACT, NOW, TZ);
    expect(card?.answers).toEqual([{ key: "area", label: "Area", value: "Velachery", required: false, inPack: false }]);
  });

  it("fails on a lead or booking read error, or rows of an unexpected shape", async () => {
    const dbError = { code: "PGRST301", message: "JWT expired", details: null, hint: null };
    await expect(fetchLeadCard(fakeClient({ leads: { data: null, error: dbError } }).client, TENANT, CONTACT, NOW, TZ)).rejects.toBe(dbError);
    await expect(fetchLeadCard(fakeClient({ leads: { data: [{ id: "not-a-lead" }], error: null } }).client, TENANT, CONTACT, NOW, TZ)).rejects.toThrow(/unexpected shape/);
    await expect(
      fetchLeadCard(fakeClient({ leads: { data: [leadRow()], error: null }, bookings: { data: null, error: dbError } }).client, TENANT, CONTACT, NOW, TZ),
    ).rejects.toBe(dbError);
    await expect(
      fetchLeadCard(fakeClient({ leads: { data: [leadRow()], error: null }, bookings: { data: [{ id: "x" }], error: null } }).client, TENANT, CONTACT, NOW, TZ),
    ).rejects.toThrow(/unexpected shape/);
  });
});
