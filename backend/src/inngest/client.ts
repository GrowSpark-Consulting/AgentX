import { Inngest } from "inngest";

// Locally, INNGEST_DEV=1 points this at the dev server (pnpm inngest:dev).
// On Railway, INNGEST_EVENT_KEY and INNGEST_SIGNING_KEY are set on the API service (docs/environments.md).
export const inngest = new Inngest({ id: "pakka-agent" });
