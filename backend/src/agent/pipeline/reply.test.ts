import { NonRetriableError } from "inngest";
import { describe, expect, it, vi } from "vitest";
import type { AuditEntry } from "../../lib/audit";
import type { SendOutcome } from "../../notify/send";
import { fakePipelineStore, HIDDEN, type FakeMessage } from "../../test-support/fake-pipeline-store";
import { LlmError, type LlmClient, type LlmRequest, type LlmResult } from "../llm/anthropic";
import { fixedText } from "./fixed-texts";
import type { StaffAlertPort, SystemNoticePort } from "./ports";
import type { StepRunner, TurnContext } from "./process-message";
import { answerAfterFailure, replyTurn, type ReplyDeps } from "./reply";
import type { Retrieval, UnderstandResult } from "./understand";

// Step 7 and the send: the plan's reply is written (the model for an answer, fixed words for the rest), checked,
// sent through notify.send, and recorded as answered, in one step; a handover follows when the plan or the credits
// say so. The store, the model, notify.send, the audit and the queue are fakes; plan.ts has its own table of cases.

const A = "e0000000-0000-0000-0000-00000000000a";
const CONV = "c0000000-0000-0000-0000-00000000000c";
const CONTACT = "b0000000-0000-0000-0000-0000000000b1";
const LEAD = "10000000-0000-0000-0000-0000000000f1";
const M0 = "a0000000-0000-0000-0000-0000000000a0";
const M1 = "a0000000-0000-0000-0000-0000000000a1";
const M2 = "a0000000-0000-0000-0000-0000000000a2";
const NOW = Date.now();
const at = (secondsAgo: number) => new Date(NOW - secondsAgo * 1000).toISOString();
const QUESTION = "Do you do home visits?";
const CUSTOMER_WORDS = "home visits pannuveengala";

const SENT: SendOutcome = { status: "sent", messageId: "m-out", providerMsgId: "wamid.OUT", creditsCharged: 1, usedTemplate: false };
const llmResult = (text: string): LlmResult => ({ text, model: "claude-sonnet-5-5", stopReason: "end_turn", usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 }, costUsd: 0.01, latencyMs: 2000, attempts: 1, requestId: null });

function runner() {
  const memo = new Map<string, unknown>();
  const ran: string[] = [];
  const attempts = new Map<string, number>();
  const step: StepRunner = {
    async run(id, fn) {
      if (memo.has(id)) return memo.get(id) as never;
      ran.push(id);
      attempts.set(id, (attempts.get(id) ?? 0) + 1);
      const value = await fn();
      memo.set(id, value);
      return value;
    },
  };
  return { step, ran, memo, attempts };
}

const found: Retrieval = { outcome: "found", chunks: [{ documentId: "d1", title: "Brochure", content: "Site visits are free, Fri 9 Oct 5:00 pm. 2BHK starts at ₹78 lakh.", similarity: 0.7 }] };
const understood = (retrieval: Retrieval, over: Record<string, unknown> = {}): UnderstandResult => ({
  status: "understood",
  summary: { intent: "question", language: "en", sentiment: "neutral", asksIfHuman: false, confidence: 0.9, hasQuestion: true, fieldKeys: [], ...over },
  retrieval,
});

interface WorldOptions {
  script?: (string | Error)[];
  send?: (n: number) => SendOutcome | Promise<SendOutcome>;
  messages?: FakeMessage[];
  mode?: "ai" | "human" | "external";
  optedOut?: boolean;
  language?: string | null;
  agentSettings?: unknown;
  businessName?: string;
  question?: string | null;
  answered?: boolean;
  auditFailures?: number;
  prior?: { misses: number }[]; // earlier customer messages, oldest first, each with the count its turn left
}

function world(over: WorldOptions = {}) {
  const customer = (id: string, secondsAgo: number, meta: Record<string, unknown> = {}, body: string | null = CUSTOMER_WORDS): FakeMessage => ({
    id, tenantId: A, conversationId: CONV, direction: "in", sender: "customer", kind: "text", createdAt: at(secondsAgo), body, meta,
  });
  const question = over.question === undefined ? QUESTION : over.question;
  const prior = (over.prior ?? []).map((p, i) => customer(`a0000000-0000-0000-0000-00000000010${i}`, 600 - i * 60, { agent: { kbMisses: p.misses } }, `earlier ${i}`));
  const messages = over.messages ?? [...prior, customer(M1, 3, { agent: { extraction: { question } } })];
  const fake = fakePipelineStore({
    tenants: [{ id: A, vertical: "sample-pack", verticalVersion: 1 }],
    messages,
    conversations: [{ id: CONV, tenantId: A, contactId: CONTACT, mode: over.mode ?? "ai" }],
    contacts: [{ id: CONTACT, tenantId: A, language: over.language === undefined ? null : over.language, optedOut: over.optedOut ?? false }],
    leads: [{ id: LEAD, tenantId: A, contactId: CONTACT, stage: "engaged", createdAt: 1, fields: {} }],
    tenantInfo: { [A]: { name: over.businessName ?? "Skyline Homes", agentSettings: over.agentSettings ?? {} } },
    answered: over.answered ? [M1] : [],
  });
  const queue = [...(over.script ?? ["Yes, we do site visits. Shall we plan one?"])];
  const complete = vi.fn<(request: LlmRequest) => Promise<LlmResult>>(async () => {
    const next = queue.shift();
    if (next === undefined) throw new Error("the model was called more often than the test expected");
    if (typeof next === "string") return llmResult(next);
    throw next;
  });
  const llm: LlmClient = { complete };
  let sends = 0;
  const send = vi.fn<ReplyDeps["send"]>(async () => (over.send ? over.send(++sends) : SENT));
  const audits: AuditEntry[] = [];
  let auditFailures = over.auditFailures ?? 0;
  const audit = vi.fn(async (entry: AuditEntry) => {
    if (auditFailures > 0) {
      auditFailures--;
      throw new Error("audit down");
    }
    audits.push(entry);
    if (entry.action === "message.answered" && entry.entityId) fake.answered.set(entry.entityId, Date.now());
  });
  const sendEvent = vi.fn<ReplyDeps["sendEvent"]>(async () => undefined);
  const systemNotice = { send: vi.fn(async (): Promise<{ status: "awaiting_notify_kind" }> => ({ status: "awaiting_notify_kind" })) };
  const staffAlert = { send: vi.fn(async (): Promise<{ status: "awaiting_notify_kind" }> => ({ status: "awaiting_notify_kind" })) };
  const deps: ReplyDeps = { store: fake.store, llm, send, audit, sendEvent, systemNotice: systemNotice as SystemNoticePort, staffAlert: staffAlert as StaffAlertPort, now: () => Date.now() };
  const turn: TurnContext = {
    tenantId: A, conversationId: CONV, contactId: CONTACT, leadId: LEAD, leadCreated: false,
    messageIds: over.messages ? over.messages.map((m) => m.id).filter((id) => !id.startsWith("a0000000-0000-0000-0000-00000000010")) : [M1],
    language: null, vertical: "sample-pack", verticalVersion: 1,
  };
  return { ...fake, complete, send, audit, audits, sendEvent, systemNotice, staffAlert, deps, turn };
}

const sentText = (w: ReturnType<typeof world>, n = 0) => w.send.mock.calls[n][2].text;

describe("an answer from the knowledge base", () => {
  it("is written by the model from the facts, sent through notify.send as an ai_reply into this chat, and recorded as answered", async () => {
    const w = world();
    const r = runner();
    const out = await replyTurn(r.step, w.turn, understood(found), Date.now(), w.deps);
    expect(out).toMatchObject({ case: "answered_from_kb", reply: { status: "sent", source: "model" }, handoff: null });
    expect(w.send).toHaveBeenCalledOnce();
    expect(w.send).toHaveBeenCalledWith(A, "ai_reply", { conversationId: CONV, text: "Yes, we do site visits. Shall we plan one?" });
    expect(w.audits).toEqual([{ tenantId: A, actor: "ai", action: "message.answered", entity: "message", entityId: M1 }]);
    expect(r.ran).toEqual(["plan", "reply"]);
  });

  it("asks the strong model with the business's name, the facts, the conversation and the customer's language, under the turn's deadline", async () => {
    const w = world({ agentSettings: { persona: "Maya", tone: "formal" } });
    await replyTurn(runner().step, w.turn, understood(found, { language: "ta-en" }), Date.now(), w.deps);
    const request = w.complete.mock.calls[0][0];
    expect(request).toMatchObject({ role: "reply", tenantId: A, conversationId: CONV, prompt: { name: "reply", version: 1 } });
    const system = request.system.map((b) => b.text).join("\n");
    expect(system).toContain("Skyline Homes");
    expect(system).toContain("Maya");
    expect(system).toMatch(/formal/i);
    const user = request.messages[0].content;
    expect(user).toContain(CUSTOMER_WORDS); // the conversation
    expect(user).toContain("2BHK starts at ₹78 lakh"); // the facts
    expect(user).toMatch(/Tanglish|English letters/);
    expect(request.signal).toBeInstanceOf(AbortSignal);
  });

  it("is 'the assistant of {business}' when the business has chosen no persona", async () => {
    const w = world({ businessName: "Skyline Homes" });
    await replyTurn(runner().step, w.turn, understood(found), Date.now(), w.deps);
    const system = w.complete.mock.calls[0][0].system.map((b) => b.text).join("\n");
    expect(system).toMatch(/the assistant of Skyline Homes/);
  });

  it("ignores an agent_settings it cannot read, and still answers", async () => {
    const w = world({ agentSettings: { persona: { x: 1 }, tone: 42 } });
    expect((await replyTurn(runner().step, w.turn, understood(found), Date.now(), w.deps)).reply.status).toBe("sent");
  });

  it("writes the answered row for every message of the turn", async () => {
    const mk = (id: string, s: number): FakeMessage => ({ id, tenantId: A, conversationId: CONV, direction: "in", sender: "customer", kind: "text", createdAt: at(s), body: "x", meta: id === M2 ? { agent: { extraction: { question: QUESTION } } } : {} });
    const w = world({ messages: [mk(M0, 6), mk(M1, 4), mk(M2, 2)] });
    await replyTurn(runner().step, w.turn, understood(found), Date.now(), w.deps);
    expect(w.audits.map((a) => a.entityId)).toEqual([M0, M1, M2]);
    expect(w.send).toHaveBeenCalledOnce(); // one reply for the whole burst
  });
});

describe("the post-check", () => {
  it("passes an amount that is in the facts, written another way (numeric value)", async () => {
    const w = world({ script: ["A 2BHK starts at ₹78,00,000."] });
    const out = await replyTurn(runner().step, w.turn, understood(found), Date.now(), w.deps);
    expect(out.reply).toMatchObject({ status: "sent", source: "model" });
    expect(w.complete).toHaveBeenCalledOnce();
  });

  it("regenerates once, with the reason, when the reply has a price that is not in the facts, and sends the second if it is good", async () => {
    const w = world({ script: ["A 2BHK starts at ₹65 lakh.", "A 2BHK starts at ₹78 lakh."] });
    const out = await replyTurn(runner().step, w.turn, understood(found), Date.now(), w.deps);
    expect(out.reply).toMatchObject({ status: "sent", source: "model" });
    expect(w.complete).toHaveBeenCalledTimes(2);
    const second = w.complete.mock.calls[1][0].messages;
    expect(second.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(second[2].content).toMatch(/amounts, dates and times/);
    expect(sentText(w)).toBe("A 2BHK starts at ₹78 lakh.");
  });

  it("sends exactly 'Let me confirm that with the team' when the second reply is no better, and never asks a third time", async () => {
    const w = world({ script: ["₹65 lakh", "₹60 lakh", "never asked"] });
    const out = await replyTurn(runner().step, w.turn, understood(found), Date.now(), w.deps);
    expect(out.reply).toMatchObject({ status: "sent", source: "fixed" });
    expect(sentText(w)).toBe("Let me confirm that with the team");
    expect(w.complete).toHaveBeenCalledTimes(2);
  });

  it("catches a date, a time, a reply over 600 characters and one with three questions, the same way", async () => {
    for (const bad of ["Come on 12 Oct.", "Come at 6 pm.", "x".repeat(601), "Budget? Area? Timeline?"]) {
      const w = world({ script: [bad, bad] });
      await replyTurn(runner().step, w.turn, understood(found), Date.now(), w.deps);
      expect(sentText(w)).toBe("Let me confirm that with the team");
    }
  });

  it("says the safe line in the customer's language: Tamil script, Tanglish, Hindi", async () => {
    for (const language of ["ta", "ta-en", "hi"] as const) {
      const w = world({ script: ["₹1", "₹2"] });
      await replyTurn(runner().step, w.turn, understood(found, { language }), Date.now(), w.deps);
      expect(sentText(w)).toBe(fixedText("fallback", language));
    }
  });
});

describe("the language model fails", () => {
  it.each(["rate_limited", "unavailable", "timeout", "aborted", "rejected", "refusal", "truncated", "empty", "invalid_request"] as const)("(%s) the customer still gets the safe line", async (code) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const w = world({ script: [new LlmError(code, 500, 3)] });
    const out = await replyTurn(runner().step, w.turn, understood(found), Date.now(), w.deps);
    expect(out.reply).toMatchObject({ status: "sent", source: "fixed" });
    expect(sentText(w)).toBe("Let me confirm that with the team");
    expect(w.audits).toHaveLength(1);
  });

  it("an unexpected error does too, and its words are not logged", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const w = world({ script: [new Error("secret provider detail")] });
    expect((await replyTurn(runner().step, w.turn, understood(found), Date.now(), w.deps)).reply.status).toBe("sent");
    expect(log.mock.calls.flat().join(" ")).not.toContain("secret provider detail");
  });
});

describe("the turn's deadline", () => {
  it("past the hard stop, no model is called: the safe line goes out", async () => {
    const w = world();
    const out = await replyTurn(runner().step, w.turn, understood(found), Date.now() - 26_000, w.deps);
    expect(out).toMatchObject({ case: "deadline", reply: { status: "sent", source: "fixed" } });
    expect(w.complete).not.toHaveBeenCalled();
    expect(sentText(w)).toBe("Let me confirm that with the team");
  });

  it("when the time runs out between the plan and the reply, the safe line goes out instead of a model call", async () => {
    const w = world();
    let clockCalls = 0;
    w.deps.now = () => (++clockCalls < 2 ? Date.now() : Date.now() + 30_000); // the plan step sees time left, the reply step none
    const out = await replyTurn(runner().step, w.turn, understood(found), Date.now(), w.deps);
    expect(out.reply).toMatchObject({ status: "sent", source: "fixed" });
    expect(w.complete).not.toHaveBeenCalled();
  });
});

describe("every way step 4 ends has an answer", () => {
  const cases: [string, UnderstandResult, string][] = [
    ["a fallback (the answer was not usable)", { status: "fallback", reason: "invalid_output" }, "clarify"],
    ["a fallback (no text)", { status: "fallback", reason: "no_text" }, "clarify"],
    ["a fallback (the model declined)", { status: "fallback", reason: "model_declined" }, "clarify"],
    ["the language model could not be reached", { status: "model_unavailable" }, "fallback"],
    ["no usable pack", { status: "no_pack" }, "fallback"],
    ["a search that could not run", understood({ outcome: "unavailable" }), "fallback"],
    ["a search with no answer", understood({ outcome: "none" }), "fallback"],
    ["a message about leaving", understood({ outcome: "skipped" }, { intent: "opt_out" }), "stop_hint"],
  ];

  it.each(cases)("%s: exactly one reply is sent, in fixed words, and recorded", async (_name, result, key) => {
    const w = world();
    const out = await replyTurn(runner().step, w.turn, result, Date.now(), w.deps);
    expect(w.send).toHaveBeenCalledOnce();
    expect(w.complete).not.toHaveBeenCalled(); // no model call: nothing to be steered, nothing that can fail
    expect(sentText(w)).toBe(fixedText(key as "fallback", "en"));
    expect(out.reply).toMatchObject({ status: "sent", source: "fixed" });
    expect(w.audits.filter((a) => a.action === "message.answered")).toHaveLength(1);
  });

  it.each([
    ["off topic", understood({ outcome: "skipped" }, { intent: "off_topic" })],
    ["a greeting", understood({ outcome: "skipped" }, { intent: "greeting", hasQuestion: false })],
    ["details given", understood({ outcome: "skipped" }, { intent: "give_details", hasQuestion: false })],
  ])("%s: one reply written by the model and sent", async (_name, result) => {
    const w = world({ script: ["Happy to help with our homes."] });
    await replyTurn(runner().step, w.turn, result, Date.now(), w.deps);
    expect(w.complete).toHaveBeenCalledOnce();
    expect(w.send).toHaveBeenCalledOnce();
  });

  it("no usable pack also opens a handover (stuck) so a person looks at the setup", async () => {
    const w = world();
    const out = await replyTurn(runner().step, w.turn, { status: "no_pack" }, Date.now(), w.deps);
    expect(out.handoff).toMatchObject({ trigger: "stuck", opened: true, switched: true });
    expect(w.handoffs[0]).toMatchObject({ trigger: "stuck", priority: "normal" });
    expect(w.staffAlert.send).toHaveBeenCalledWith(expect.objectContaining({ kind: "setup_problem" }));
  });
});

describe("a question the knowledge base cannot answer", () => {
  const none = understood({ outcome: "none" });

  it("is recorded as a gap once, under its normalised form, for this business and contact", async () => {
    const w = world();
    await replyTurn(runner().step, w.turn, none, Date.now(), w.deps);
    expect([...w.gaps.values()]).toEqual([expect.objectContaining({ tenantId: A, norm: "do you do home visits", question: QUESTION, contactId: CONTACT, askedCount: 1 })]);
  });

  it("is not counted twice when the plan step is retried or the event repeats", async () => {
    const w = world();
    await replyTurn(runner().step, w.turn, none, Date.now(), w.deps);
    await replyTurn(runner().step, w.turn, none, Date.now(), w.deps); // a new run for the same turn
    expect([...w.gaps.values()][0].askedCount).toBe(1);
    expect(w.send).toHaveBeenCalledOnce(); // and the customer got one reply
  });

  it("keeps the chat's count of misses on the message, and is no handover on the first", async () => {
    const w = world();
    const out = await replyTurn(runner().step, w.turn, none, Date.now(), w.deps);
    expect(out.handoff).toBeNull();
    expect(w.messages.get(M1)?.meta?.agent).toMatchObject({ kbMisses: 1, gapRecorded: true, planCase: "kb_miss" });
  });

  it("records nothing for a question that has no words to count (only punctuation)", async () => {
    const w = world({ question: "???" });
    await replyTurn(runner().step, w.turn, none, Date.now(), w.deps);
    expect(w.gaps.size).toBe(0);
    expect(w.send).toHaveBeenCalledOnce();
  });

  it("two misses in a row in one chat is a handover: the handover line, a kb_gap handoff, the chat to a person, the event", async () => {
    const w = world({ prior: [{ misses: 1 }] });
    const out = await replyTurn(runner().step, w.turn, none, Date.now(), w.deps);
    expect(out.case).toBe("kb_miss_handoff");
    expect(sentText(w)).toBe(fixedText("handoff", "en"));
    expect(out.handoff).toMatchObject({ trigger: "kb_gap", opened: true, switched: true });
    expect(w.handoffs).toEqual([expect.objectContaining({ trigger: "kb_gap", priority: "normal", resolved: false })]);
    expect(w.conversations.get(CONV)?.mode).toBe("human");
    expect(w.sendEvent).toHaveBeenCalledWith({ id: `handoff_opened:${w.handoffs[0].id}`, name: "handoff.opened", data: { tenantId: A, conversationId: CONV, handoffId: w.handoffs[0].id } });
    expect(w.audits.map((a) => a.action)).toEqual(["message.answered", "handoff.opened"]);
    expect(w.staffAlert.send).toHaveBeenCalledWith({ tenantId: A, conversationId: CONV, kind: "handoff_opened" });
  });

  it("a miss, an answered turn, then a miss is no handover", async () => {
    const w = world({ prior: [{ misses: 1 }, { misses: 0 }] });
    const out = await replyTurn(runner().step, w.turn, none, Date.now(), w.deps);
    expect(out.handoff).toBeNull();
    expect(w.conversations.get(CONV)?.mode).toBe("ai");
  });

  it("the same question from another customer is no handover: a gap's business-wide count is not a chat's misses", async () => {
    const first = world();
    await replyTurn(runner().step, first.turn, none, Date.now(), first.deps);
    const second = world();
    // the other customer's chat; the business already has this gap with a count of 5 from everyone together
    await second.store.recordKbGap(A, { question: QUESTION, questionNorm: "do you do home visits", contactId: CONTACT });
    for (let i = 0; i < 4; i++) await second.store.recordKbGap(A, { question: QUESTION, questionNorm: "do you do home visits", contactId: CONTACT });
    const out = await replyTurn(runner().step, second.turn, none, Date.now(), second.deps);
    expect(out.handoff).toBeNull();
    expect(sentText(second)).toBe(fixedText("fallback", "en"));
  });

  it("is no handover when the business turned that trigger off, and the customer still gets the safe line", async () => {
    const w = world({ prior: [{ misses: 1 }], agentSettings: { handoffTriggers: [{ key: "kb_gap", enabled: false }] } });
    const out = await replyTurn(runner().step, w.turn, none, Date.now(), w.deps);
    expect(out.handoff).toBeNull();
    expect(sentText(w)).toBe(fixedText("fallback", "en"));
  });
});

describe("when the business is out of credits", () => {
  const broke = () => world({ send: () => ({ status: "skipped", reason: "insufficient_credits" }), language: "ta" });

  it("sends no AI reply and records nothing as answered: the chat goes to a person, with a credits_exhausted handoff and the event", async () => {
    const w = broke();
    const out = await replyTurn(runner().step, w.turn, understood(found), Date.now(), w.deps);
    expect(out.reply).toEqual({ status: "no_credits" });
    expect(w.audits.filter((a) => a.action === "message.answered")).toEqual([]);
    expect(out.handoff).toMatchObject({ trigger: "credits_exhausted", opened: true, switched: true });
    expect(w.handoffs[0]).toMatchObject({ trigger: "credits_exhausted", priority: "high" });
    expect(w.conversations.get(CONV)?.mode).toBe("human");
    expect(w.sendEvent).toHaveBeenCalledOnce();
  });

  it("goes through the system-notice and staff-alert ports, and is skipped only there: awaiting_notify_kind", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const w = broke();
    const out = await replyTurn(runner().step, w.turn, understood(found), Date.now(), w.deps);
    expect(w.systemNotice.send).toHaveBeenCalledWith({ tenantId: A, conversationId: CONV, kind: "credits_holding", text: fixedText("credits_holding", "ta") });
    expect(w.staffAlert.send).toHaveBeenCalledWith({ tenantId: A, conversationId: CONV, kind: "credits_exhausted" });
    expect(out.handoff).toMatchObject({ alert: "awaiting_notify_kind", holding: "awaiting_notify_kind" });
    log.mockRestore();
  });

  it("opens one handoff however often the turn runs, and sends the event once", async () => {
    const w = broke();
    await replyTurn(runner().step, w.turn, understood(found), Date.now(), w.deps);
    await replyTurn(runner().step, w.turn, understood(found), Date.now(), w.deps);
    expect(w.handoffs).toHaveLength(1);
    expect(w.sendEvent).toHaveBeenCalledOnce(); // the second run found the handoff open and sent nothing more
    expect(w.systemNotice.send).toHaveBeenCalledOnce(); // a real message now: one holding line, not one per run
  });

  it("a port that fails does not fail the handover", async () => {
    const w = broke();
    w.staffAlert.send.mockRejectedValue(new Error("down"));
    w.systemNotice.send.mockRejectedValue(new Error("down"));
    const out = await replyTurn(runner().step, w.turn, understood(found), Date.now(), w.deps);
    expect(out.handoff).toMatchObject({ opened: true, alert: "failed", holding: "failed" });
  });
});

describe("right before it sends", () => {
  it("does not send into a chat a person has taken over", async () => {
    for (const mode of ["human", "external"] as const) {
      const w = world({ mode });
      const out = await replyTurn(runner().step, w.turn, understood(found), Date.now(), w.deps);
      expect(out.reply).toEqual({ status: "not_sent", reason: "not_ai_mode" });
      expect(w.send).not.toHaveBeenCalled();
      expect(w.audits).toEqual([]);
    }
  });

  it("does not send to a customer who has opted out", async () => {
    const w = world({ optedOut: true });
    expect((await replyTurn(runner().step, w.turn, understood(found), Date.now(), w.deps)).reply).toEqual({ status: "not_sent", reason: "opted_out" });
    expect(w.send).not.toHaveBeenCalled();
  });

  it("does nothing for a handover when the reply was not sent", async () => {
    const w = world({ mode: "human", prior: [{ misses: 1 }] });
    const out = await replyTurn(runner().step, w.turn, understood({ outcome: "none" }), Date.now(), w.deps);
    expect(out.handoff).toBeNull();
    expect(w.handoffs).toEqual([]);
  });
});

describe("never two replies", () => {
  it("a turn whose last message has been answered sends nothing and calls no model", async () => {
    const w = world({ answered: true });
    const out = await replyTurn(runner().step, w.turn, understood(found), Date.now(), w.deps);
    expect(out.reply).toEqual({ status: "already_answered" });
    expect(w.send).not.toHaveBeenCalled();
    expect(w.complete).not.toHaveBeenCalled();
  });

  it("a second run of the same turn is the first's answer: one send", async () => {
    const w = world({ script: ["Yes!", "Yes again!"] });
    await replyTurn(runner().step, w.turn, understood(found), Date.now(), w.deps);
    const second = await replyTurn(runner().step, w.turn, understood(found), Date.now(), w.deps);
    expect(second.reply).toEqual({ status: "already_answered" });
    expect(w.send).toHaveBeenCalledOnce();
  });

  it("a send whose outcome is unknown counts as answered and is never sent again", async () => {
    const w = world({ send: () => ({ status: "failed", error: { code: "upstream_failed", message: "x", retryable: true, outcomeUnknown: true } }) });
    const out = await replyTurn(runner().step, w.turn, understood(found), Date.now(), w.deps);
    expect(out.reply).toEqual({ status: "sent_unknown" });
    expect(w.audits.filter((a) => a.action === "message.answered")).toHaveLength(1);
    await replyTurn(runner().step, w.turn, understood(found), Date.now(), w.deps);
    expect(w.send).toHaveBeenCalledOnce();
  });

  it("a send that failed in a way waiting can fix throws, so the step is tried again, and records nothing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const w = world({ send: () => ({ status: "failed", error: { code: "rate_limited", message: "x", retryable: true, outcomeUnknown: false } }) });
    await expect(replyTurn(runner().step, w.turn, understood(found), Date.now(), w.deps)).rejects.toThrow(/could not be sent/);
    expect(w.audits).toEqual([]);
  });

  it("a send that failed for good is not retried: not_sent, nothing recorded", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const w = world({ send: () => ({ status: "failed", error: { code: "whatsapp_not_connected", message: "x", retryable: false, outcomeUnknown: false } }) });
    expect((await replyTurn(runner().step, w.turn, understood(found), Date.now(), w.deps)).reply).toEqual({ status: "not_sent", reason: "send_failed" });
    expect(w.audits).toEqual([]);
  });

  it("the other refusals of notify.send send nothing and record nothing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    for (const reason of ["feature_off", "opted_out", "outside_window"] as const) {
      const w = world({ send: () => ({ status: "skipped", reason }) });
      expect((await replyTurn(runner().step, w.turn, understood(found), Date.now(), w.deps)).reply).toEqual({ status: "not_sent", reason });
      expect(w.audits).toEqual([]);
    }
  });

  it("the answered rows are tried again when the audit blips, and a failure there never throws (that would send the reply twice)", async () => {
    const blip = world({ auditFailures: 2 });
    await replyTurn(runner().step, blip.turn, understood(found), Date.now(), blip.deps);
    expect(blip.audits).toHaveLength(1);

    vi.spyOn(console, "error").mockImplementation(() => {});
    const down = world({ auditFailures: 99 });
    const out = await replyTurn(runner().step, down.turn, understood(found), Date.now(), down.deps);
    expect(out.reply.status).toBe("sent");
    expect(down.send).toHaveBeenCalledOnce();
  });
});

describe("failures between the steps of a handover", () => {
  it("a handover whose switch to a person failed is finished by the retry, and the event is sent again (its id makes it one event)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const w = world({ prior: [{ misses: 1 }] });
    w.state.failNext.add("setConversationMode");
    const r = runner(); // the same runner: the steps that finished are not run again, as in Inngest
    await expect(replyTurn(r.step, w.turn, understood({ outcome: "none" }), Date.now(), w.deps)).rejects.toThrow(/setConversationMode failed/);
    expect(w.handoffs).toHaveLength(1); // the row was made
    const out = await replyTurn(r.step, w.turn, understood({ outcome: "none" }), Date.now(), w.deps);
    expect(out.handoff).toMatchObject({ trigger: "kb_gap", opened: false, switched: true });
    expect(w.handoffs).toHaveLength(1);
    expect(w.conversations.get(CONV)?.mode).toBe("human");
    const events = w.sendEvent.mock.calls.map(([e]) => e);
    expect(events.length).toBe(2);
    expect(new Set(events.map((e) => e.id)).size).toBe(1);
    expect(w.send).toHaveBeenCalledOnce(); // and the customer was answered once
  });

  it("a handover whose event could not be sent is retried, so staff are told", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const w = world({ send: () => ({ status: "skipped", reason: "insufficient_credits" }) });
    w.sendEvent.mockRejectedValueOnce(new Error("queue down"));
    const r = runner();
    await expect(replyTurn(r.step, w.turn, understood(found), Date.now(), w.deps)).rejects.toThrow(/queue down/);
    const out = await replyTurn(r.step, w.turn, understood(found), Date.now(), w.deps);
    expect(out.handoff).toMatchObject({ trigger: "credits_exhausted", switched: true });
    expect(w.sendEvent).toHaveBeenCalledTimes(2);
  });
});

describe("never two replies, even when the record of the first is missing", () => {
  it("the marker on the message stops a second reply when the answered rows could not be written, and the rows are written by the next run", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const w = world({ auditFailures: 3 }); // every try for the first message fails
    await replyTurn(runner().step, w.turn, understood(found), Date.now(), w.deps);
    expect(w.audits).toEqual([]);
    expect(w.send).toHaveBeenCalledOnce();
    const again = await replyTurn(runner().step, w.turn, understood(found), Date.now(), w.deps); // a new run for the same turn
    expect(again.reply).toEqual({ status: "already_answered" });
    expect(w.send).toHaveBeenCalledOnce();
    expect(w.audits.map((a) => a.entityId)).toEqual([M1]); // the missing row is written now
  });

  it("looks once more right before the send: a run that answered while the model was thinking wins", async () => {
    const w = world();
    w.complete.mockImplementationOnce(async () => {
      w.answered.set(M1, Date.now()); // another run finishes while this one waits for the model
      return llmResult("Yes, site visits are free.");
    });
    const out = await replyTurn(runner().step, w.turn, understood(found), Date.now(), w.deps);
    expect(out.reply).toEqual({ status: "already_answered" });
    expect(w.send).not.toHaveBeenCalled();
  });
});

describe("the conversation the model sees", () => {
  it("ends with the turn's newest message: one that arrived after it is for the next turn", async () => {
    const later: FakeMessage = { id: "a0000000-0000-0000-0000-0000000000f9", tenantId: A, conversationId: CONV, direction: "in", sender: "customer", kind: "text", createdAt: at(1), body: "LATER MESSAGE", meta: {} };
    const w = world({ messages: [{ id: M1, tenantId: A, conversationId: CONV, direction: "in", sender: "customer", kind: "text", createdAt: at(3), body: CUSTOMER_WORDS, meta: { agent: { extraction: { question: QUESTION } } } }, later] });
    w.turn.messageIds = [M1];
    await replyTurn(runner().step, w.turn, understood(found), Date.now(), w.deps);
    const user = w.complete.mock.calls[0][0].messages[0].content;
    expect(user).toContain(CUSTOMER_WORDS);
    expect(user).not.toContain("LATER MESSAGE");
  });
});

describe("what the steps remember", () => {
  it("is case names, flags and ids: not the customer's words, the question, the reply or the facts (Inngest keeps every step's result)", async () => {
    const w = world({ prior: [{ misses: 1 }] });
    const r = runner();
    await replyTurn(r.step, w.turn, understood({ outcome: "none" }), Date.now(), w.deps);
    const remembered = JSON.stringify([...r.memo.values()]);
    for (const secret of [QUESTION, CUSTOMER_WORDS, "home visits", ...Object.values(HIDDEN), fixedText("handoff", "en"), fixedText("fallback", "en")]) expect(remembered, secret).not.toContain(secret);
    const answered = world();
    const r2 = runner();
    await replyTurn(r2.step, answered.turn, understood(found), Date.now(), answered.deps);
    const remembered2 = JSON.stringify([...r2.memo.values()]);
    for (const secret of [QUESTION, "2BHK starts", "site visits", "Shall we plan one"]) expect(remembered2, secret).not.toContain(secret);
  });

  it("never logs the customer's words, the reply or a phone number", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const out = vi.spyOn(console, "log").mockImplementation(() => {});
    const w = world({ script: ["₹1 for you", "₹2 for you"] });
    await replyTurn(runner().step, w.turn, understood(found), Date.now(), w.deps);
    const logged = [...log.mock.calls, ...out.mock.calls].flat().join("\n");
    for (const secret of [CUSTOMER_WORDS, "₹1 for you", "for you", HIDDEN.phone, QUESTION]) expect(logged).not.toContain(secret);
  });
});

describe("another business", () => {
  it("never reads or answers a chat of another business, even with its ids", async () => {
    const w = world();
    const turn = { ...w.turn, tenantId: "e0000000-0000-0000-0000-00000000000b" };
    const out = await replyTurn(runner().step, turn, understood(found), Date.now(), w.deps).catch((e: unknown) => e);
    // the other business has no such message: the step cannot keep anything on it and stops
    expect(out).toBeInstanceOf(NonRetriableError);
    expect(w.send).not.toHaveBeenCalled();
  });
});

describe("answerAfterFailure: when a run gave up", () => {
  const ids = { tenantId: A, conversationId: CONV, messageId: M1 };

  it("sends the safe line once, in the customer's language, and marks the messages answered", async () => {
    const w = world({ language: "ta" });
    expect(await answerAfterFailure(ids, 15_000, w.deps)).toBe("sent");
    expect(sentText(w)).toBe(fixedText("fallback", "ta"));
    expect(w.audits.map((a) => a.entityId)).toEqual([M1]);
    expect(await answerAfterFailure(ids, 15_000, w.deps)).toBe("nothing_to_do"); // safe to call twice
    expect(w.send).toHaveBeenCalledOnce();
  });

  it("does nothing for a message that was answered, a chat a person has, or a customer who opted out", async () => {
    expect(await answerAfterFailure(ids, 15_000, world({ answered: true }).deps)).toBe("nothing_to_do");
    expect(await answerAfterFailure(ids, 15_000, world({ mode: "human" }).deps)).toBe("nothing_to_do");
    expect(await answerAfterFailure(ids, 15_000, world({ optedOut: true }).deps)).toBe("nothing_to_do");
  });

  it("does nothing for a message that is not there or not the customer's, and never throws", async () => {
    const w = world();
    expect(await answerAfterFailure({ ...ids, messageId: "a0000000-0000-0000-0000-0000000000ff" }, 15_000, w.deps)).toBe("nothing_to_do");
    w.state.failNext.add("recentUnanswered");
    expect(await answerAfterFailure(ids, 15_000, w.deps)).toBe("not_sent");
  });

  it("does not mark anything answered when the send was refused (out of credits)", async () => {
    const w = world({ send: () => ({ status: "skipped", reason: "insufficient_credits" }) });
    expect(await answerAfterFailure(ids, 15_000, w.deps)).toBe("not_sent");
    expect(w.audits).toEqual([]);
  });
});
