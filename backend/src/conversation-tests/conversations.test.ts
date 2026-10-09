import { describe, expect, it } from "vitest";
import { loadChats } from "./load";
import { runChat } from "./run-chat";

// The scripted chats (tests/conversations) in mock mode: the models are scripted by the chats, so this checks the code
// around them (what is extracted and kept, the action, the post-check, the fallback, the consent notice, STOP, the
// handovers). Real models are only used by `pnpm test:conversations -- --live`, never here.

const chats = loadChats();

describe("the scripted conversations", () => {
  it("has chats to run", () => {
    expect(chats.length).toBeGreaterThanOrEqual(5);
  });

  it("has unique names", () => {
    expect(new Set(chats.map((c) => c.chat.name)).size).toBe(chats.length);
  });

  it.each(chats.map((c) => [c.file, c] as const))("%s", async (_file, { chat }) => {
    const report = await runChat(chat, { mode: "mock" });
    expect(report.failures).toEqual([]);
  });
});
