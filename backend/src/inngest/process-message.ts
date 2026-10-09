import { MESSAGE_RECEIVED_EVENT, MessageReceived } from "../agent/pipeline/events";
import { runTurn } from "../agent/pipeline/process-message";
import { understandDeps } from "../agent/pipeline/runtime";
import { createPipelineStore } from "../agent/pipeline/store";
import { understandTurn } from "../agent/pipeline/understand";
import { isEnabled } from "../features/is-enabled";
import { inngest } from "./client";

// The message pipeline (docs/handover.md: `process-message`, trigger `whatsapp/message.received`). The work is
// in agent/pipeline/process-message.ts; this wires it to Inngest.
//
// - One conversation at a time (concurrency key = conversationId), so two quick messages from one customer are
//   handled in order, never in parallel.
// - Messages that arrive within 3 seconds of each other start ONE run (debounce on the conversation, and no
//   longer than 15 seconds after the first). The debounce keeps only the LAST event, so the event is only a place
//   to start looking: the run collects the customer's unanswered messages itself and answers them together.
// - Every stage is a step: a failure retries that stage (3 retries) and never repeats what finished.
//
// Today the pipeline ends after step 4 (understanding the message, and the knowledge-base search); the decide,
// reply and send steps are added in the next PRs, so a deployed run reads the message, calls the fast model, keeps
// the customer's details on the lead and searches the knowledge base, but sends nothing.
//
// A run that still fails after its retries is not tried again by anything: the customer's message stays in the
// inbox, unanswered, and `onFailure` leaves a line saying so (ids only). A sweep that finds customer messages
// nobody answered, like kb-sweep does for documents, is the follow-up that closes this gap.
export const processMessage = inngest.createFunction(
  {
    id: "process-message",
    triggers: [{ event: MESSAGE_RECEIVED_EVENT }],
    concurrency: { key: "event.data.conversationId", limit: 1 },
    debounce: { key: "event.data.conversationId", period: "3s", timeout: "15s" },
    retries: 3,
    onFailure: async ({ event, error }) => {
      const original = MessageReceived.safeParse((event.data.event as { data?: unknown } | undefined)?.data);
      // Ids and the kind of error only: no message text, no phone number, nothing the database said.
      console.error(`[pipeline] gave up after its retries${original.success ? ` on message ${original.data.messageId}` : ""} (${error.name})`);
    },
  },
  async ({ event, step }) => {
    // step.run types its result as the JSON round trip of what the function returns; the results here are plain JSON already.
    const steps = { run: <T>(id: string, fn: () => Promise<T>) => step.run(id, fn) as Promise<T> };
    const store = createPipelineStore();
    const turn = await runTurn(steps, event.data, { store, isEnabled });
    // A status and a reason only: no ids, no message text, no phone number.
    if (turn.status !== "ready") {
      console.log(`[pipeline] ${turn.status} (${turn.reason})`);
      return turn;
    }
    const understood = await understandTurn(steps, turn.turn, understandDeps(store));
    console.log(
      `[pipeline] ${understood.status}${understood.status === "fallback" ? ` (${understood.reason})` : ""}` +
        (understood.status === "understood" ? ` (${understood.summary.intent}; search ${understood.retrieval.outcome})` : ""),
    );
    // What the next steps read comes from the database, not from here.
    return { status: understood.status };
  },
);
