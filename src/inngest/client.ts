import { Inngest } from "inngest";

// Locally, INNGEST_DEV=1 points this at the dev server (pnpm inngest:dev).
// On Vercel, INNGEST_EVENT_KEY and INNGEST_SIGNING_KEY come from the Inngest integration.
export const inngest = new Inngest({ id: "pakka-agent" });
