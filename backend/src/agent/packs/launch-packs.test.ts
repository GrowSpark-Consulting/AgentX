import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { readPackFiles } from "./sync";

// The three launch packs together, and the demo businesses that use them (supabase/seed/demo_tenants.sql).
// A tenant is pinned to the pack named in tenants.vertical at tenants.vertical_version (default 1,
// migration 0002), so each demo business must find its pack at version 1 or the agent has nothing to load.

const PACKS_DIR = fileURLToPath(new URL("../../../../packs", import.meta.url));
const SEED = readFileSync(fileURLToPath(new URL("../../../../supabase/seed/demo_tenants.sql", import.meta.url)), "utf8");

/** The demo businesses: every tenant row of the seed whose name starts with "Spark Agent Demo", as { id, vertical }. */
function demoTenants(): { id: string; vertical: string }[] {
  const rows = [...SEED.matchAll(/\('(d0000000-0000-0000-0000-[0-9a-f]{12})',\s*'Spark Agent Demo[^']*',\s*'([a-z][a-z0-9-]*)'/g)];
  return rows.map((m) => ({ id: m[1], vertical: m[2] }));
}

describe("the launch packs", () => {
  it("are real-estate, interiors and salon, each version 1, each loading without warnings", async () => {
    const files = await readPackFiles(PACKS_DIR);
    expect(files.map((f) => [f.key, f.version]).sort()).toEqual([["interiors", 1], ["real-estate", 1], ["salon", 1]]);
    for (const file of files) expect(file.warnings).toEqual([]);
  });

  it("each choose their own booking mode, which the slot and visit logic reads instead of an industry name", async () => {
    const files = await readPackFiles(PACKS_DIR);
    const modes = Object.fromEntries(files.map((f) => [f.key, (f.definition as { bookingModes: string[] }).bookingModes]));
    expect(modes).toEqual({ "real-estate": ["site_visit"], interiors: ["field_visit"], salon: ["slot"] });
  });
});

describe("the demo businesses", () => {
  it("are three, one per launch pack", () => {
    expect(demoTenants().map((t) => t.vertical).sort()).toEqual(["interiors", "real-estate", "salon"]);
  });

  it("each join a pack file at version 1, so a demo message finds its pack", async () => {
    const files = await readPackFiles(PACKS_DIR);
    for (const tenant of demoTenants()) {
      expect(files.find((f) => f.key === tenant.vertical && f.version === 1), tenant.vertical).toBeDefined();
    }
  });

  it("have a DEMO route code each, named after their pack", () => {
    for (const tenant of demoTenants()) {
      const code = `DEMO-${tenant.vertical.replace(/-/g, "").toUpperCase()}`;
      expect(SEED, code).toContain(`('${code}'`);
    }
  });
});
