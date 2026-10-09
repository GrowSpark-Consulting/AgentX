import type { TenantContext } from "@pakka/types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeConversationsDb } from "../test-support/fake-conversations-db";
import { setConversationMode } from "./mode";

const ctx = (role: TenantContext["role"] = "staff", tenantId = "t1"): TenantContext => ({
  user: { id: "u1", email: "staff@test.local" },
  role,
  tenant: { id: tenantId, name: "Skyline Homes", vertical: "real-estate", timezone: "Asia/Kolkata", status: "trial", planKey: "trial", trialEndsAt: null },
});
const CHAT = "40000000-0000-4000-8000-000000000001";
const OTHER_BUSINESS_CHAT = "40000000-0000-4000-8000-000000000002";
const world = (mode: "ai" | "human" | "external", hooks?: Parameters<typeof fakeConversationsDb>[1]) =>
  fakeConversationsDb(
    {
      conversations: [
        { id: CHAT, tenant_id: "t1", mode, assigned_user_id: null },
        { id: OTHER_BUSINESS_CHAT, tenant_id: "t2", mode: "ai", assigned_user_id: null },
      ],
    },
    hooks,
  );
const chat = (w: ReturnType<typeof world>, id = CHAT) => w.tables.conversations.find((c) => c.id === id);

afterEach(() => vi.restoreAllMocks());

describe("taking over (ai → human)", () => {
  it("switches the chat, assigns the staff member, records a system note and an audit entry", async () => {
    const w = world("ai");
    await expect(setConversationMode(ctx(), CHAT, { mode: "human" }, w.db)).resolves.toEqual({ mode: "human", changed: true });
    expect(chat(w)).toMatchObject({ mode: "human", assigned_user_id: "u1" });
    expect(w.tables.messages).toEqual([
      expect.objectContaining({ tenant_id: "t1", conversation_id: CHAT, direction: "out", sender: "system", body: expect.stringContaining("took over"), meta: { event: "takeover" } }),
    ]);
    // An internal note: never a delivered message, so no provider id and no status.
    expect(w.tables.messages[0]).not.toHaveProperty("provider_msg_id");
    expect(w.tables.audit_logs).toEqual([
      expect.objectContaining({ tenant_id: "t1", actor: "u1", action: "conversation.mode_changed", entity_id: CHAT, diff: { from: "ai", to: "human" } }),
    ]);
  });
});

describe("returning to the AI (human → ai)", () => {
  it("switches the chat back, clears the assignee and records the Return to AI note", async () => {
    const w = world("human");
    chat(w)!.assigned_user_id = "u9";
    await expect(setConversationMode(ctx(), CHAT, { mode: "ai" }, w.db)).resolves.toEqual({ mode: "ai", changed: true });
    expect(chat(w)).toMatchObject({ mode: "ai", assigned_user_id: null });
    expect(w.tables.messages).toEqual([expect.objectContaining({ sender: "system", body: expect.stringContaining("Returned to the AI"), meta: { event: "return_to_ai" } })]);
    expect(w.tables.audit_logs[0]).toMatchObject({ diff: { from: "human", to: "ai" } });
  });
});

describe("who may switch, and which chats", () => {
  it("is open to owner, admin and staff", async () => {
    for (const role of ["owner", "admin", "staff"] as const) {
      const w = world("ai");
      await expect(setConversationMode(ctx(role), CHAT, { mode: "human" }, w.db)).resolves.toMatchObject({ changed: true });
    }
  });

  it("never touches another business's chat: it is not found, and nothing is written", async () => {
    const w = world("ai");
    await expect(setConversationMode(ctx("owner", "t1"), OTHER_BUSINESS_CHAT, { mode: "human" }, w.db)).rejects.toMatchObject({ code: "not_found", status: 404 });
    expect(chat(w, OTHER_BUSINESS_CHAT)).toMatchObject({ mode: "ai" });
    expect(w.tables.messages).toEqual([]);
    expect(w.tables.audit_logs).toEqual([]);
  });

  it("answers a missing conversation or an id that isn't a UUID as not found", async () => {
    const w = world("ai");
    for (const id of ["40000000-0000-4000-8000-0000000000ff", "not-a-uuid"]) {
      await expect(setConversationMode(ctx(), id, { mode: "human" }, w.db)).rejects.toMatchObject({ code: "not_found" });
    }
    expect(w.tables.messages).toEqual([]);
  });
});

describe("invalid requests", () => {
  it.each([[{ mode: "external" }], [{ mode: "robot" }], [{ mode: "" }], [{}], [{ mode: "human", assign: "u2" }], [null], ["human"]])(
    "rejects %j before reading or writing anything",
    async (body) => {
      const w = world("ai");
      await expect(setConversationMode(ctx(), CHAT, body, w.db)).rejects.toMatchObject({ name: "ZodError" });
      expect(chat(w)).toMatchObject({ mode: "ai" });
      expect(w.tables.messages).toEqual([]);
    },
  );
});

describe("repeats and races", () => {
  it("does nothing, and adds no second note, when the chat is already in that mode", async () => {
    const w = world("human");
    await expect(setConversationMode(ctx(), CHAT, { mode: "human" }, w.db)).resolves.toEqual({ mode: "human", changed: false });
    expect(w.tables.messages).toEqual([]);
    expect(w.tables.audit_logs).toEqual([]);
  });

  it("a double click writes one note: the second request finds the chat already switched", async () => {
    const w = world("ai");
    await setConversationMode(ctx(), CHAT, { mode: "human" }, w.db);
    await expect(setConversationMode(ctx(), CHAT, { mode: "human" }, w.db)).resolves.toMatchObject({ changed: false });
    expect(w.tables.messages).toHaveLength(1);
  });

  it("two people switching at once: the loser writes nothing and reports no change", async () => {
    // Another person's takeover lands between this request's read and its update.
    const w = world("ai", { beforeUpdate: (table) => table === "conversations" && (chat(w)!.mode = "human") });
    await expect(setConversationMode(ctx(), CHAT, { mode: "human" }, w.db)).resolves.toEqual({ mode: "human", changed: false });
    expect(w.tables.messages).toEqual([]);
  });

  it("if the chat moved to something else meanwhile, it does not overwrite that decision", async () => {
    // Read as human; before the update lands, the owner moves the chat to their own number.
    const w = world("human", { beforeUpdate: (table) => table === "conversations" && (chat(w)!.mode = "external") });
    await expect(setConversationMode(ctx(), CHAT, { mode: "ai" }, w.db)).rejects.toMatchObject({ code: "conflict", status: 409 });
    expect(chat(w)).toMatchObject({ mode: "external" });
    expect(w.tables.messages).toEqual([]);
  });

  it("refuses to switch a chat the owner is handling from their own number", async () => {
    const w = world("external");
    for (const mode of ["ai", "human"] as const) {
      await expect(setConversationMode(ctx(), CHAT, { mode }, w.db)).rejects.toMatchObject({ code: "conflict", message: expect.stringContaining("own WhatsApp number") });
    }
    expect(chat(w)).toMatchObject({ mode: "external" });
  });
});

describe("when something can't be saved", () => {
  it("a note that can't be saved doesn't undo the switch, and the failure is logged", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const w = world("ai");
    w.fail("messages");
    await expect(setConversationMode(ctx(), CHAT, { mode: "human" }, w.db)).resolves.toEqual({ mode: "human", changed: true });
    expect(chat(w)).toMatchObject({ mode: "human" });
    expect(error).toHaveBeenCalledWith(expect.stringContaining("note was not saved"));
  });

  it("a failed switch writes no note", async () => {
    const w = world("ai");
    w.fail("conversations");
    await expect(setConversationMode(ctx(), CHAT, { mode: "human" }, w.db)).rejects.toThrow();
    expect(w.tables.messages).toEqual([]);
  });
});
