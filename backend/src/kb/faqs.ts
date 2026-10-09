import type { TenantContext } from "@pakka/types";
import { z } from "zod";
import { AppError, zodFieldErrors } from "../lib/errors";
import { requireRole } from "../lib/tenant";
import { stripUnsafeCharacters } from "../lib/text";
import { embedAndStore, type Embed } from "./embed-store";
import { embeddingsClient } from "./embeddings";
import { createKbStore, type KbStore, type OpenGap } from "./store";

// The FAQ and gap services behind /api/kb/faqs and /api/kb/gaps (docs/contracts.md, section 9). A FAQ is a
// `manual` kb_documents row: `title` is the question, `body` the answer. Saving one, and answering a gap, embeds
// it inline (the reply step must see it at once) through the same embed-and-store function the ingest job uses; if
// embedding fails the row is kept as `failed` (not searchable), the answer is `upstream_failed`, and the owner
// can save again. Who may do what: owners and admins write FAQs; owners, admins and staff answer or dismiss gaps
// (Raja, 7 Oct). Every query names the business from the verified context, never from the request.

export const QUESTION_MAX = 300;
export const ANSWER_MAX = 2000;

export interface FaqDeps {
  store: KbStore;
  /** Vectors for these texts (documents, not queries). */
  embed: Embed;
}
const defaults = (): FaqDeps => ({ store: createKbStore(), embed: (texts) => embeddingsClient().embedDocuments(texts) });

export interface FaqResult {
  id: string;
  q: string;
  a: string;
}

const FAQ_WRITERS = ["owner", "admin"] as const;
const GAP_WORKERS = ["owner", "admin", "staff"] as const;
const FAQ_FAILED = "We couldn't save this question for search. Save it again in a moment.";

/** A question is one line: control characters out, every run of spaces and line breaks one space. */
const oneLine = (text: string) => stripUnsafeCharacters(text).replace(/\s+/g, " ").trim();
/** An answer keeps its line breaks; control characters out, ends trimmed. */
const multiLine = (text: string) => stripUnsafeCharacters(text).trim();

const Question = z.string().transform(oneLine).pipe(z.string().min(1, "Write the question.").max(QUESTION_MAX, `Keep the question to ${QUESTION_MAX} characters.`));
const Answer = z.string().transform(multiLine).pipe(z.string().min(1, "Write the answer.").max(ANSWER_MAX, `Keep the answer to ${ANSWER_MAX} characters.`));
const CreateBody = z.object({ q: Question, a: Answer });
const UpdateBody = z
  .object({ q: Question.optional(), a: Answer.optional() })
  .refine((body) => body.q !== undefined || body.a !== undefined, { message: "Send the question or the answer to change.", path: ["q"] });
const AnswerBody = z.object({ a: Answer });

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) throw new AppError("validation_failed", "Check the highlighted fields and try again.", zodFieldErrors(result.error));
  return result.data;
}

const guid = z.guid();
const notFoundFaq = () => new AppError("not_found", "That question was not found.");
function requireId(id: string, make: () => AppError): void {
  if (!guid.safeParse(id).success) throw make();
}

/**
 * Makes a saved FAQ searchable. Two saves of one FAQ can overlap, so after embedding it checks the FAQ still has the
 * text that was embedded; if not, a newer save owns the indexing and this one stores nothing (and a late failure does
 * not mark a FAQ `failed` that the newer save has since made ready: it only changes a FAQ still `processing`). On a
 * failure the FAQ stays, as `failed`, and the caller is told with fixed words.
 */
async function makeSearchable(deps: FaqDeps, tenantId: string, id: string, q: string, a: string): Promise<void> {
  let outcome: "stored" | "document_gone" | "superseded";
  try {
    outcome = await embedAndStore(deps, tenantId, id, `${q}\n\n${a}`, async () => {
      const now = await deps.store.getFaq(tenantId, id);
      return now !== null && now.q === q && now.a === a;
    });
  } catch (error) {
    console.error(`[kb] a FAQ could not be embedded (${error instanceof Error ? error.name : "unknown"})`); // the class only: the message can hold the provider's words
    await deps.store.setStatus(tenantId, id, "failed", FAQ_FAILED, { onlyIf: "processing" }).catch(() => undefined);
    // EmbeddingsError is an AppError with fixed, safe words and passes through; anything else gets fixed words here.
    if (error instanceof AppError) throw error;
    throw new AppError("upstream_failed", "We couldn't save this question for search just now. Try again in a moment.");
  }
  if (outcome === "document_gone") throw notFoundFaq(); // deleted while it was being saved
}

export async function createFaq(context: TenantContext, body: unknown, given?: FaqDeps): Promise<FaqResult> {
  requireRole(context, FAQ_WRITERS, "write FAQs");
  const deps = given ?? defaults();
  const { q, a } = parse(CreateBody, body);
  const tenantId = context.tenant.id;
  let id: string;
  try {
    ({ id } = await deps.store.insertFaq(tenantId, { q, a })); // a duplicate question is a conflict...
  } catch (error) {
    // ...unless the earlier save of this very question failed to embed: saving it again is that retry, not a duplicate.
    if (!(error instanceof AppError) || error.code !== "conflict") throw error;
    const failed = await deps.store.findFailedFaq(tenantId, q);
    if (!failed) throw error;
    const updated = await deps.store.updateFaq(tenantId, failed.id, { q, a });
    if (!updated) throw error;
    id = failed.id;
  }
  await makeSearchable(deps, tenantId, id, q, a);
  return { id, q, a };
}

export async function updateFaq(context: TenantContext, id: string, body: unknown, given?: FaqDeps): Promise<FaqResult> {
  requireRole(context, FAQ_WRITERS, "edit FAQs");
  const deps = given ?? defaults();
  requireId(id, notFoundFaq);
  const changes = parse(UpdateBody, body);
  const faq = await deps.store.updateFaq(context.tenant.id, id, changes);
  if (!faq) throw notFoundFaq();
  await makeSearchable(deps, context.tenant.id, id, faq.q, faq.a);
  return { id, q: faq.q, a: faq.a };
}

export async function deleteFaq(context: TenantContext, id: string, given?: KbStore): Promise<void> {
  requireRole(context, FAQ_WRITERS, "delete FAQs");
  const store = given ?? createKbStore();
  requireId(id, notFoundFaq);
  if (!(await store.deleteFaq(context.tenant.id, id))) throw notFoundFaq();
}

export async function listGaps(context: TenantContext, given?: KbStore): Promise<OpenGap[]> {
  requireRole(context, GAP_WORKERS, "see unanswered questions");
  return (given ?? createKbStore()).listOpenGaps(context.tenant.id);
}

const notFoundGap = () => new AppError("not_found", "That question was not found.");

export async function answerGap(context: TenantContext, id: string, body: unknown, given?: FaqDeps): Promise<{ faq: FaqResult }> {
  requireRole(context, GAP_WORKERS, "answer questions");
  const deps = given ?? defaults();
  requireId(id, notFoundGap);
  const { a } = parse(AnswerBody, body);
  const answered = await deps.store.answerGap(context.tenant.id, id, { answer: a, answeredBy: context.user.id }); // writes the FAQ and closes the gap together
  await makeSearchable(deps, context.tenant.id, answered.faqId, answered.question, answered.answer);
  return { faq: { id: answered.faqId, q: answered.question, a: answered.answer } };
}

export async function dismissGap(context: TenantContext, id: string, given?: KbStore): Promise<void> {
  requireRole(context, GAP_WORKERS, "dismiss questions");
  const store = given ?? createKbStore();
  requireId(id, notFoundGap);
  if (!(await store.dismissGap(context.tenant.id, id))) throw notFoundGap();
}
