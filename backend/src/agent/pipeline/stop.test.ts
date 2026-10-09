import { describe, expect, it, vi } from "vitest";
import type { AuditEntry } from "../../lib/audit";
import { fakePipelineStore, HIDDEN, type FakeMessage } from "../../test-support/fake-pipeline-store";
import { fixedText } from "./fixed-texts";
import type { SystemNoticePort } from "./ports";
import type { StepRunner, TurnContext } from "./process-message";
import { stopCheck, stopCheckAfterGate } from "./stop";

// STOP: a message that is one of the fixed phrases opts the contact out, gets one confirmation, marks the turn answered
// and ends the turn. Anything else goes on to be read.

const A = "e0000000-0000-0000-0000-00000000000a";
const B = "e0000000-0000-0000-0000-00000000000b";
const CONV = "c0000000-0000-0000-0000-00000000000c";
const CONTACT = "b0000000-0000-0000-0000-0000000000b1";
const M1 = "a0000000-0000-0000-0000-0000000000a1";
const M2 = "a0000000-0000-0000-0000-0000000000a2";
const M3 = "a0000000-0000-0000-0000-0000000000a3";
const at = (secondsAgo: number) => new Date(Date.now() - secondsAgo * 1000).toISOString();

function runner() {
  const memo = new Map<string, unknown>();
  const step: StepRunner = {
    async run(id, fn) {
      if (memo.has(id)) return memo.get(id) as never;
      const value = await fn();
      memo.set(id, value);
      return value;
    },
  };
  return { step, memo };
}

function world(bodies: string[], over: { mode?: "ai" | "human" | "external"; optedOut?: boolean } = {}) {
  const ids = [M1, M2, M3];
  const messages: FakeMessage[] = bodies.map((body, i) => ({ id: ids[i], tenantId: A, conversationId: CONV, direction: "in", sender: "customer", kind: "text", createdAt: at(10 - i), body, meta: {} }));
  const fake = fakePipelineStore({
    tenants: [{ id: A, vertical: "sample-pack", verticalVersion: 1 }],
    messages,
    conversations: [{ id: CONV, tenantId: A, contactId: CONTACT, mode: over.mode ?? "ai" }],
    contacts: [{ id: CONTACT, tenantId: A, language: null, optedOut: over.optedOut ?? false, consentAt: "2026-10-01T00:00:00Z" }],
  });
  const audits: AuditEntry[] = [];
  const audit = vi.fn(async (entry: AuditEntry) => void audits.push(entry));
  const systemNotice = { send: vi.fn(async (): Promise<{ status: "awaiting_notify_kind" }> => ({ status: "awaiting_notify_kind" })) };
  const sendEvent = vi.fn<(event: { id: string; name: string; data: Record<string, string> }) => Promise<undefined>>(async () => undefined);
  const deps = { store: fake.store, audit, systemNotice: systemNotice as SystemNoticePort, sendEvent };
  const turn: TurnContext = { tenantId: A, conversationId: CONV, contactId: CONTACT, leadId: "10000000-0000-0000-0000-0000000000f1", leadCreated: false, messageIds: messages.map((m) => m.id), language: null, vertical: "sample-pack", verticalVersion: 1 };
  return { ...fake, audits, audit, systemNotice, sendEvent, deps, turn };
}

describe("a message that is STOP", () => {
  it("opts the contact out, logs opted_out with the message, sends one confirmation, marks it answered, and ends the turn", async () => {
    const w = world(["STOP"]);
    const result = await stopCheck(runner().step, w.turn, w.deps);
    expect(result).toEqual({ status: "opted_out", confirmation: "awaiting_notify_kind" });
    expect(w.contacts.get(CONTACT)?.optedOut).toBe(true);
    expect(w.consentLogs).toEqual([{ tenantId: A, contactId: CONTACT, event: "opted_out", source: "stop_keyword", messageId: M1 }]);
    expect(w.systemNotice.send).toHaveBeenCalledOnce();
    expect(w.systemNotice.send).toHaveBeenCalledWith({ tenantId: A, conversationId: CONV, kind: "opt_out_confirmation", text: fixedText("opt_out_confirmation", "en") });
    expect(w.audits.filter((a) => a.action === "message.answered")).toEqual([{ tenantId: A, actor: "ai", action: "message.answered", entity: "message", entityId: M1 }]);
  });

  it("opens a high-priority opt_out handoff and sends handoff.opened once, without switching the chat to a person", async () => {
    const w = world(["STOP"]);
    await stopCheck(runner().step, w.turn, w.deps);
    expect(w.handoffs).toEqual([expect.objectContaining({ tenantId: A, conversationId: CONV, trigger: "opt_out", priority: "high" })]);
    expect(w.sendEvent).toHaveBeenCalledOnce();
    expect(w.sendEvent).toHaveBeenCalledWith({ id: `handoff_opened:${w.handoffs[0].id}`, name: "handoff.opened", data: { tenantId: A, handoffId: w.handoffs[0].id, conversationId: CONV } });
    expect(w.audits).toContainEqual({ tenantId: A, actor: "ai", action: "handoff.opened", entity: "handoff", entityId: w.handoffs[0].id, diff: { trigger: "opt_out" } });
    expect(w.conversations.get(CONV)?.mode).toBe("ai");
  });

  it("a retry of the step opens no second handoff and sends the same event id (so it is one event)", async () => {
    const w = world(["STOP"]);
    await stopCheck(runner().step, w.turn, w.deps);
    await stopCheck(runner().step, w.turn, w.deps); // a fresh runner: the step ran again
    expect(w.handoffs).toHaveLength(1);
    expect(new Set(w.sendEvent.mock.calls.map((c) => c[0].id)).size).toBe(1);
    expect(w.systemNotice.send).toHaveBeenCalledOnce(); // and still one confirmation
  });

  it("a failing handoff still marks the messages answered, then fails the step so the retry tells staff", async () => {
    const w = world(["STOP"]);
    w.state.failNext.add("openHandoff");
    await expect(stopCheck(runner().step, w.turn, w.deps)).rejects.toThrow(/openHandoff failed/);
    expect(w.contacts.get(CONTACT)?.optedOut).toBe(true);
    expect(w.systemNotice.send).toHaveBeenCalledOnce();
    expect(w.audits.filter((a) => a.action === "message.answered").map((a) => a.entityId)).toEqual([M1]);
    await stopCheck(runner().step, w.turn, w.deps); // the retry
    expect(w.handoffs).toHaveLength(1);
    expect(w.sendEvent).toHaveBeenCalledOnce();
    expect(w.systemNotice.send).toHaveBeenCalledOnce(); // never a second confirmation
  });

  it("with another handoff already open, that one is reused: no second row", async () => {
    const w = world(["STOP"]);
    w.handoffs.push({ id: "f0000000-0000-0000-0000-0000000000f1", tenantId: A, conversationId: CONV, trigger: "kb_gap", priority: "normal", resolved: false });
    await stopCheck(runner().step, w.turn, w.deps);
    expect(w.handoffs).toHaveLength(1);
    expect(w.handoffs[0].trigger).toBe("kb_gap");
  });

  it("does nothing of the kind for an ordinary message", async () => {
    const w = world(["2BHK price?"]);
    await stopCheck(runner().step, w.turn, w.deps);
    expect(w.handoffs).toHaveLength(0);
    expect(w.sendEvent).not.toHaveBeenCalled();
  });

  it.each([
    ["Tamil script", "மெசேஜ் அனுப்பாதீர்கள்", "ta"],
    ["Tanglish", "Message panna vendam", "ta-en"],
    ["Hindi", "बंद करो", "hi"],
    ["Hindi in English letters", "band karo", "hi"],
    ["English", "unsubscribe!", "en"],
  ] as const)("%s: the one confirmation is in that language", async (_name, text, language) => {
    const w = world([text]);
    expect((await stopCheck(runner().step, w.turn, w.deps)).status).toBe("opted_out");
    expect(w.systemNotice.send).toHaveBeenCalledWith(expect.objectContaining({ text: fixedText("opt_out_confirmation", language) }));
  });

  it("is a STOP wherever it is in a burst: every message of the turn is marked answered and the turn ends", async () => {
    const w = world(["hello", "stop", "2BHK price?"]);
    const result = await stopCheck(runner().step, w.turn, w.deps);
    expect(result.status).toBe("opted_out");
    expect(w.consentLogs).toEqual([expect.objectContaining({ messageId: M2 })]); // the STOP message itself
    expect(w.audits.filter((a) => a.action === "message.answered").map((a) => a.entityId)).toEqual([M1, M2, M3]);
  });

  it("sends AT MOST one confirmation and logs once, however often the turn runs", async () => {
    const w = world(["STOP"]);
    await stopCheck(runner().step, w.turn, w.deps);
    const again = await stopCheck(runner().step, w.turn, w.deps); // a new run for the same turn
    expect(again).toEqual({ status: "opted_out", confirmation: "not_needed" });
    expect(w.systemNotice.send).toHaveBeenCalledOnce();
    expect(w.consentLogs).toHaveLength(1);
  });

  it("opts the contact out even if the confirmation could not be sent", async () => {
    const w = world(["STOP"]);
    w.systemNotice.send.mockRejectedValue(new Error("down"));
    const result = await stopCheck(runner().step, w.turn, w.deps);
    expect(result).toEqual({ status: "opted_out", confirmation: "failed" });
    expect(w.contacts.get(CONTACT)?.optedOut).toBe(true);
  });

  it("never opts out another business's contact, even given its ids", async () => {
    const w = world(["STOP"]);
    const result = await stopCheck(runner().step, { ...w.turn, tenantId: B }, w.deps);
    // B has no such message: nothing was read, so nothing is a STOP
    expect(result).toEqual({ status: "continue" });
    expect(w.contacts.get(CONTACT)?.optedOut).toBe(false);
    expect(w.consentLogs).toEqual([]);
  });

  it("keeps the customer's words and the phone number out of the step result, the confirmation, the audit and the logs", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const w = world(["நிறுத்துங்கள்"]);
    const r = runner();
    await stopCheck(r.step, w.turn, w.deps);
    const everything = JSON.stringify([...r.memo.values(), w.audits, ...log.mock.calls, ...error.mock.calls]);
    expect(everything).not.toContain("நிறுத்துங்கள்");
    expect(everything).not.toContain(HIDDEN.phone);
    expect(everything).not.toContain(HIDDEN.name);
    log.mockRestore();
    error.mockRestore();
  });
});

describe("a message that is not STOP", () => {
  it.each(["bus stop near the project", "don't stop calling me", "cancel my booking", "2BHK price?", "நிறுத்து இல்லை, விலை சொல்லுங்கள்"])("%j goes on to be read", async (text) => {
    const w = world([text]);
    expect(await stopCheck(runner().step, w.turn, w.deps)).toEqual({ status: "continue" });
    expect(w.contacts.get(CONTACT)?.optedOut).toBe(false);
    expect(w.systemNotice.send).not.toHaveBeenCalled();
    expect(w.audits).toEqual([]);
    expect(w.consentLogs).toEqual([]);
  });

  it("a message with no text (a photo) goes on", async () => {
    const w = world([""]);
    w.messages.get(M1)!.body = null;
    expect(await stopCheck(runner().step, w.turn, w.deps)).toEqual({ status: "continue" });
  });
});

describe("STOP in a chat the gate turned away (a person has it, or the AI is switched off)", () => {
  const ids = { tenantId: A, conversationId: CONV, messageId: M1 };

  it.each(["human", "external"] as const)("is honoured in a %s chat: the contact is opted out and the turn is marked answered", async (mode) => {
    const w = world(["STOP"], { mode });
    const result = await stopCheckAfterGate(runner().step, ids, w.deps);
    expect(result).toEqual({ status: "opted_out", confirmation: "awaiting_notify_kind" });
    expect(w.contacts.get(CONTACT)?.optedOut).toBe(true);
    expect(w.consentLogs).toEqual([expect.objectContaining({ event: "opted_out", source: "stop_keyword", messageId: M1 })]);
    expect(w.audits.filter((a) => a.action === "message.answered").map((a) => a.entityId)).toEqual([M1]);
  });

  it("finds the burst around the message: a STOP sent after another message, both marked answered", async () => {
    const w = world(["hello", "stop"], { mode: "human" });
    expect((await stopCheckAfterGate(runner().step, { ...ids, messageId: M2 }, w.deps)).status).toBe("opted_out");
    expect(w.audits.filter((a) => a.action === "message.answered").map((a) => a.entityId).sort()).toEqual([M1, M2]);
  });

  it("does nothing for a message that is not STOP", async () => {
    const w = world(["bus stop near the project"], { mode: "human" });
    expect(await stopCheckAfterGate(runner().step, ids, w.deps)).toEqual({ status: "continue" });
    expect(w.contacts.get(CONTACT)?.optedOut).toBe(false);
    expect(w.audits).toEqual([]);
  });

  it("does nothing for a contact who has already opted out: no second confirmation", async () => {
    const w = world(["STOP"], { mode: "human", optedOut: true });
    expect(await stopCheckAfterGate(runner().step, ids, w.deps)).toEqual({ status: "continue" });
    expect(w.systemNotice.send).not.toHaveBeenCalled();
    expect(w.consentLogs).toEqual([]);
  });

  it("does nothing for another business's ids, a missing message or a message that is not the customer's", async () => {
    const w = world(["STOP"], { mode: "human" });
    expect(await stopCheckAfterGate(runner().step, { ...ids, tenantId: B }, w.deps)).toEqual({ status: "continue" });
    expect(await stopCheckAfterGate(runner().step, { ...ids, messageId: "a0000000-0000-0000-0000-0000000000ff" }, w.deps)).toEqual({ status: "continue" });
    expect(w.contacts.get(CONTACT)?.optedOut).toBe(false);
  });
});
