import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { INDUSTRIES } from "@/features/onboarding/data";
import { fetchActivePacks, offeredTrades } from "@/features/onboarding/packs";

/** A stand-in for the Supabase client: one result, every call recorded. */
function fakeClient(result: { data: unknown; error: unknown }) {
  const calls: [string, string, unknown[]][] = [];
  const client = {
    from: (table: string) => {
      const builder: Record<string, unknown> = {};
      for (const name of ["select", "eq"]) {
        builder[name] = (...args: unknown[]) => {
          calls.push([table, name, args]);
          return builder;
        };
      }
      builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
      return builder;
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

const LAUNCH = [
  { key: "real-estate", label: "Real estate" },
  { key: "interiors", label: "Interior design" },
  { key: "salon", label: "Beauty parlour" },
];

describe("fetchActivePacks", () => {
  it("reads only the key and the label of active packs", async () => {
    const { client, calls } = fakeClient({ data: LAUNCH, error: null });
    expect(await fetchActivePacks(client)).toEqual(LAUNCH);
    expect(calls).toEqual([
      ["vertical_packs", "select", ["key, label:definition->>label"]],
      ["vertical_packs", "eq", ["active", true]],
    ]);
  });

  it("keeps one pack per key when several versions are active, taking the first label there is", async () => {
    const { client } = fakeClient({
      data: [
        { key: "salon", label: null },
        { key: "real-estate", label: "Real estate" },
        { key: "salon", label: "Beauty parlour" },
        { key: "real-estate", label: "Real estate v2" },
      ],
      error: null,
    });
    expect(await fetchActivePacks(client)).toEqual([
      { key: "salon", label: "Beauty parlour" },
      { key: "real-estate", label: "Real estate" },
    ]);
  });

  it("treats a blank label as none", async () => {
    const { client } = fakeClient({ data: [{ key: "salon", label: "  " }], error: null });
    expect(await fetchActivePacks(client)).toEqual([{ key: "salon", label: null }]);
  });

  it("throws when the read fails, so no trade is offered", async () => {
    const { client } = fakeClient({ data: null, error: { code: "PGRST000", message: "Could not connect" } });
    await expect(fetchActivePacks(client)).rejects.toMatchObject({ code: "PGRST000" });
  });

  it("throws on rows it can't parse", async () => {
    for (const data of [null, [{ key: "salon" }], [{ key: "", label: "Empty" }], [{ key: 7, label: "Seven" }]]) {
      await expect(fetchActivePacks(fakeClient({ data, error: null }).client)).rejects.toThrow();
    }
  });
});

describe("offeredTrades", () => {
  it("offers the launch trades by their pack labels, keeping their INDUSTRIES indexes", () => {
    const trades = offeredTrades(LAUNCH);
    expect(trades.map((t) => [INDUSTRIES[t.index].key, t.name])).toEqual([
      ["re", "Real estate"],
      ["int", "Interior design"],
      ["salon", "Beauty parlour"],
    ]);
    for (const t of trades) expect(INDUSTRIES[t.index].packKey).toBeDefined();
  });

  it("never offers a trade whose pack isn't active", () => {
    const names = offeredTrades([{ key: "interiors", label: "Interior design" }]).map((t) => t.name);
    expect(names).toEqual(["Interior design"]);
    for (const hidden of ["Real estate", "Salon", "Beauty parlour", "Hotel", "Restaurant", "Plumber / Electrician"]) {
      expect(names).not.toContain(hidden);
    }
  });

  it("ignores an active pack that no trade starts a trial on", () => {
    expect(offeredTrades([{ key: "tours-travel", label: "Tours" }])).toEqual([]);
  });

  it("falls back to the trade's own name when the pack has no label", () => {
    expect(offeredTrades([{ key: "salon", label: null }]).map((t) => t.name)).toEqual(["Salon"]);
  });

  it("shows one card per trade even if a pack key repeats", () => {
    const trades = offeredTrades([...LAUNCH, { key: "salon", label: "Beauty parlour" }]);
    expect(trades.map((t) => t.index)).toEqual([0, 1, 2]);
  });

  it("offers nothing when no pack is active", () => {
    expect(offeredTrades([])).toEqual([]);
  });
});
