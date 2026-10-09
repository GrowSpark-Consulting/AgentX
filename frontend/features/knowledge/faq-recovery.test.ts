import type { ErrorCode } from "@pakka/types";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/errors";
import { answerFailureNotice, faqEditRequest, isUpstreamFailed, recoverGapAnswer, saveFaqEdit, type ListRefresh } from "./faq-recovery";
import { KbUnavailableError, type FaqItem, type GapItem } from "./kb-content";

// Getting a FAQ the AI can't use yet back into use (docs/contracts.md section 9): saving it again, even
// unchanged, and finding an answer whose embedding failed after the API stored it.

const FAQ_ID = "f0000000-0000-0000-0000-000000000001";
const GAP_ID = "a0000000-0000-0000-0000-000000000001";
const OTHER_GAP = "a0000000-0000-0000-0000-000000000002";

const faq = (over: Partial<FaqItem> = {}): FaqItem => ({ id: FAQ_ID, q: "Do you do keratin?", a: "Yes, from ₹4,500.", status: "ready", ...over });
const gap = (over: Partial<GapItem> = {}): GapItem => ({ id: GAP_ID, question: "Do you do keratin?", askedCount: 4, lastAskedBy: "Priya", ...over });
const apiError = (status: number, code: ErrorCode, message = "Something went wrong.") => new ApiError(status, { error: { code, message } });
/** What answering returns when the FAQ was stored but couldn't be embedded (backend/src/kb/faqs.ts). */
const embedFailed = () => apiError(502, "upstream_failed", "We couldn't save this question for search just now. Try again in a moment.");

function editDeps(saved: FaqItem = faq()) {
  return { update: vi.fn(async () => saved), show: vi.fn(), refresh: vi.fn(async () => {}) };
}

describe("saving a FAQ again", () => {
  it("sends an unchanged failed FAQ as a PATCH of its answer, the API's retry", async () => {
    const before = faq({ status: "failed" });
    expect(faqEditRequest(before, { q: before.q, a: before.a })).toEqual({ a: before.a });
    const deps = editDeps();
    expect(await saveFaqEdit(before, { q: before.q, a: before.a }, deps)).toBe(true);
    expect(deps.update).toHaveBeenCalledExactlyOnceWith({ a: "Yes, from ₹4,500." });
  });

  it("retries a FAQ still processing the same way", async () => {
    const before = faq({ status: "processing" });
    const deps = editDeps();
    await saveFaqEdit(before, { q: before.q, a: before.a }, deps);
    expect(deps.update).toHaveBeenCalledExactlyOnceWith({ a: before.a });
  });

  it("sends nothing for an unchanged ready FAQ", async () => {
    const before = faq();
    expect(faqEditRequest(before, { q: before.q, a: before.a })).toBeNull();
    const deps = editDeps();
    expect(await saveFaqEdit(before, { q: before.q, a: before.a }, deps)).toBe(false);
    expect(deps.update).not.toHaveBeenCalled();
    expect(deps.show).not.toHaveBeenCalled();
    expect(deps.refresh).not.toHaveBeenCalled();
  });

  it("still sends only what changed, for ready and failed FAQs alike", async () => {
    for (const status of ["ready", "failed"] as const) {
      const deps = editDeps();
      await saveFaqEdit(faq({ status }), { q: "Do you do keratin?", a: "Yes, from ₹5,000." }, deps);
      expect(deps.update).toHaveBeenCalledExactlyOnceWith({ a: "Yes, from ₹5,000." });
    }
    expect(faqEditRequest(faq({ status: "failed" }), { q: "Keratin?", a: "Yes, from ₹4,500." })).toEqual({ q: "Keratin?" });
  });

  it("reads the list again after retrying a failed FAQ, so it shows the status the server stored", async () => {
    const order: string[] = [];
    const deps = {
      update: vi.fn(async () => (order.push("update"), faq())),
      show: vi.fn(() => void order.push("show")),
      refresh: vi.fn(async () => void order.push("refresh")),
    };
    await saveFaqEdit(faq({ status: "failed" }), { q: faq().q, a: faq().a }, deps);
    // The refreshed list is applied last, so the API's reply can't overwrite the stored status.
    expect(order).toEqual(["update", "show", "refresh"]);
  });

  it("doesn't read the list again after editing a ready FAQ", async () => {
    const deps = editDeps();
    await saveFaqEdit(faq(), { q: faq().q, a: "Changed." }, deps);
    expect(deps.show).toHaveBeenCalledOnce();
    expect(deps.refresh).not.toHaveBeenCalled();
  });

  it("passes a refused save on as it is, showing nothing", async () => {
    const refused = embedFailed();
    const deps = { ...editDeps(), update: vi.fn(async () => Promise.reject(refused)) };
    await expect(saveFaqEdit(faq({ status: "failed" }), { q: faq().q, a: faq().a }, deps)).rejects.toBe(refused);
    expect(deps.show).not.toHaveBeenCalled();
    expect(deps.refresh).not.toHaveBeenCalled();
  });
});

describe("isUpstreamFailed", () => {
  it("is only the API's upstream_failed", () => {
    expect(isUpstreamFailed(embedFailed())).toBe(true);
    for (const err of [
      apiError(422, "validation_failed"),
      apiError(403, "forbidden"),
      apiError(409, "conflict"),
      apiError(404, "not_found"),
      apiError(500, "internal"),
      new KbUnavailableError(),
      new TypeError("Failed to fetch"),
      null,
    ]) {
      expect(isUpstreamFailed(err)).toBe(false);
    }
  });
});

function refresh<T>(read: () => Promise<T[]>) {
  return { read: vi.fn(read), ready: vi.fn<(items: T[]) => void>(), failed: vi.fn<(err: unknown) => void>() } satisfies ListRefresh<T>;
}
function lists(gaps: () => Promise<GapItem[]>, faqs: () => Promise<FaqItem[]>) {
  return { gaps: refresh(gaps), faqs: refresh(faqs) };
}

describe("an answer whose embedding failed", () => {
  const others = [gap({ id: OTHER_GAP, question: "Is there parking?" })];
  const storedFailed = faq({ status: "failed" });

  it("reads both lists again: the question leaves the open list and the failed FAQ shows", async () => {
    const l = lists(async () => others, async () => [storedFailed]);
    const notice = await recoverGapAnswer(embedFailed(), gap(), { canWriteFaqs: true, ...l });
    expect(l.gaps.read).toHaveBeenCalledOnce();
    expect(l.faqs.read).toHaveBeenCalledOnce();
    expect(l.gaps.ready).toHaveBeenCalledExactlyOnceWith(others);
    expect(l.faqs.ready).toHaveBeenCalledExactlyOnceWith([storedFailed]);
    expect(notice).toEqual(answerFailureNotice("saved", true));
  });

  it("tells an owner or admin to retry from the FAQ list, never to answer the question again", async () => {
    const notice = await recoverGapAnswer(embedFailed(), gap(), { canWriteFaqs: true, ...lists(async () => others, async () => [storedFailed]) });
    expect(notice!.title).toBe("Answer saved, but the AI can’t use it yet");
    expect(notice!.message).toContain("saved as an FAQ");
    expect(notice!.message).toContain("Not in use");
    expect(notice!.message).toContain("choose Edit, then Save changes");
    expect(`${notice!.title} ${notice!.message}`).not.toMatch(/answer (it|the question|this question) again|try answering|add answer/i);
  });

  it("tells staff that an owner or admin has to retry it", async () => {
    const notice = await recoverGapAnswer(embedFailed(), gap(), { canWriteFaqs: false, ...lists(async () => others, async () => [storedFailed]) });
    expect(notice!.message).toContain("An owner or admin needs to open it there and save it again.");
    expect(notice!.message).not.toContain("Edit");
    expect(`${notice!.title} ${notice!.message}`).not.toMatch(/answer (it|the question|this question) again|try answering|add answer/i);
  });

  it("knows the answer was stored from either list when the other can't be read, and shows that list's error", async () => {
    const down = new TypeError("Failed to fetch");
    const gapsDown = lists(async () => Promise.reject(down), async () => [storedFailed]);
    expect(await recoverGapAnswer(embedFailed(), gap(), { canWriteFaqs: true, ...gapsDown })).toEqual(answerFailureNotice("saved", true));
    expect(gapsDown.gaps.failed).toHaveBeenCalledExactlyOnceWith(down);
    expect(gapsDown.gaps.ready).not.toHaveBeenCalled();

    const faqsDown = lists(async () => others, async () => Promise.reject(down));
    expect(await recoverGapAnswer(embedFailed(), gap(), { canWriteFaqs: true, ...faqsDown })).toEqual(answerFailureNotice("saved", true));
    expect(faqsDown.faqs.failed).toHaveBeenCalledExactlyOnceWith(down);
  });

  it("says it couldn't check when neither list can be read, without hiding either error", async () => {
    const down = new TypeError("Failed to fetch");
    const l = lists(async () => Promise.reject(down), async () => Promise.reject(down));
    const notice = await recoverGapAnswer(embedFailed(), gap(), { canWriteFaqs: false, ...l });
    expect(notice).toEqual(answerFailureNotice("unknown", false));
    expect(notice!.message).toContain("ask an owner or admin to save it again");
    expect(notice!.message).not.toMatch(/answer (it|the question|this question) again|add answer/i);
    expect(l.gaps.failed).toHaveBeenCalledOnce();
    expect(l.faqs.failed).toHaveBeenCalledOnce();
  });

  it("reports the error as before when nothing was stored (the question is still open, no FAQ asks it)", async () => {
    // upstream_failed is also what the API answers when it couldn't reach the store at all.
    const l = lists(async () => [gap(), ...others], async () => []);
    expect(await recoverGapAnswer(embedFailed(), gap(), { canWriteFaqs: true, ...l })).toBeNull();
    expect(l.gaps.ready).toHaveBeenCalledOnce();
    expect(l.faqs.ready).toHaveBeenCalledOnce();
  });

  it("leaves every other error as it was, reading nothing", async () => {
    for (const err of [apiError(422, "validation_failed"), apiError(403, "forbidden"), apiError(409, "conflict"), apiError(404, "not_found"), new KbUnavailableError()]) {
      const l = lists(async () => others, async () => [storedFailed]);
      expect(await recoverGapAnswer(err, gap(), { canWriteFaqs: true, ...l })).toBeNull();
      expect(l.gaps.read).not.toHaveBeenCalled();
      expect(l.faqs.read).not.toHaveBeenCalled();
    }
  });
});
