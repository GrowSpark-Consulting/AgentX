import type { Page, WebSocketRoute } from "@playwright/test";
import { appAlert, expect, expectNoHorizontalOverflow, mainNav, MOCK_SUPABASE_URL, SIGNED_OUT, signIn, test } from "../support/app";

// The real inbox at /dashboard/inbox, against mock-supabase.mjs (inbox@test.local has four chats in
// "Inbox Realty"). Supabase Realtime is emulated per test with page.routeWebSocket, speaking the Phoenix
// protocol realtime-js uses, so the app's real subscription code runs.

const INBOX_TENANT = "10000000-0000-0000-0000-000000000004";
const cid = (n: number) => `40000000-0000-0000-0000-00000000000${n}`;
const isMobile = (page: Page) => (page.viewportSize()?.width ?? 1440) < 720;

type Join = { topic: string; joinRef: string; accessToken: string; changes: { id: number; event: string; schema: string; table: string; filter?: string }[] };

/** Answers the realtime socket: joins succeed (or fail), and the test can push row changes. */
async function mockRealtime(page: Page, { fail = false } = {}) {
  const joins: Join[] = [];
  let socket: WebSocketRoute | undefined;
  await page.routeWebSocket(/\/realtime\/v1\/websocket/, (ws) => {
    socket = ws;
    ws.onMessage((raw) => {
      const [joinRef, ref, topic, event, payload] = JSON.parse(String(raw));
      const reply = (status: string, response: unknown) => ws.send(JSON.stringify([joinRef, ref, topic, "phx_reply", { status, response }]));
      if (event === "heartbeat" || event === "phx_leave") reply("ok", {});
      else if (event === "phx_join") {
        if (fail) return reply("error", { reason: "Unable to subscribe to changes with given parameters" });
        const changes = payload.config.postgres_changes.map((f: Omit<Join["changes"][number], "id">, i: number) => ({ ...f, id: i + 1 }));
        joins.push({ topic, joinRef, accessToken: payload.access_token, changes });
        reply("ok", { postgres_changes: changes });
      }
    });
  });
  return {
    joins,
    push(table: string, type: "INSERT" | "UPDATE", record: Record<string, unknown>) {
      const join = joins[joins.length - 1];
      const ids = join.changes.filter((c) => c.table === table && c.event === type).map((c) => c.id);
      socket!.send(JSON.stringify([null, null, join.topic, "postgres_changes", {
        ids,
        data: { type, schema: "public", table, commit_timestamp: new Date().toISOString(), columns: [], record, errors: null },
      }]));
    },
  };
}

const row = (page: Page, name: string | RegExp) => page.getByTestId("inbox").getByRole("button", { name });
const chatLog = (page: Page) => page.getByRole("log");

async function openInbox(page: Page, email = "inbox@test.local") {
  await signIn(page, email, "/dashboard/inbox");
  await expect(page).toHaveURL(/\/dashboard\/inbox/);
}

test.describe("Inbox", () => {
  test.use({ storageState: SIGNED_OUT });

  test("lists the business's chats, newest first, with AI / Needs human / Human tags", async ({ page }) => {
    await mockRealtime(page);
    await openInbox(page);
    await expect(mainNav(page).getByRole("link", { name: "Inbox", exact: true })).toHaveAttribute("aria-current", "page");

    const rows = page.locator(".app-inbox-row");
    await expect(rows).toHaveCount(4);
    await expect(rows.nth(0)).toContainText("Karthik R");
    await expect(rows.nth(0)).toContainText("Needs human");
    await expect(rows.nth(0)).toContainText("Can I talk to someone about the price?");
    await expect(rows.nth(1)).toContainText("Priya S");
    await expect(rows.nth(1)).toContainText("AI: Hi Priya!");
    await expect(rows.nth(1).locator("span").filter({ hasText: /^AI$/ })).toBeVisible();
    await expect(rows.nth(2)).toContainText("Lakshmi V");
    await expect(rows.nth(2)).toContainText("Human");
    await expect(rows.nth(2)).toContainText("Staff: Yes ma’am");
    // No name: the masked number stands in; the full number never appears.
    await expect(rows.nth(3)).toContainText("+91 90xxx xxx52");
    await expect(rows.nth(3)).toContainText("Own number");
    await expect(page.locator("body")).not.toContainText("9000000052");
    // No persona name is invented, and unread isn't faked.
    await expect(page.getByTestId("inbox")).not.toContainText("Maya");
    await expect(page.getByRole("button", { name: "Unread" })).toBeDisabled();
    await expectNoHorizontalOverflow(page);
  });

  test("opens a chat with the prototype's bubbles, labels and strips", async ({ page }) => {
    await mockRealtime(page);
    await openInbox(page);
    await row(page, /Karthik R/).click();

    const log = chatLog(page);
    await expect(log).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`chat=${cid(1)}`));
    await expect(log.getByText("TODAY")).toBeVisible();
    await expect(log.getByText("Velachery la 3BHK irukka? Ready to move venum")).toBeVisible();
    await expect(log.locator('[data-sender="customer"]').first()).toHaveCSS("align-self", "flex-start");
    const ai = log.locator('[data-sender="ai"]');
    await expect(ai).toHaveCSS("align-self", "flex-end");
    await expect(ai).toContainText(/^AI/);
    await expect(log.getByText("Handed to team · asked for a person")).toBeVisible();
    await expect(page.getByText("Needs you:")).toBeVisible();
    await expect(page.getByText("asked to talk to a person.")).toBeVisible();

    // Sending and switching aren't built yet: shown, switched off, never faked.
    const whoReplies = page.getByRole("group", { name: "Who replies" });
    await expect(whoReplies.getByRole("button", { name: "AI" })).toBeDisabled();
    await expect(whoReplies.getByRole("button", { name: "Human" })).toBeDisabled();
    await expect(page.getByRole("textbox", { name: "Message" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Send" })).toBeDisabled();
    await expectNoHorizontalOverflow(page);

    // A chat whose 24-hour window has closed, answered by staff.
    if (isMobile(page)) await page.getByRole("button", { name: "Back" }).click();
    await row(page, /Lakshmi V/).click();
    await expect(chatLog(page).locator('[data-sender="staff"]')).toContainText(/^Staff/);
    await expect(page.getByText("24-hour window closed.")).toBeVisible();
    await expect(page.getByText("Lakshmi last wrote on")).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Message" })).toHaveCount(0);
    await expect(page.getByText("A team member is replying.")).toBeVisible();
  });

  test("filters and search", async ({ page }) => {
    await mockRealtime(page);
    await openInbox(page);
    await expect(page.getByRole("button", { name: "All 4" })).toBeVisible();
    await page.getByRole("button", { name: "Needs human 1" }).click();
    await expect(page.locator(".app-inbox-row")).toHaveCount(1);
    await expect(row(page, /Karthik R/)).toBeVisible();
    await page.getByRole("button", { name: "AI handling 1" }).click();
    await expect(page.locator(".app-inbox-row")).toHaveCount(1);
    await expect(row(page, /Priya S/)).toBeVisible();
    await page.getByRole("button", { name: "All 4" }).click();
    await page.getByRole("searchbox", { name: "Search name or number" }).fill("lak");
    await expect(page.locator(".app-inbox-row")).toHaveCount(1);
    await page.getByRole("searchbox", { name: "Search name or number" }).fill("00000037");
    await expect(row(page, /Priya S/)).toBeVisible();
    await expect(page.locator(".app-inbox-row")).toHaveCount(1);
    await page.getByRole("searchbox", { name: "Search name or number" }).fill("nobody");
    await expect(page.getByText("No chats here right now.")).toBeVisible();
  });

  test("phones show one column at a time", async ({ page }) => {
    test.skip(!isMobile(page), "phone layout only");
    await mockRealtime(page);
    await openInbox(page);
    await expect(page.locator(".app-inbox-list")).toBeVisible();
    await expect(page.locator(".app-inbox-chat")).toBeHidden();
    await row(page, /Priya S/).click();
    await expect(page.locator(".app-inbox-list")).toBeHidden();
    await expect(chatLog(page)).toContainText("Hi Priya! 2BHKs on OMR start from ₹62 L.");
    await expectNoHorizontalOverflow(page);
    await page.getByRole("button", { name: "Back" }).click();
    await expect(page.locator(".app-inbox-list")).toBeVisible();
    await expect(page).not.toHaveURL(/chat=/);
  });

  test("wide screens show the list and the first chat side by side", async ({ page }) => {
    test.skip(isMobile(page), "tablet and desktop layout");
    await mockRealtime(page);
    await openInbox(page);
    await expect(page.locator(".app-inbox-list")).toBeVisible();
    await expect(chatLog(page)).toContainText("Can I talk to someone about the price?");
    await expect(page.getByRole("button", { name: "Back" })).toBeHidden();
    // The inbox fills the window; the list and the chat scroll on their own.
    const box = await page.getByTestId("inbox").boundingBox();
    expect(Math.round((box?.y ?? 0) + (box?.height ?? 0))).toBe(page.viewportSize()!.height);
  });

  test("subscribes once, as the member, to the business's own rows", async ({ page }) => {
    const realtime = await mockRealtime(page);
    await openInbox(page);
    await expect.poll(() => realtime.joins.length).toBe(1);
    const [join] = realtime.joins;
    expect(join.topic).toBe(`realtime:inbox:${INBOX_TENANT}`);
    expect(join.changes.map((c) => `${c.table}:${c.event}:${c.filter}`).sort()).toEqual(
      ["conversations", "handoffs", "messages"].flatMap((t) => [`${t}:INSERT:tenant_id=eq.${INBOX_TENANT}`, `${t}:UPDATE:tenant_id=eq.${INBOX_TENANT}`]).sort(),
    );
    // The member's JWT, not the anonymous key: Realtime applies their RLS.
    expect(JSON.parse(Buffer.from(join.accessToken.split(".")[1], "base64url").toString()).email).toBe("inbox@test.local");

    // Every read names the session's business.
    const log = await (await page.request.get(`${MOCK_SUPABASE_URL}/__mock/rest-log?email=inbox@test.local`)).json();
    const reads = (log as { table: string; query: string }[]).filter((r) => r.table === "conversations" || r.table === "messages");
    expect(reads.length).toBeGreaterThan(0);
    for (const r of reads) expect(decodeURIComponent(r.query)).toContain(`tenant_id=eq.${INBOX_TENANT}`);
  });

  test("live changes update the list and the open chat, once each, in time order", async ({ page }) => {
    const realtime = await mockRealtime(page);
    await openInbox(page);
    await row(page, /Priya S/).click();
    await expect(chatLog(page)).toContainText("Hi Priya!");
    await expect.poll(() => realtime.joins.length).toBe(1);

    const message = {
      id: "41000000-0000-0000-0000-000000000901", tenant_id: INBOX_TENANT, conversation_id: cid(2), direction: "in",
      sender: "customer", body: "Is there parking?", media: null, template_name: null, delivery_status: null,
      created_at: new Date().toISOString().replace("T", " ").replace("Z", "+00"),
    };
    realtime.push("messages", "INSERT", message);
    realtime.push("messages", "INSERT", message); // a duplicate delivery
    await expect(chatLog(page).getByText("Is there parking?")).toHaveCount(1);
    await expect(page.locator(".app-inbox-row").first()).toContainText("Priya S");
    await expect(page.locator(".app-inbox-row").first()).toContainText("Is there parking?");

    // An older message arriving late goes above it, not below.
    realtime.push("messages", "INSERT", { ...message, id: "41000000-0000-0000-0000-000000000902", body: "Sent earlier", created_at: new Date(Date.now() - 60 * 60_000).toISOString() });
    await expect(chatLog(page).getByText("Sent earlier")).toBeVisible();
    const order = await chatLog(page).locator("[data-sender]").allInnerTexts();
    expect(order.findIndex((t) => t.includes("Sent earlier"))).toBeLessThan(order.findIndex((t) => t.includes("Is there parking?")));
    await expect(page.locator(".app-inbox-row").first()).toContainText("Is there parking?");

    // A handoff opens: the chat now needs a person.
    realtime.push("handoffs", "INSERT", { id: "42000000-0000-0000-0000-000000000902", tenant_id: INBOX_TENANT, conversation_id: cid(2), trigger: "negotiation", resolved_at: null });
    await expect(page.getByText("wants to negotiate the price.")).toBeVisible();

    // Staff take over (mode change on the conversation), then the handoff is resolved.
    realtime.push("conversations", "UPDATE", { id: cid(2), tenant_id: INBOX_TENANT, mode: "human", status: "open", last_customer_msg_at: new Date().toISOString() });
    await expect(page.getByText("wants to negotiate the price.")).toBeVisible(); // an open handoff still wins
    realtime.push("handoffs", "UPDATE", { id: "42000000-0000-0000-0000-000000000902", tenant_id: INBOX_TENANT, conversation_id: cid(2), trigger: "negotiation", resolved_at: new Date().toISOString() });
    await expect(page.getByText("A team member is replying.")).toBeVisible();

    // A row for another business is ignored even if it were delivered.
    realtime.push("messages", "INSERT", { ...message, id: "41000000-0000-0000-0000-000000000903", tenant_id: "10000000-0000-0000-0000-000000000001", body: "Not yours" });
    await expect(page.getByText("Not yours")).toHaveCount(0);

    // The list (on phones, back from the chat) reflects all of it.
    if (isMobile(page)) await page.getByRole("button", { name: "Back" }).click();
    await expect(page.locator(".app-inbox-row").first()).toContainText("Is there parking?");
    await expect(page.locator(".app-inbox-row").first()).toContainText("Human");
    await expect(page.getByRole("button", { name: "Needs human 1" })).toBeVisible();
    realtime.push("handoffs", "INSERT", { id: "42000000-0000-0000-0000-000000000904", tenant_id: INBOX_TENANT, conversation_id: cid(2), trigger: "stuck", resolved_at: null });
    await expect(page.getByRole("button", { name: "Needs human 2" })).toBeVisible();
  });

  test("says so when live updates aren't connected", async ({ page }) => {
    await mockRealtime(page, { fail: true });
    await openInbox(page);
    await expect(page.getByText("Live updates aren't connected. New messages show when you refresh.")).toBeVisible();
    await expect(page.locator(".app-inbox-row")).toHaveCount(4);
    await page.getByRole("button", { name: "Refresh" }).click();
    await expect(page.locator(".app-inbox-row")).toHaveCount(4);
  });

  test("an inbox with no chats says so", async ({ page }) => {
    await mockRealtime(page);
    await openInbox(page, "owner@test.local");
    await expect(page.getByText("No conversations yet")).toBeVisible();
    await expect(page.getByText("Your first chat will open here")).toBeVisible({ visible: !isMobile(page) });
    await expect(page.locator(".app-inbox-row")).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
  });

  test("a failed read shows an error with Try again", async ({ page }) => {
    await mockRealtime(page);
    await openInbox(page, "inboxerror@test.local");
    await expect(appAlert(page)).toContainText("Couldn't load your chats");
    await expect(appAlert(page)).toContainText("Something went wrong. Try again in a moment.");
    await expect(appAlert(page)).not.toContainText(/boom|unexpected shape/);
    await expect(appAlert(page).getByRole("button", { name: "Try again" })).toBeVisible();
  });
});
