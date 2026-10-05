import { inngest } from "./client";

// Smoke test for a new environment: send `system/ping` from the Inngest UI
// and a `system-ping` run should complete.
export const ping = inngest.createFunction(
  { id: "system-ping", triggers: [{ event: "system/ping" }] },
  async ({ step }) => step.run("pong", () => ({ pong: true })),
);
