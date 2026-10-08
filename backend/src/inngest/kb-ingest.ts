import { KB_UPLOAD_EVENT, KbUploadedData } from "../kb/events";
import { failureMessage, runIngest } from "../kb/ingest";
import { createKbStore } from "../kb/store";
import { inngest } from "./client";

// Turns an uploaded document's text into searchable chunks (docs/contracts.md, section 9). The work is in
// kb/ingest.ts; this only wires it to Inngest.
//
// One run at a time per document (a second event for the same document waits) and at most 5 at once in all, so
// a script uploading in a loop cannot flood the embeddings provider; 3 retries per step; and a last-resort
// handler: if the run ends in any way the body did not handle (a cancelled run, a timeout), a document still
// `processing` is marked failed. A document whose job never started at all is failed by inngest/kb-sweep.ts.
export const kbIngest = inngest.createFunction(
  {
    id: "kb-ingest",
    triggers: [{ event: KB_UPLOAD_EVENT }],
    concurrency: [{ key: "event.data.documentId", limit: 1 }, { limit: 5 }],
    retries: 3,
    timeouts: { finish: "15m" },
    onFailure: async ({ event, error }) => {
      const original = KbUploadedData.safeParse((event.data.event as { data?: unknown } | undefined)?.data);
      if (!original.success) return;
      await createKbStore().setStatus(original.data.tenantId, original.data.documentId, "failed", failureMessage(error), { onlyIf: "processing" });
    },
  },
  // step.run types its result as the JSON round trip of what the function returns; the results here are plain JSON already.
  async ({ event, step }) => runIngest({ run: (id, fn) => step.run(id, fn) as never }, event.data),
);
