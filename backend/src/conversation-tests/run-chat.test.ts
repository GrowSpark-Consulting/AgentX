import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadChats } from "./load";
import { runChat } from "./run-chat";
import { Chat } from "./schema";

// The runner itself: a chat that is wrong must FAIL, or the suite proves nothing.

const chat = (turn: Record<string, unknown>) =>
  Chat.parse({
    name: "x",
    kb: ["2BHK starts at ₹78 lakh."],
    turns: [{ customer: "2BHK price?", mock: { extraction: { intent: "question", question: "price of a 2BHK?" }, reply: "A 2BHK starts at ₹78 lakh. Shall we visit?" }, ...turn }],
  });

describe("runChat", () => {
  it("passes a chat whose expectations are true", async () => {
    const report = await runChat(chat({ expect: { reply: { contains: ["₹78 lakh"] }, aiReplies: 1, handoff: null }, mockOnly: { case: "answered_from_kb" } }), { mode: "mock" });
    expect(report.failures).toEqual([]);
    expect(report.transcript[0]).toMatchObject({ intent: "question", planCase: "answered_from_kb", optedOut: false });
  });

  it.each([
    ["a reply that is not what was expected", { expect: { reply: { contains: ["₹79 lakh"] } } }, /should contain/],
    ["a handover that did not happen", { expect: { handoff: { trigger: "asked_human", priority: "high" } } }, /handoff/],
    ["a wrong case", { mockOnly: { case: "kb_miss" } }, /case: wanted kb_miss/],
    ["an opt-out that did not happen", { expect: { optedOut: true } }, /optedOut/],
    ["a wrong extracted intent", { expect: { extracted: { intent: "complaint" } } }, /extracted intent/],
  ])("fails %s", async (_name, turn, message) => {
    const report = await runChat(chat(turn), { mode: "mock" });
    expect(report.failures.join("\n")).toMatch(message);
  });

  it("does not check mockOnly in live mode, and refuses live mode without a client", async () => {
    await expect(runChat(chat({}), { mode: "live" })).rejects.toThrow(/live mode needs/);
  });

  it("says when the chat scripts a mocked reply that the pipeline never asked for", async () => {
    const report = await runChat(chat({ customer: "STOP", mock: { reply: ["unused"] } }), { mode: "mock" });
    expect(report.failures.join("\n")).toMatch(/more mocked reply/);
  });
});

describe("loadChats", () => {
  const dirWith = (files: Record<string, string>) => {
    const dir = mkdtempSync(join(tmpdir(), "chats-"));
    mkdirSync(join(dir, "real-estate"));
    for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, "real-estate", name), text);
    return dir;
  };

  it("loads valid chats in file-name order", () => {
    const dir = dirWith({ "b.yaml": "name: b\nturns:\n  - customer: hi\n", "a.yaml": "name: a\nturns:\n  - customer: hi\n" });
    expect(loadChats(dir).map((c) => c.chat.name)).toEqual(["a", "b"]);
  });

  it("names the file of a chat that is not valid, so a typo cannot make a test quietly pass", () => {
    expect(() => loadChats(dirWith({ "bad.yaml": "name: bad\nturns:\n  - customer: hi\n    expectt: {}\n" }))).toThrow(/real-estate\/bad\.yaml is not a valid chat/);
  });

  it("refuses a chat that says another pack than its folder", () => {
    expect(() => loadChats(dirWith({ "x.yaml": "name: x\npack: salon\nturns:\n  - customer: hi\n" }))).toThrow(/folder/);
  });
});
