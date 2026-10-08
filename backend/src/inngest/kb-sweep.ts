import { STALE_PROCESSING_MESSAGE, STALE_PROCESSING_MS } from "../kb/ingest";
import { createKbStore } from "../kb/store";
import { inngest } from "./client";

/** Fails every document that has been `processing` for over 30 minutes, in all businesses. Returns how many. */
export async function sweepStaleDocuments(): Promise<{ failed: number }> {
  return { failed: await createKbStore().failStaleProcessing(STALE_PROCESSING_MS, STALE_PROCESSING_MESSAGE) };
}

// Every 10 minutes, a document that has been `processing` for over 30 minutes becomes `failed`. A document is
// left `processing` when its upload was stored but the ingest job never started (the server stopped between
// the two, or Inngest did not answer in time) or never finished. The job's own limit is 15 minutes, so
// nothing this old is still running. The owner then sees "failed", can delete it and upload again.
// Safe to run twice: a document that is no longer `processing` is not touched.
export const kbSweep = inngest.createFunction(
  { id: "kb-sweep", triggers: [{ cron: "*/10 * * * *" }] },
  async ({ step }) => step.run("sweep", sweepStaleDocuments),
);
