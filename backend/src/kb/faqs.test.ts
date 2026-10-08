import type { TenantContext } from "@pakka/types";
import { describe, expect, it, vi } from "vitest";
import { AppError } from "../lib/errors";
import { fakeKbStore } from "../test-support/fake-kb-store";
import { EmbeddingsError } from "./embeddings";
import { answerGap, createFaq, deleteFaq, dismissGap, listGaps, updateFaq, type FaqDeps } from "./faqs";

// The FAQ and gap services behind /api/kb/faqs and /api/kb/gaps (docs/contracts.md, section 9). The store is in
// memory and enforces the tenant filter; the embeddings call is a spy. Who may do what: owners and admins write
// FAQs; owners, admins and staff answer or dismiss gaps.

const A = "e0000000-0000-0000-0000-00000000000a";
const B = "e0000000-0000-0000-0000-00000000000b";
const FAQ = "f0000000-0000-0000-0000-0000000000f1";
const GAP = "a0000000-0000-0000-0000-0000000000a1";
const USER = "00000000-0000-0000-0000-0000000000a1";

const ctx = (role: "owner" | "admin" | "staff", tenantId = A): TenantContext => ({
  user: { id: USER, email: "owner@test.local" },
  role,
  tenant: { id: tenantId, name: "Test", vertical: "real-estate", timezone: "Asia/Kolkata", status: "active", planKey: "pro", trialEndsAt: null },
});

function setup(docs: Parameters<typeof fakeKbStore>[0] = [], gaps: Parameters<typeof fakeKbStore>[1] = []) {
  const fake = fakeKbStore(docs, gaps);
  const embed = vi.fn(async (texts: string[]) => texts.map(() => [1, 0, 0]));
  const deps: FaqDeps = { store: fake.store, embed };
  return { ...fake, embed, deps };
}
const failure = async (promise: Promise<unknown>): Promise<AppError> => {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(AppError);
  return error as AppError;
};

describe("createFaq", () => {
  it("saves the FAQ, embeds it inline and makes it ready, and answers with { id, q, a }", async () => {
    const s = setup();
    const result = await createFaq(ctx("owner"), { q: "Is there parking?", a: "Yes, two covered slots per flat." }, s.deps);
    expect(result).toEqual({ id: expect.any(String), q: "Is there parking?", a: "Yes, two covered slots per flat." });
    const doc = s.docs.get(result.id);
    expect(doc).toMatchObject({ tenantId: A, sourceType: "manual", title: "Is there parking?", body: "Yes, two covered slots per flat.", status: "ready" });
    expect(s.embed).toHaveBeenCalledOnce();
    expect(s.chunks.get(result.id)?.[0].content).toContain("two covered slots");
    expect(s.chunks.get(result.id)?.[0].content).toContain("Is there parking?"); // the question is part of what is searched
  });

  it("is for owners and admins: staff are forbidden, before anything is read or embedded", async () => {
    const s = setup();
    expect((await failure(createFaq(ctx("staff"), { q: "Q?", a: "A" }, s.deps))).code).toBe("forbidden");
    expect(s.calls).toEqual([]);
    expect(s.embed).not.toHaveBeenCalled();
    for (const role of ["owner", "admin"] as const) await expect(createFaq(ctx(role), { q: `Q ${role}?`, a: "A" }, s.deps)).resolves.toBeDefined();
  });

  it.each([
    ["no question", { q: "", a: "A" }],
    ["a blank question", { q: "   ", a: "A" }],
    ["a question over 300 characters", { q: "q".repeat(301), a: "A" }],
    ["no answer", { q: "Q?", a: "" }],
    ["an answer over 2000 characters", { q: "Q?", a: "a".repeat(2001) }],
    ["a question that is not text", { q: 5, a: "A" }],
    ["no body", undefined],
  ])("refuses %s as validation_failed, and embeds nothing", async (_name, body) => {
    const s = setup();
    const error = await failure(createFaq(ctx("owner"), body, s.deps));
    expect(error.code).toBe("validation_failed");
    expect(s.embed).not.toHaveBeenCalled();
    expect(s.docs.size).toBe(0);
  });

  it("accepts a question of exactly 300 and an answer of exactly 2000 characters", async () => {
    const s = setup();
    await expect(createFaq(ctx("owner"), { q: "q".repeat(300), a: "a".repeat(2000) }, s.deps)).resolves.toBeDefined();
  });

  it("cleans the text: control characters go, the question is one line, the answer keeps its line breaks", async () => {
    const s = setup();
    const result = await createFaq(ctx("owner"), { q: "  Is   there\u0000 \n parking? ", a: "Yes.\u0007\nTwo slots.  " }, s.deps);
    expect(result).toEqual({ id: expect.any(String), q: "Is there parking?", a: "Yes.\nTwo slots." });
  });

  it("answers conflict for a question the business already has (any capitals, any spaces), and embeds nothing", async () => {
    const s = setup([{ tenantId: A, sourceType: "manual", title: "Is there parking?", body: "Yes", status: "ready" }]);
    const error = await failure(createFaq(ctx("owner"), { q: "  IS THERE PARKING? ", a: "No" }, s.deps));
    expect(error.code).toBe("conflict");
    expect(s.embed).not.toHaveBeenCalled();
  });

  it("lets another business have the same question", async () => {
    const s = setup([{ tenantId: B, sourceType: "manual", title: "Is there parking?", body: "Yes", status: "ready" }]);
    await expect(createFaq(ctx("owner"), { q: "Is there parking?", a: "No" }, s.deps)).resolves.toBeDefined();
  });

  it("when embedding fails: the FAQ is kept as failed, the answer is upstream_failed, and nothing is searchable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const s = setup();
    s.embed.mockRejectedValue(new EmbeddingsError(503));
    const error = await failure(createFaq(ctx("owner"), { q: "Q?", a: "A" }, s.deps));
    expect(error.code).toBe("upstream_failed");
    const [doc] = [...s.docs.values()];
    expect(doc.status).toBe("failed");
    expect(doc.error).toBeTruthy();
    expect(s.chunks.size).toBe(0);
  });

  it("saving the same question again after a failed embed is the retry, not a conflict: the same FAQ, now ready", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const s = setup();
    s.embed.mockRejectedValueOnce(new EmbeddingsError(503));
    await failure(createFaq(ctx("owner"), { q: "Is there parking?", a: "Yes" }, s.deps));
    const [failed] = [...s.docs.values()];
    expect(failed.status).toBe("failed");
    const result = await createFaq(ctx("owner"), { q: "is there parking?", a: "Yes, two slots." }, s.deps);
    expect(result.id).toBe(failed.id);
    expect(s.docs.size).toBe(1);
    expect(s.docs.get(failed.id)).toMatchObject({ status: "ready", body: "Yes, two slots.", title: "is there parking?" });
  });

  it("a duplicate of a FAQ that is ready is still a conflict", async () => {
    const s = setup([{ tenantId: A, sourceType: "manual", title: "Is there parking?", body: "Yes", status: "ready" }]);
    expect((await failure(createFaq(ctx("owner"), { q: "Is there parking?", a: "No" }, s.deps))).code).toBe("conflict");
  });

  it("turns an unexpected failure into the same fixed upstream_failed, never its own words", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const s = setup();
    s.embed.mockRejectedValue(new Error("secret provider detail"));
    const error = await failure(createFaq(ctx("owner"), { q: "Q?", a: "A" }, s.deps));
    expect(error.code).toBe("upstream_failed");
    expect(error.message).not.toMatch(/secret/);
    expect(vi.mocked(console.error).mock.calls.flat().join(" ")).not.toMatch(/secret provider detail/);
  });
});

describe("updateFaq", () => {
  const seeded = () => setup([{ id: FAQ, tenantId: A, sourceType: "manual", title: "Is there parking?", body: "Yes", status: "ready" }]);

  it("changes only what was sent, embeds again, and is ready again", async () => {
    const s = seeded();
    const result = await updateFaq(ctx("admin"), FAQ, { a: "No parking." }, s.deps);
    expect(result).toEqual({ id: FAQ, q: "Is there parking?", a: "No parking." });
    expect(s.embed).toHaveBeenCalledOnce();
    expect(s.chunks.get(FAQ)?.[0].content).toContain("No parking.");
    expect(s.docs.get(FAQ)?.status).toBe("ready");
  });

  it("can change the question, and refuses one that another FAQ has", async () => {
    const s = setup([
      { id: FAQ, tenantId: A, sourceType: "manual", title: "Is there parking?", body: "Yes", status: "ready" },
      { id: "f0000000-0000-0000-0000-0000000000f2", tenantId: A, sourceType: "manual", title: "Is there a pool?", body: "No", status: "ready" },
    ]);
    expect((await updateFaq(ctx("owner"), FAQ, { q: "Parking available?" }, s.deps)).q).toBe("Parking available?");
    expect((await failure(updateFaq(ctx("owner"), FAQ, { q: "is there a POOL?" }, s.deps))).code).toBe("conflict");
  });

  it("is for owners and admins", async () => {
    const s = seeded();
    expect((await failure(updateFaq(ctx("staff"), FAQ, { a: "x" }, s.deps))).code).toBe("forbidden");
    expect(s.docs.get(FAQ)?.body).toBe("Yes");
  });

  it("refuses an empty change, an empty field and a malformed id", async () => {
    const s = seeded();
    expect((await failure(updateFaq(ctx("owner"), FAQ, {}, s.deps))).code).toBe("validation_failed");
    expect((await failure(updateFaq(ctx("owner"), FAQ, { a: "  " }, s.deps))).code).toBe("validation_failed");
    expect((await failure(updateFaq(ctx("owner"), "not-an-id", { a: "x" }, s.deps))).code).toBe("not_found");
  });

  it("is not_found for another business's FAQ and for an upload, and changes nothing", async () => {
    const s = setup([
      { id: FAQ, tenantId: B, sourceType: "manual", title: "Q", body: "A", status: "ready" },
      { id: "d0000000-0000-0000-0000-0000000000d1", tenantId: A, sourceType: "upload", title: "Brochure", body: "text", status: "ready" },
    ]);
    expect((await failure(updateFaq(ctx("owner"), FAQ, { a: "x" }, s.deps))).code).toBe("not_found");
    expect((await failure(updateFaq(ctx("owner"), "d0000000-0000-0000-0000-0000000000d1", { a: "x" }, s.deps))).code).toBe("not_found");
    expect(s.docs.get(FAQ)?.body).toBe("A");
    expect(s.embed).not.toHaveBeenCalled();
  });

  it("when embedding fails: the new text is saved but the FAQ is failed (not searchable) and the answer is upstream_failed", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const s = seeded();
    s.embed.mockRejectedValue(new EmbeddingsError(500));
    expect((await failure(updateFaq(ctx("owner"), FAQ, { a: "New" }, s.deps))).code).toBe("upstream_failed");
    expect(s.docs.get(FAQ)).toMatchObject({ body: "New", status: "failed" });
  });
});

describe("two saves of one FAQ at the same time", () => {
  const seeded = () => setup([{ id: FAQ, tenantId: A, sourceType: "manual", title: "Is there parking?", body: "v0", status: "ready" }]);

  it("the older save's vectors are dropped when the FAQ changed while it was embedding: the newer text is what ends up stored", async () => {
    const s = seeded();
    let calls = 0;
    s.embed.mockImplementation(async (texts: string[]) => {
      if (++calls === 1) await updateFaq(ctx("owner"), FAQ, { a: "v2" }, s.deps); // a second save lands while the first is embedding
      return texts.map(() => [calls, 0, 0]);
    });
    await updateFaq(ctx("owner"), FAQ, { a: "v1" }, s.deps);
    expect(s.docs.get(FAQ)).toMatchObject({ body: "v2", status: "ready" });
    expect(s.chunks.get(FAQ)?.[0].content).toContain("v2");
    expect(s.chunks.get(FAQ)?.[0].content).not.toContain("v1");
  });

  it("a late failure does not mark failed a FAQ that the other save has made ready", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const s = seeded();
    let calls = 0;
    s.embed.mockImplementation(async (texts: string[]) => {
      if (++calls === 1) {
        await updateFaq(ctx("owner"), FAQ, { a: "v2" }, s.deps); // finishes first, ready
        throw new EmbeddingsError(503); // then the first one fails
      }
      return texts.map(() => [1, 0, 0]);
    });
    await failure(updateFaq(ctx("owner"), FAQ, { a: "v1" }, s.deps));
    expect(s.docs.get(FAQ)?.status).toBe("ready");
  });
});

describe("deleteFaq", () => {
  it("deletes the business's FAQ and its chunks", async () => {
    const s = setup([{ id: FAQ, tenantId: A, sourceType: "manual", title: "Q", body: "A", status: "ready" }]);
    s.chunks.set(FAQ, [{ content: "c", embedding: [1] }]);
    await expect(deleteFaq(ctx("owner"), FAQ, s.deps.store)).resolves.toBeUndefined();
    expect(s.docs.has(FAQ)).toBe(false);
    expect(s.chunks.has(FAQ)).toBe(false);
  });

  it("is for owners and admins", async () => {
    const s = setup([{ id: FAQ, tenantId: A, sourceType: "manual", title: "Q", body: "A", status: "ready" }]);
    expect((await failure(deleteFaq(ctx("staff"), FAQ, s.deps.store))).code).toBe("forbidden");
    expect(s.docs.has(FAQ)).toBe(true);
  });

  it("is not_found for another business's FAQ, an upload (it has its own route), an unknown id and a malformed id", async () => {
    const s = setup([
      { id: FAQ, tenantId: B, sourceType: "manual", title: "Q", body: "A", status: "ready" },
      { id: "d0000000-0000-0000-0000-0000000000d1", tenantId: A, sourceType: "upload", title: "Brochure", body: "t", status: "ready" },
    ]);
    for (const id of [FAQ, "d0000000-0000-0000-0000-0000000000d1", "f0000000-0000-0000-0000-0000000000ff", "x"]) {
      expect((await failure(deleteFaq(ctx("owner"), id, s.deps.store))).code).toBe("not_found");
    }
    expect(s.docs.size).toBe(2);
  });
});

describe("listGaps", () => {
  it("lists the business's open gaps, most asked first, as { id, question, askedCount, lastAskedBy }", async () => {
    const s = setup([], [
      { id: GAP, tenantId: A, question: "Parking?", askedCount: 1, lastAskedBy: "+9198xxxxxx21" },
      { id: "a0000000-0000-0000-0000-0000000000a2", tenantId: A, question: "Home visits?", askedCount: 4, lastAskedBy: "Priya" },
      { id: "a0000000-0000-0000-0000-0000000000a3", tenantId: A, question: "Pool?", askedCount: 4, lastAskedBy: null, lastAskedAt: 5 },
      { id: "a0000000-0000-0000-0000-0000000000a4", tenantId: A, question: "Answered one", askedCount: 9, status: "answered" },
      { id: "a0000000-0000-0000-0000-0000000000a5", tenantId: A, question: "Dismissed one", askedCount: 9, status: "dismissed" },
      { id: "a0000000-0000-0000-0000-0000000000b1", tenantId: B, question: "Other business", askedCount: 50 },
    ]);
    expect(await listGaps(ctx("staff"), s.deps.store)).toEqual([
      { id: "a0000000-0000-0000-0000-0000000000a3", question: "Pool?", askedCount: 4, lastAskedBy: null },
      { id: "a0000000-0000-0000-0000-0000000000a2", question: "Home visits?", askedCount: 4, lastAskedBy: "Priya" },
      { id: GAP, question: "Parking?", askedCount: 1, lastAskedBy: "+9198xxxxxx21" },
    ]);
  });

  it("is open to owner, admin and staff", async () => {
    const s = setup();
    for (const role of ["owner", "admin", "staff"] as const) await expect(listGaps(ctx(role), s.deps.store)).resolves.toEqual([]);
  });
});

describe("answerGap", () => {
  const seeded = () => setup([], [{ id: GAP, tenantId: A, question: "Do you do home visits?", askedCount: 3 }]);

  it("writes the FAQ, closes the gap, embeds the FAQ inline and answers { faq: { id, q, a } }", async () => {
    const s = seeded();
    const result = await answerGap(ctx("staff"), GAP, { a: "Yes, within 5 km." }, s.deps);
    expect(result).toEqual({ faq: { id: expect.any(String), q: "Do you do home visits?", a: "Yes, within 5 km." } });
    expect(s.gaps.get(GAP)).toMatchObject({ status: "answered", answeredFaqId: result.faq.id });
    expect(s.docs.get(result.faq.id)).toMatchObject({ tenantId: A, sourceType: "manual", status: "ready" });
    expect(s.embed).toHaveBeenCalledOnce();
    expect(s.chunks.get(result.faq.id)?.[0].content).toContain("within 5 km");
  });

  it("is open to owner, admin and staff", async () => {
    for (const role of ["owner", "admin", "staff"] as const) {
      const s = seeded();
      await expect(answerGap(ctx(role), GAP, { a: "Yes" }, s.deps)).resolves.toBeDefined();
    }
  });

  it("is not_found for another business's gap and a malformed id: nothing is written or embedded", async () => {
    const s = setup([], [{ id: GAP, tenantId: B, question: "Q?", askedCount: 1 }]);
    expect((await failure(answerGap(ctx("owner"), GAP, { a: "x" }, s.deps))).code).toBe("not_found");
    expect((await failure(answerGap(ctx("owner"), "nope", { a: "x" }, s.deps))).code).toBe("not_found");
    expect(s.docs.size).toBe(0);
    expect(s.gaps.get(GAP)?.status).toBe("open");
    expect(s.embed).not.toHaveBeenCalled();
  });

  it("answers conflict for a gap that is already answered, and embeds nothing", async () => {
    const s = setup([], [{ id: GAP, tenantId: A, question: "Q?", askedCount: 1, status: "answered" }]);
    expect((await failure(answerGap(ctx("owner"), GAP, { a: "x" }, s.deps))).code).toBe("conflict");
    expect(s.embed).not.toHaveBeenCalled();
  });

  it("answers conflict when the question duplicates an FAQ, and the gap stays open", async () => {
    const s = setup([{ tenantId: A, sourceType: "manual", title: "do you do home visits?", body: "Yes", status: "ready" }], [{ id: GAP, tenantId: A, question: "Do you do home visits?", askedCount: 1 }]);
    expect((await failure(answerGap(ctx("owner"), GAP, { a: "x" }, s.deps))).code).toBe("conflict");
    expect(s.gaps.get(GAP)?.status).toBe("open");
  });

  it("refuses an empty or too long answer as validation_failed", async () => {
    const s = seeded();
    for (const a of ["", "   ", "a".repeat(2001), 5, undefined]) {
      const error = await failure(answerGap(ctx("owner"), GAP, { a }, s.deps));
      expect(error.code).toBe("validation_failed");
    }
    expect(s.gaps.get(GAP)?.status).toBe("open");
  });

  it("when embedding fails: the gap is closed and the FAQ exists but is failed; the answer is upstream_failed", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const s = seeded();
    s.embed.mockRejectedValue(new EmbeddingsError(429));
    expect((await failure(answerGap(ctx("owner"), GAP, { a: "Yes" }, s.deps))).code).toBe("upstream_failed");
    expect(s.gaps.get(GAP)?.status).toBe("answered");
    expect([...s.docs.values()].map((d) => d.status)).toEqual(["failed"]);
  });
});

describe("dismissGap", () => {
  it("dismisses the business's gap, for owner, admin and staff, and it leaves the list", async () => {
    for (const role of ["owner", "admin", "staff"] as const) {
      const s = setup([], [{ id: GAP, tenantId: A, question: "Q?", askedCount: 1 }]);
      await expect(dismissGap(ctx(role), GAP, s.deps.store)).resolves.toBeUndefined();
      expect(await listGaps(ctx(role), s.deps.store)).toEqual([]);
    }
  });

  it("is harmless to repeat on a dismissed gap", async () => {
    const s = setup([], [{ id: GAP, tenantId: A, question: "Q?", askedCount: 1, status: "dismissed" }]);
    await expect(dismissGap(ctx("owner"), GAP, s.deps.store)).resolves.toBeUndefined();
  });

  it("is not_found for another business's gap, an answered gap and a malformed id", async () => {
    const s = setup([], [
      { id: GAP, tenantId: B, question: "Q?", askedCount: 1 },
      { id: "a0000000-0000-0000-0000-0000000000a2", tenantId: A, question: "Done", askedCount: 1, status: "answered" },
    ]);
    for (const id of [GAP, "a0000000-0000-0000-0000-0000000000a2", "nope"]) {
      expect((await failure(dismissGap(ctx("owner"), id, s.deps.store))).code).toBe("not_found");
    }
    expect(s.gaps.get(GAP)?.status).toBe("open");
    expect(s.gaps.get("a0000000-0000-0000-0000-0000000000a2")?.status).toBe("answered");
  });
});

