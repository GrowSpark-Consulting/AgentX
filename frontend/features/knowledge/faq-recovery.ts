import { ApiError } from "@/lib/errors";
import { faqChanges, type FaqInput, type FaqItem, type GapItem } from "./kb-content";

// Recovering a FAQ the AI can't use yet (docs/contracts.md section 9). Saving a FAQ, or answering a
// question, embeds it inline; if that fails the API keeps the FAQ as `failed` and answers
// `upstream_failed`. A PATCH of the FAQ retries it, even with its text unchanged. A failed answer has
// already closed the question and written the FAQ, so answering it again is a conflict: the way back
// is the FAQ list. Kept apart from the screen so it can be tested without React.

/**
 * What PATCH /api/kb/faqs/:id gets for an edit, or null when there's nothing to send. Only what changed
 * is sent; a FAQ that isn't ready is sent even unchanged (its answer is enough), since the PATCH is
 * what tries it again.
 */
export function faqEditRequest(before: FaqItem, input: FaqInput): Partial<FaqInput> | null {
  const changes = faqChanges(before, input);
  if (Object.keys(changes).length > 0) return changes;
  return before.status === "ready" ? null : { a: input.a };
}

/**
 * Saves an edit: nothing is sent when a ready FAQ didn't change (false). The saved FAQ is shown as the
 * API returned it; for a FAQ that wasn't ready, the list is then read again so it shows the status the
 * server stored. A refused save is passed on as it is, before anything is shown.
 */
export async function saveFaqEdit(
  before: FaqItem,
  input: FaqInput,
  deps: { update: (changes: Partial<FaqInput>) => Promise<FaqItem>; show: (faq: FaqItem) => void; refresh: () => Promise<void> },
): Promise<boolean> {
  const changes = faqEditRequest(before, input);
  if (!changes) return false;
  deps.show(await deps.update(changes));
  if (before.status !== "ready") await deps.refresh();
  return true;
}

/** upstream_failed: for a FAQ save or a gap answer, the embedding didn't happen (or the store wasn't reached). */
export function isUpstreamFailed(err: unknown): boolean {
  return err instanceof ApiError && err.body.error.code === "upstream_failed";
}

/** A list read again after a failed answer: where its result (or its error) goes. */
export interface ListRefresh<T> {
  read: () => Promise<T[]>;
  ready: (items: T[]) => void;
  failed: (err: unknown) => void;
}

export interface KbNotice {
  title: string;
  message: string;
}

const sameQuestion = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** What a failed answer that was (or may have been) stored says. Never "answer it again": that's a conflict. */
export function answerFailureNotice(kind: "saved" | "unknown", canWriteFaqs: boolean): KbNotice {
  if (kind === "saved") {
    const retry = canWriteFaqs ? "Open it there, choose Edit, then Save changes to try again." : "An owner or admin needs to open it there and save it again.";
    return {
      title: "Answer saved, but the AI can’t use it yet",
      message: `Your answer was saved as an FAQ, but it couldn’t be prepared for the AI. It’s under FAQs, marked “Not in use”. ${retry}`,
    };
  }
  const retry = canWriteFaqs ? "choose Edit on it, then Save changes." : "ask an owner or admin to save it again.";
  return {
    title: "Couldn’t check whether your answer was saved",
    message: `It may have been saved as an FAQ the AI can’t use yet, but the lists couldn’t be loaded. Use Try again on them. If it’s under FAQs marked “Not in use”, ${retry}`,
  };
}

/**
 * After POST /api/kb/gaps/:id/answer was refused. For upstream_failed both lists are read again: the
 * API writes the FAQ and closes the question in one transaction, then embeds, so the embedding can fail
 * after the answer was stored. upstream_failed is also what a store that couldn't be reached answers,
 * when nothing was stored, so the lists decide:
 *   * the question is gone, or a FAQ asks it: the answer was stored; a notice says how to retry it.
 *   * one list was read and shows nothing stored: null, to report the error as before.
 *   * neither list could be read: unknown; a notice says so (each list shows its own error).
 * Any other error is null at once, with nothing read.
 */
export async function recoverGapAnswer(
  err: unknown,
  gap: GapItem,
  opts: { canWriteFaqs: boolean; gaps: ListRefresh<GapItem>; faqs: ListRefresh<FaqItem> },
): Promise<KbNotice | null> {
  if (!isUpstreamFailed(err)) return null;
  const [gaps, faqs] = await Promise.allSettled([opts.gaps.read(), opts.faqs.read()]);
  if (gaps.status === "fulfilled") opts.gaps.ready(gaps.value);
  else opts.gaps.failed(gaps.reason);
  if (faqs.status === "fulfilled") opts.faqs.ready(faqs.value);
  else opts.faqs.failed(faqs.reason);

  const faqStored = faqs.status === "fulfilled" && faqs.value.some((f) => sameQuestion(f.q, gap.question));
  const gapClosed = gaps.status === "fulfilled" && !gaps.value.some((g) => g.id === gap.id);
  if (faqStored || gapClosed) return answerFailureNotice("saved", opts.canWriteFaqs);
  if (gaps.status === "fulfilled" || faqs.status === "fulfilled") return null;
  return answerFailureNotice("unknown", opts.canWriteFaqs);
}
