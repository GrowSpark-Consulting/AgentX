import { createPackStore } from "../agent/packs/store";
import { defaultPacksDir, describeStartupFailure, formatSyncReport, syncPacks } from "../agent/packs/sync";
import { registerWhatsAppSender } from "../channels/whatsapp/message-sender";
import { EnvError, serverEnv, type ServerEnv } from "../lib/env";
import { bodyLimitFor, createApp, logPathFor } from "./app";
import { allowedOrigins, withCors } from "./cors";
import { closeGracefully, createHttpServer } from "./node";

// The API service. Railway runs `pnpm --filter @pakka/backend start`; `pnpm dev` runs it locally on
// :4000 next to the frontend on :3000. tsx runs the TypeScript directly, so there is no build step.

let env: ServerEnv;
try {
  // Checked before listening, so a misconfigured deploy fails its healthcheck instead of serving
  // errors. The message names the variables, never their values.
  env = serverEnv();
} catch (err) {
  console.error(err instanceof EnvError ? `[server] ${err.message}` : "[server] could not read the environment");
  process.exit(1);
}

// Before any request: notify.send (HTTP routes and Inngest functions alike) sends through WhatsApp.
registerWhatsAppSender();

function start(): void {
  const origins = allowedOrigins(env);
  const server = createHttpServer(createApp({ allowedOrigins: origins }), {
    maxBodyBytes: (pathname) => bodyLimitFor(pathname),
    logPath: (pathname) => logPathFor(pathname),
    // A body over the limit is refused before the app runs; CORS lets the frontend read that 413.
    onRejected: (request, response) => withCors(response, request, origins),
  });

  server.on("error", (err) => {
    console.error(`[server] ${err.message}`);
    process.exit(1);
  });

  server.listen(env.PORT, env.HOST, () => {
    console.log(`[server] listening on http://${env.HOST}:${env.PORT}`);
  });

  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.once(signal, () => {
      console.log(`[server] ${signal}: finishing requests in flight`);
      void closeGracefully(server).then(() => process.exit(0));
    });
  }
}

// Packs (packs/*.json) are validated and stored in vertical_packs before the server listens: an invalid
// pack, a changed published version or an unreachable database fails the deploy's healthcheck, like a bad
// environment does. Safe when several instances start at once (see agent/packs/sync.ts).
syncPacks({ dir: defaultPacksDir(), store: createPackStore() })
  .then((report) => {
    for (const line of formatSyncReport(report)) console.log(line);
    start();
  })
  .catch((err: unknown) => {
    console.error(`[server] ${describeStartupFailure(err)}`);
    process.exit(1);
  });
