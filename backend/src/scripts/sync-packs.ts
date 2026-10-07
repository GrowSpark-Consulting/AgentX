import { createPackStore } from "../agent/packs/store";
import { checkPacks, defaultPacksDir, describeStartupFailure, formatSyncReport, syncPacks } from "../agent/packs/sync";

// pnpm packs:sync            validates packs/*.json and stores new versions in vertical_packs
// pnpm packs:sync --check    validates only, with no database
// The server does the same sync when it starts; this is for a pre-deploy check, or after `pnpm db:reset`
// empties the table. Prints pack keys and versions only.

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((arg) => arg !== "--");
  if (args.some((arg) => arg !== "--check")) throw new Error("Usage: pnpm packs:sync [--check]");

  const dir = defaultPacksDir();
  if (args.includes("--check")) {
    for (const pack of await checkPacks(dir)) {
      console.log(`[packs] ${pack.key}@${pack.version} valid`);
      for (const w of pack.warnings) console.log(`[packs] ${pack.key}@${pack.version} warning: ${w.code}${w.path ? ` at ${w.path}` : ""}`);
    }
    return;
  }
  for (const line of formatSyncReport(await syncPacks({ dir, store: createPackStore() }))) console.log(line);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error && err.message.startsWith("Usage:") ? err.message : describeStartupFailure(err));
  process.exitCode = 1;
});
