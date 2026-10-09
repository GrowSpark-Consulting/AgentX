import { handoffAlert } from "./handoff-alert";
import { kbIngest } from "./kb-ingest";
import { kbSweep } from "./kb-sweep";
import { ping } from "./ping";
import { processMessage } from "./process-message";
import { releaseHolds } from "./release-holds";

// Every Inngest function is registered here and served from the API's /api/inngest (see serve.ts).
export const functions = [ping, releaseHolds, kbIngest, kbSweep, processMessage, handoffAlert];
