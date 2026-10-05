import { describe, expect, it } from "vitest";
import { PAKKA_IND } from "./industries";
import { CLOSED, RE_BIZ, RE_HOT, RE_TODAY, convs } from "./shell";
import { LEADS, STAGES } from "./leads";
import { INIT as BOOKINGS, RE_CAL, STAFF } from "./calendar";
import {
  FEATURES,
  GROUPS,
  PLAN_CREDITS,
  PLAN_KEYS,
  PLAN_NAMES,
  PLAN_NUMBERS,
  PLAN_PRICES,
  PLAN_SEATS,
  SAMPLE_BALANCES,
  TOPUP_PACKS,
} from "./plans";
import { PLANS } from "./billing";
import { BASE, V } from "./templates";
import { EX, SVC } from "./settings";

// The screens look records up across fixtures by id (a hot lead on Home opens its chat in the
// Inbox, a booking names a staff member, …). These tests keep those references intact so a
// fixture edit can't silently break a click path. They also pin the shapes the screens read,
// which are the shapes the API contracts in docs/dashboard-screen-contracts.md replace.

const SAMPLE_KEYS = ["re", "salon", "int", "hotel", "rest"] as const;

/** The data each sample industry exposes to the shell, whichever fixture it lives in. */
function tenant(key: (typeof SAMPLE_KEYS)[number]) {
  if (key === "re") {
    return { biz: RE_BIZ, convs: convs(), hot: RE_HOT, today: RE_TODAY, leads: LEADS, stages: STAGES, staff: STAFF, bookings: BOOKINGS };
  }
  const X = PAKKA_IND[key];
  return { biz: X.biz, convs: X.convs, hot: X.hot, today: X.bookings, leads: X.leads.list, stages: X.leads.stages, staff: X.cal.staff, bookings: X.cal.list };
}

describe.each(SAMPLE_KEYS)("sample tenant %s", (key) => {
  const t = tenant(key);

  it("has the business fields the shell renders", () => {
    for (const field of ["name", "sector", "city", "owner", "ownerIni", "email", "testCode"]) {
      expect(t.biz[field], field).toBeTruthy();
    }
  });

  it("has conversations with unique ids and a customer or AI message", () => {
    const ids = t.convs.map((c: { id: string }) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of t.convs) expect(c.msgs.some((m: { f: string }) => m.f !== "sys"), c.id).toBe(true);
  });

  it("links every Home hot lead and the closed-window chat to a conversation", () => {
    const ids = new Set(t.convs.map((c: { id: string }) => c.id));
    for (const h of t.hot) expect(ids.has(h.id), h.id).toBe(true);
    expect(ids.has(CLOSED[key]), `CLOSED.${key}`).toBe(true);
  });

  it("puts every lead in a known stage", () => {
    for (const l of t.leads) expect(t.stages, l.id).toContain(l.stage);
  });

  it("assigns every booking to a listed staff member", () => {
    for (const b of t.bookings) expect(t.staff, b.name).toContain(b.staff);
    for (const [, , , staff] of t.today) expect(staff).toBeTruthy();
  });

  it("has settings and template copy", () => {
    expect(EX[key]).toBeDefined();
    expect(SVC[key].items.length).toBeGreaterThan(0);
    expect(V[key].biz).toBeTruthy();
  });
});

describe("real-estate default", () => {
  it("returns a fresh copy of the conversations on every call", () => {
    const a = convs();
    a[0].msgs.push({ f: "staff", who: "Test", t: "mutated", tm: "now" });
    expect(convs()[0].msgs.some((m: { t: string }) => m.t === "mutated")).toBe(false);
  });

  it("calendar default reuses the staff and bookings lists", () => {
    expect(RE_CAL.staff).toBe(STAFF);
    expect(RE_CAL.list).toBe(BOOKINGS);
  });
});

describe("plans and features", () => {
  it("keeps every per-plan list aligned with PLAN_KEYS", () => {
    for (const list of [PLAN_NAMES, PLAN_CREDITS, PLAN_PRICES, PLAN_SEATS, PLAN_NUMBERS]) {
      expect(list).toHaveLength(PLAN_KEYS.length);
    }
    expect(PLANS.map((p: { k: string }) => p.k)).toEqual(PLAN_KEYS);
  });

  it("puts every feature in a known group and a valid minimum plan", () => {
    const keys = FEATURES.map((f: { key: string }) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const f of FEATURES) {
      expect(GROUPS, f.key).toContain(f.g);
      expect(f.plan, f.key).toBeGreaterThanOrEqual(0);
      expect(f.plan, f.key).toBeLessThan(PLAN_KEYS.length);
    }
  });

  it("has balances for every account and credit level the URL can select", () => {
    for (const acct of ["trial", "paid"]) {
      for (const lvl of ["healthy", "low", "zero"]) expect(typeof SAMPLE_BALANCES[acct][lvl]).toBe("number");
    }
  });

  it("has top-up packs as [credits, price, leads]", () => {
    for (const [credits, price, leads] of TOPUP_PACKS) {
      expect(credits).toBeGreaterThan(0);
      expect(price).toMatch(/^₹[\d,]+$/);
      expect(leads).toMatch(/leads/);
    }
  });

  it("builds every template with a key and an English body", () => {
    for (const key of SAMPLE_KEYS) {
      for (const t of BASE(V[key])) {
        expect(t.key).toMatch(/_v\d+$/);
        expect(t.en.length).toBeGreaterThan(0);
      }
    }
  });
});
