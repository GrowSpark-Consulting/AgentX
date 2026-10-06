import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
type Result<T> = { data: T; error: null };
interface Query extends Promise<Result<Row[]>> {
  eq(column: string, value: unknown): Query;
  maybeSingle(): Promise<Result<Row | null>>;
}
// Rows are read when the query is built, like a real snapshot; `gate` holds a tenant read open.
let gate: Promise<void> | undefined;
function query(rows: Row[]): Query {
  return Object.assign(Promise.resolve({ data: rows, error: null as null }), {
    eq: (column: string, value: unknown) => query(rows.filter((r) => r[column] === value)),
    maybeSingle: async () => {
      const row = rows[0] ?? null;
      if (gate) await gate;
      return { data: row, error: null as null };
    },
  });
}

const ACTIVE = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const PAUSED = "1b4e28ba-2fa1-41d2-883f-0016d3cca427";
const TRIAL_OVER = "6fa459ea-ee8a-4ca4-894e-db77e160355e";
const TRIAL_LIVE = "16fd2706-8baf-433b-82eb-8c7fada847da";
const future = new Date(Date.now() + 86_400_000).toISOString();
const past = new Date(Date.now() - 86_400_000).toISOString();

let tables: Record<string, Row[]>;
const from = vi.fn((table: string) => ({ select: () => query(tables[table]) }));
vi.mock("../lib/supabase-admin", () => ({ supabaseAdmin: () => ({ from }) }));

const { getFeatureStates, invalidateFeatureCache, isEnabled } = await import("./is-enabled");
const reads = (table: string) => from.mock.calls.filter(([t]) => t === table).length;

beforeEach(() => {
  tables = {
    tenants: [
      { id: ACTIVE, plan_key: "starter", status: "active", trial_ends_at: null },
      { id: PAUSED, plan_key: "starter", status: "paused", trial_ends_at: null },
      { id: TRIAL_OVER, plan_key: "starter", status: "trial", trial_ends_at: past },
      { id: TRIAL_LIVE, plan_key: "starter", status: "trial", trial_ends_at: future },
    ],
    plans: [{ key: "starter", feature_keys: ["ai_auto_reply", "reminder_24h", "auto_topup"] }],
    features: [
      { key: "ai_auto_reply", default_on: true },
      { key: "reminder_24h", default_on: true },
      { key: "auto_topup", default_on: false },
      { key: "daily_agenda", default_on: true },
    ],
    tenant_features: [
      { tenant_id: ACTIVE, feature_key: "reminder_24h", enabled: false },
      { tenant_id: ACTIVE, feature_key: "daily_agenda", enabled: true },
    ],
  };
  gate = undefined;
  invalidateFeatureCache();
  from.mockClear();
});
afterEach(() => vi.useRealTimers());

describe("isEnabled", () => {
  it("is on when the plan includes the feature and its default is on", async () => {
    await expect(isEnabled(ACTIVE, "ai_auto_reply")).resolves.toBe(true);
  });

  it("follows the business's own toggle over the default", async () => {
    await expect(isEnabled(ACTIVE, "reminder_24h")).resolves.toBe(false);
  });

  it("is off when the default is off and the business never turned it on", async () => {
    await expect(isEnabled(ACTIVE, "auto_topup")).resolves.toBe(false);
  });

  it("stays off when the plan lacks the feature, even if the business turned it on", async () => {
    await expect(isEnabled(ACTIVE, "daily_agenda")).resolves.toBe(false);
    const agenda = (await getFeatureStates(ACTIVE)).find((s) => s.key === "daily_agenda");
    expect(agenda).toEqual({ key: "daily_agenda", inPlan: false, toggledOn: true, enabled: false });
  });

  it("is off for an unknown business", async () => {
    await expect(isEnabled("00000000-0000-4000-8000-000000000000", "ai_auto_reply")).resolves.toBe(false);
  });

  it("is off for a paused business", async () => {
    await expect(isEnabled(PAUSED, "ai_auto_reply")).resolves.toBe(false);
  });

  it("is off once a trial has ended, even before it is paused", async () => {
    await expect(isEnabled(TRIAL_OVER, "ai_auto_reply")).resolves.toBe(false);
    await expect(isEnabled(TRIAL_LIVE, "ai_auto_reply")).resolves.toBe(true);
  });
});

describe("feature state cache", () => {
  it("reuses a tenant's states for 60 seconds, then reloads", async () => {
    vi.useFakeTimers();
    await isEnabled(ACTIVE, "ai_auto_reply");
    vi.advanceTimersByTime(59_000);
    await isEnabled(ACTIVE, "reminder_24h");
    expect(reads("tenants")).toBe(1);
    vi.advanceTimersByTime(2_000);
    await isEnabled(ACTIVE, "ai_auto_reply");
    expect(reads("tenants")).toBe(2);
  });

  it("loads the features and plans catalogue once for all tenants", async () => {
    await isEnabled(ACTIVE, "ai_auto_reply");
    await isEnabled(PAUSED, "ai_auto_reply");
    expect(reads("tenants")).toBe(2);
    expect(reads("features")).toBe(1);
    expect(reads("plans")).toBe(1);
  });

  it("shares one load between concurrent callers", async () => {
    await Promise.all([isEnabled(ACTIVE, "ai_auto_reply"), isEnabled(ACTIVE, "reminder_24h"), getFeatureStates(ACTIVE)]);
    expect(reads("tenants")).toBe(1);
  });

  it("does not cache a load that started before the toggle changed", async () => {
    let release!: () => void;
    gate = new Promise((r) => (release = r));
    const stale = isEnabled(ACTIVE, "reminder_24h"); // reads the old toggle: off
    tables.tenant_features = tables.tenant_features.map((t) =>
      t.feature_key === "reminder_24h" ? { ...t, enabled: true } : t,
    );
    invalidateFeatureCache(ACTIVE); // what PATCH /api/features will do after writing
    release();
    gate = undefined;
    await expect(stale).resolves.toBe(false);
    await expect(isEnabled(ACTIVE, "reminder_24h")).resolves.toBe(true);
  });

  it("reloads after invalidateFeatureCache", async () => {
    await isEnabled(ACTIVE, "ai_auto_reply");
    invalidateFeatureCache(ACTIVE);
    await isEnabled(ACTIVE, "ai_auto_reply");
    expect(reads("tenants")).toBe(2);
  });

  it("skips the cache when asked for fresh states", async () => {
    await getFeatureStates(ACTIVE);
    await getFeatureStates(ACTIVE, { fresh: true });
    expect(reads("tenants")).toBe(2);
  });
});
