import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FEATURE_CREDIT_COST } from "./credit-costs";

// The handover keeps credit costs in one constants file mirrored in features.credit_cost.
// This reads the seed so the two cannot drift apart.
const seed = readFileSync(new URL("../../../supabase/seed/features.sql", import.meta.url), "utf8");
const seeded = Object.fromEntries(
  [...seed.matchAll(/\('([a-z0-9_]+)',\s*'(?:[^']|'')*',\s*'(?:[^']|'')*',\s*(?:true|false),\s*(\d+)\)/g)].map(
    ([, key, cost]) => [key, Number(cost)],
  ),
);

describe("feature credit costs", () => {
  it("match features.credit_cost in the seed", () => {
    expect(Object.keys(seeded)).toHaveLength(21);
    expect(FEATURE_CREDIT_COST).toEqual(seeded);
  });
});
