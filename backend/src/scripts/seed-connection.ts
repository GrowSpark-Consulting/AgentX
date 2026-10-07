import { formatSeedResult, parseSeedArgs, seedConnection, SeedError } from "../channels/whatsapp/seed-connection";
import { createSeedDb } from "../channels/whatsapp/seed-connection-db";
import { EnvError, serverEnv } from "../lib/env";

// pnpm seed:connection --route-code DEMO-SALON            (flags: see parseSeedArgs)
// Connects one of our own WhatsApp numbers to a business as a `platform` connection. Reads
// backend/.env.local through tsx; prints only the business, the masked number, the connection id, the
// status and the token's expiry date. Local database only unless --allow-remote.

async function main(): Promise<void> {
  const args = parseSeedArgs(process.argv.slice(2));
  const result = await seedConnection(args, { db: createSeedDb(), env: serverEnv() });
  for (const line of formatSeedResult(result)) console.log(line);
}

main().catch((err: unknown) => {
  // SeedError and EnvError messages are fixed text (EnvError names variables, never values). Anything
  // else is reported by its type only: its message could hold a value.
  if (err instanceof SeedError || err instanceof EnvError) console.error(err.message);
  else console.error(`Seed failed unexpectedly (${err instanceof Error ? err.name : "unknown error"}).`);
  process.exitCode = 1;
});
