import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import {
  applyConversationChange,
  applyHandoffChange,
  applyMessageToList,
  attachmentOf,
  conversationTag,
  dayChipLabel,
  fetchConversations,
  fetchMessages,
  formatListTime,
  groupByDay,
  handoffReason,
  initialsOf,
  InboxDataError,
  isWindowOpen,
  lastWrotePhrase,
  maskPhoneForDisplay,
  matchesFilter,
  matchesSearch,
  MessageRow,
  sortConversations,
  toChatMessage,
  toConversationSummary,
  ConversationListRow,
  ReadSequencer,
  upsertMessage,
  type ChatMessage,
  type ConversationSummary,
} from "./data";

const TENANT = "c0000000-0000-0000-0000-00000000000a";
const OTHER_TENANT = "c0000000-0000-0000-0000-00000000000b";
const TZ = "Asia/Kolkata";
const NOW = new Date("2026-10-07T06:30:00Z"); // 12:00 pm in Chennai, Wed 7 Oct

const id = (n: number) => `a0000000-0000-0000-0000-${String(n).padStart(12, "0")}`;

function listRow(over: Partial<ConversationListRow> = {}): ConversationListRow {
  return {
    id: id(1),
    tenant_id: TENANT,
    mode: "ai",
    status: "open",
    last_customer_msg_at: "2026-10-07T04:00:00+00:00",
    created_at: "2026-10-06T10:00:00+00:00",
    contacts: { name: "Karthik R", phone: "+919812345621", language: "ta" },
    handoffs: [],
    messages: [{ id: id(101), sender: "customer", body: "Velachery 3BHK irukka?", media: null, template_name: null, created_at: "2026-10-07T04:12:00+00:00" }],
    ...over,
  };
}

function messageRow(over: Partial<MessageRow> = {}): MessageRow {
  return {
    id: id(201),
    tenant_id: TENANT,
    conversation_id: id(1),
    direction: "in",
    sender: "customer",
    body: "Hi",
    media: null,
    template_name: null,
    delivery_status: null,
    created_at: "2026-10-07T04:12:00+00:00",
    ...over,
  };
}

const summary = (over: Partial<ConversationListRow> = {}): ConversationSummary =>
  toConversationSummary(ConversationListRow.parse(listRow(over)));
const chatMessage = (over: Partial<MessageRow> = {}): ChatMessage => toChatMessage(MessageRow.parse(messageRow(over)));

/** A chainable stand-in for the PostgREST query builder that records every call. */
function fakeClient(result: { data: unknown; error: unknown }) {
  const calls: [string, unknown[]][] = [];
  let table = "";
  const builder: Record<string, unknown> = {};
  for (const name of ["select", "eq", "is", "neq", "order", "limit"]) {
    builder[name] = (...args: unknown[]) => {
      calls.push([name, args]);
      return builder;
    };
  }
  builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
  const client = {
    from: (t: string) => {
      table = t;
      return builder;
    },
  } as unknown as SupabaseClient;
  return { client, calls, table: () => table };
}

describe("mapping rows to the inbox view model", () => {
  it("maps a conversation with its contact and latest message", () => {
    const c = summary();
    expect(c).toMatchObject({
      name: "Karthik R",
      firstName: "Karthik",
      initials: "KR",
      phoneMasked: "+91 98xxx xxx21",
      language: "Tamil",
      mode: "ai",
      openHandoffs: [],
      lastMessage: { id: id(101), sender: "customer", preview: "Velachery 3BHK irukka?", at: "2026-10-07T04:12:00.000Z" },
    });
  });

  it("never renders the full number, and falls back to it (masked) when the contact has no name", () => {
    const c = summary({ contacts: { name: null, phone: "+971501234514", language: null } });
    expect(c.name).toBe("+97xxxxxxxx14");
    expect(c.initials).toBe("#");
    expect(c.firstName).toBe("This customer");
    expect(JSON.stringify({ ...c, phoneDigits: undefined })).not.toContain("501234514");
  });

  it("prefixes previews by sender and never invents a persona or staff name", () => {
    expect(summary({ messages: [{ id: id(1), sender: "ai", body: "Hello!", media: null, template_name: null, created_at: "2026-10-07T04:12:00Z" }]}).lastMessage?.preview).toBe("AI: Hello!");
    expect(summary({ messages: [{ id: id(1), sender: "staff", body: "On my way", media: null, template_name: null, created_at: "2026-10-07T04:12:00Z" }]}).lastMessage?.preview).toBe("Staff: On my way");
    expect(summary({ messages: [{ id: id(1), sender: "staff", body: null, media: null, template_name: "reminder_24h_v1", created_at: "2026-10-07T04:12:00Z" }]}).lastMessage?.preview).toBe("Staff: Template · reminder_24h_v1");
  });

  it("has no last message when the chat has none", () => {
    expect(summary({ messages: [] }).lastMessage).toBeNull();
  });

  it("accepts Realtime's timestamp format", () => {
    const m = chatMessage({ created_at: "2026-10-07 04:12:00.123456+00" });
    expect(m.createdAt).toBe("2026-10-07T04:12:00.123Z");
  });

  it("rejects rows that aren't messages", () => {
    expect(MessageRow.safeParse({ ...messageRow(), sender: "bot" }).success).toBe(false);
    expect(MessageRow.safeParse({ ...messageRow(), created_at: "yesterday" }).success).toBe(false);
  });

  it("reads only a kind and a file name from media", () => {
    expect(attachmentOf({ kind: "document", name: "Aster brochure.pdf", url: "https://x" })).toEqual({ label: "PDF", name: "Aster brochure.pdf" });
    expect(attachmentOf({ type: "image" })).toEqual({ label: "IMG", name: "Image" });
    expect(attachmentOf(null)).toBeNull();
    expect(attachmentOf("x")).toBeNull();
  });

  it("makes initials from the first two words", () => {
    expect(initialsOf("Lakshmi")).toBe("L");
    expect(initialsOf("mohammed abdul rahim")).toBe("MA");
    expect(initialsOf("  ")).toBe("#");
  });
});

describe("AI / Needs human / Human tag", () => {
  it("is AI when the AI handles it and nothing is handed over", () => {
    expect(conversationTag(summary())).toBe("ai");
  });

  it("is Needs human whenever a handoff is open, whatever the mode", () => {
    const open = [{ id: id(301), trigger: "asked_human" }];
    expect(conversationTag(summary({ handoffs: open }))).toBe("needs_human");
    expect(conversationTag(summary({ mode: "human", handoffs: open }))).toBe("needs_human");
  });

  it("follows the conversation's own mode otherwise", () => {
    expect(conversationTag(summary({ mode: "human" }))).toBe("human");
    expect(conversationTag(summary({ mode: "external" }))).toBe("external");
  });

  it("filters like the prototype chips", () => {
    const ai = summary({ id: id(1) });
    const waiting = summary({ id: id(2), handoffs: [{ id: id(301), trigger: "complaint" }] });
    const human = summary({ id: id(3), mode: "human" });
    const all = [ai, waiting, human];
    expect(all.filter((c) => matchesFilter(c, "all"))).toHaveLength(3);
    expect(all.filter((c) => matchesFilter(c, "ai")).map((c) => c.id)).toEqual([id(1)]);
    expect(all.filter((c) => matchesFilter(c, "needs_human")).map((c) => c.id)).toEqual([id(2)]);
  });

  it("explains why a chat was handed over", () => {
    expect(handoffReason("asked_human")).toBe("asked to talk to a person");
    expect(handoffReason("custom_itinerary")).toBe("custom itinerary");
    expect(handoffReason(undefined)).toBe("handed to your team");
  });
});

describe("search", () => {
  it("matches a name or digits of the number", () => {
    const c = summary();
    expect(matchesSearch(c, "karth")).toBe(true);
    expect(matchesSearch(c, "45621")).toBe(true);
    expect(matchesSearch(c, "priya")).toBe(false);
    expect(matchesSearch(c, "  ")).toBe(true);
  });
});

describe("ordering and live updates", () => {
  const older = summary({ id: id(1), messages: [{ id: id(101), sender: "customer", body: "old", media: null, template_name: null, created_at: "2026-10-07T03:00:00Z" }] });
  const newer = summary({ id: id(2), messages: [{ id: id(102), sender: "customer", body: "new", media: null, template_name: null, created_at: "2026-10-07T05:00:00Z" }] });
  const empty = summary({ id: id(3), messages: [], created_at: "2026-10-07T04:00:00Z" });

  it("sorts by latest message, falling back to when the chat was created", () => {
    expect(sortConversations([older, empty, newer]).map((c) => c.id)).toEqual([id(2), id(3), id(1)]);
  });

  it("moves a chat to the top when a newer message arrives", () => {
    const next = applyMessageToList([newer, older], chatMessage({ id: id(500), conversation_id: id(1), created_at: "2026-10-07T06:00:00Z", body: "latest" }));
    expect(next?.map((c) => c.id)).toEqual([id(1), id(2)]);
    expect(next?.[0].lastMessage?.preview).toBe("latest");
    expect(next?.[0].lastCustomerMsgAt).toBe("2026-10-07T06:00:00.000Z");
  });

  it("ignores an older message arriving late (order is by created_at, not arrival)", () => {
    const list = [newer, older];
    const next = applyMessageToList(list, chatMessage({ id: id(501), conversation_id: id(2), created_at: "2026-10-07T01:00:00Z", body: "late" }));
    expect(next?.find((c) => c.id === id(2))?.lastMessage?.preview).toBe("new");
  });

  it("keeps system notes out of the preview", () => {
    const next = applyMessageToList([newer], chatMessage({ id: id(502), conversation_id: id(2), sender: "system", created_at: "2026-10-07T06:00:00Z", body: "Handed to team" }));
    expect(next?.[0].lastMessage?.preview).toBe("new");
  });

  it("asks for a refetch when the chat isn't loaded yet", () => {
    expect(applyMessageToList([older], chatMessage({ conversation_id: id(9) }))).toBeNull();
    expect(applyConversationChange([older], { id: id(9), tenant_id: TENANT, mode: "ai", status: "open", last_customer_msg_at: null })).toBeNull();
    expect(applyHandoffChange([older], { id: id(301), tenant_id: TENANT, conversation_id: id(9), trigger: "stuck", resolved_at: null })).toBeNull();
  });

  it("updates mode and the 24-hour window from a conversation change", () => {
    const next = applyConversationChange([older], { id: id(1), tenant_id: TENANT, mode: "human", status: "open", last_customer_msg_at: "2026-10-07T06:00:00.000Z" });
    expect(next?.[0]).toMatchObject({ mode: "human", lastCustomerMsgAt: "2026-10-07T06:00:00.000Z" });
  });

  it("opens and resolves handoffs", () => {
    const opened = applyHandoffChange([older], { id: id(301), tenant_id: TENANT, conversation_id: id(1), trigger: "complaint", resolved_at: null })!;
    expect(conversationTag(opened[0])).toBe("needs_human");
    const again = applyHandoffChange(opened, { id: id(301), tenant_id: TENANT, conversation_id: id(1), trigger: "complaint", resolved_at: null })!;
    expect(again[0].openHandoffs).toHaveLength(1);
    const resolved = applyHandoffChange(again, { id: id(301), tenant_id: TENANT, conversation_id: id(1), trigger: "complaint", resolved_at: "2026-10-07T06:10:00.000Z" })!;
    expect(conversationTag(resolved[0])).toBe("ai");
  });

  it("de-duplicates messages by id and sorts them by created_at", () => {
    const a = chatMessage({ id: id(1), created_at: "2026-10-07T04:00:00Z", body: "first" });
    const b = chatMessage({ id: id(2), created_at: "2026-10-07T05:00:00Z", body: "second" });
    let msgs = upsertMessage([], b);
    msgs = upsertMessage(msgs, a);
    msgs = upsertMessage(msgs, { ...b, deliveryStatus: "read" });
    expect(msgs.map((m) => m.body)).toEqual(["first", "second"]);
    expect(msgs[1].deliveryStatus).toBe("read");
  });
});

describe("times in the business's time zone", () => {
  it("formats the list time like the prototype", () => {
    expect(formatListTime("2026-10-07T04:12:00Z", NOW, TZ)).toBe("9:42 am");
    expect(formatListTime("2026-10-06T10:00:00Z", NOW, TZ)).toBe("Yesterday");
    expect(formatListTime("2026-10-05T10:00:00Z", NOW, TZ)).toBe("Mon");
    expect(formatListTime("2026-09-20T10:00:00Z", NOW, TZ)).toBe("20 Sept");
  });

  it("uses the business's calendar day, not UTC's", () => {
    // 19:00 UTC on the 6th is 00:30 on the 7th in Chennai: today, not yesterday.
    expect(formatListTime("2026-10-06T19:00:00Z", NOW, TZ)).toBe("12:30 am");
    expect(formatListTime("2026-10-06T19:00:00Z", NOW, "UTC")).toBe("Yesterday");
  });

  it("labels day chips and groups messages under them", () => {
    expect(dayChipLabel("2026-10-07T04:12:00Z", NOW, TZ)).toBe("TODAY");
    expect(dayChipLabel("2026-10-06T04:12:00Z", NOW, TZ)).toBe("YESTERDAY");
    expect(dayChipLabel("2026-10-04T04:12:00Z", NOW, TZ)).toBe("SUNDAY");
    const groups = groupByDay(
      [
        chatMessage({ id: id(1), created_at: "2026-10-06T04:00:00Z" }),
        chatMessage({ id: id(2), created_at: "2026-10-07T04:00:00Z" }),
        chatMessage({ id: id(3), created_at: "2026-10-07T05:00:00Z" }),
      ],
      NOW,
      TZ,
    );
    expect(groups.map((g) => [g.label, g.messages.length])).toEqual([["YESTERDAY", 1], ["TODAY", 2]]);
  });

  it("knows when the 24-hour window is open", () => {
    expect(isWindowOpen("2026-10-06T07:00:00Z", NOW)).toBe(true);
    expect(isWindowOpen("2026-10-06T06:00:00Z", NOW)).toBe(false);
    expect(isWindowOpen(null, NOW)).toBe(false);
    expect(lastWrotePhrase("2026-10-05T04:00:00Z", NOW, TZ)).toBe("on Monday");
  });
});

describe("reads", () => {
  it("reads conversations for the session's tenant only, with open handoffs and the latest non-system message", async () => {
    const { client, calls, table } = fakeClient({ data: [listRow()], error: null });
    const list = await fetchConversations(client, TENANT);
    expect(table()).toBe("conversations");
    expect(calls).toContainEqual(["eq", ["tenant_id", TENANT]]);
    expect(calls).toContainEqual(["is", ["handoffs.resolved_at", null]]);
    expect(calls).toContainEqual(["neq", ["messages.sender", "system"]]);
    expect(calls).toContainEqual(["limit", [1, { referencedTable: "messages" }]]);
    expect(list.map((c) => c.id)).toEqual([id(1)]);
  });

  it("drops a row from another business even if one came back", async () => {
    const { client } = fakeClient({ data: [listRow(), listRow({ id: id(2), tenant_id: OTHER_TENANT })], error: null });
    expect((await fetchConversations(client, TENANT)).map((c) => c.id)).toEqual([id(1)]);
  });

  it("reads one chat's messages for the tenant, newest page first, shown oldest first", async () => {
    const rows = [
      messageRow({ id: id(2), created_at: "2026-10-07T05:00:00Z", body: "second" }),
      messageRow({ id: id(1), created_at: "2026-10-07T04:00:00Z", body: "first" }),
    ];
    const { client, calls, table } = fakeClient({ data: rows, error: null });
    const messages = await fetchMessages(client, TENANT, id(1));
    expect(table()).toBe("messages");
    expect(calls).toContainEqual(["eq", ["tenant_id", TENANT]]);
    expect(calls).toContainEqual(["eq", ["conversation_id", id(1)]]);
    expect(messages.map((m) => m.body)).toEqual(["first", "second"]);
  });

  it("passes database errors on and rejects rows of the wrong shape", async () => {
    const pgError = { code: "42501", message: "permission denied", details: null, hint: null };
    await expect(fetchConversations(fakeClient({ data: null, error: pgError }).client, TENANT)).rejects.toBe(pgError);
    await expect(fetchMessages(fakeClient({ data: [{ id: "nope" }], error: null }).client, TENANT, id(1))).rejects.toBeInstanceOf(InboxDataError);
  });

  it("treats no rows as an empty inbox", async () => {
    expect(await fetchConversations(fakeClient({ data: [], error: null }).client, TENANT)).toEqual([]);
  });
});

describe("display masking", () => {
  it("masks numbers for display", () => {
    expect(maskPhoneForDisplay("+919812345621")).toBe("+91 98xxx xxx21");
    expect(maskPhoneForDisplay("12345")).toBe("Hidden number");
  });
});

describe("overlapping reads", () => {
  it("uses only the newest read, so an older one finishing late can't overwrite it", () => {
    const reads = new ReadSequencer<string[]>();
    const first = reads.start();
    const second = reads.start();
    expect(reads.finish(second, ["new"])).toEqual(["new"]);
    expect(reads.finish(first, ["old"])).toBeNull();
    expect(reads.fail(first)).toBe(false);
  });

  it("replays live changes that arrived while the read was in flight", () => {
    const reads = new ReadSequencer<string[]>();
    reads.record((v) => [...v, "before any read"]); // nothing in flight: not kept
    const seq = reads.start();
    reads.record((v) => [...v, "live"]);
    expect(reads.finish(seq, ["snapshot"])).toEqual(["snapshot", "live"]);
    // The next read starts clean.
    const next = reads.start();
    expect(reads.finish(next, ["again"])).toEqual(["again"]);
  });

  it("drops pending changes when the newest read fails", () => {
    const reads = new ReadSequencer<string[]>();
    const seq = reads.start();
    reads.record((v) => [...v, "live"]);
    expect(reads.fail(seq)).toBe(true);
    const next = reads.start();
    expect(reads.finish(next, ["fresh"])).toEqual(["fresh"]);
  });

  it("keeps a live message when a chat read's snapshot predates it", () => {
    const reads = new ReadSequencer<ChatMessage[]>();
    const seq = reads.start();
    const live = chatMessage({ id: id(9), created_at: "2026-10-07T06:00:00Z", body: "arrived during the read" });
    reads.record((msgs) => upsertMessage(msgs, live));
    const snapshot = [chatMessage({ id: id(1), created_at: "2026-10-07T05:00:00Z", body: "older" })];
    expect(reads.finish(seq, snapshot)?.map((m) => m.body)).toEqual(["older", "arrived during the read"]);
  });
});
