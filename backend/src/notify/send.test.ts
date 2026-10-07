import { beforeEach, describe, expect, it, vi } from "vitest";

type RpcResult = { data: unknown; error: { code?: string; message: string } | null };
const rpcHandlers: Record<string, (args: Record<string, unknown>) => RpcResult> = {};
const rpc = vi.fn(async (fn: string, args: Record<string, unknown>) => rpcHandlers[fn](args));
const isEnabled = vi.fn(async () => true);
vi.mock("../lib/supabase-admin", () => ({ supabaseAdmin: () => ({ rpc }) }));
vi.mock("../features/is-enabled", () => ({ isEnabled }));

const { send, TEST_MESSAGES_PER_HOUR } = await import("./send");
const { OutsideWindowError, registerSender } = await import("./sender");

const TENANT = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const CONVERSATION = "3f2a1b4c-5d6e-4f70-8a91-b2c3d4e5f601";
const STAFF = "16fd2706-8baf-433b-82eb-8c7fada847da";
const target = (over: Record<string, unknown> = {}) => ({
  connection_id: "1b4e28ba-2fa1-41d2-883f-0016d3cca427",
  conversation_id: CONVERSATION,
  contact_id: "6fa459ea-ee8a-4ca4-894e-db77e160355e",
  to_phone: "+919840012345",
  opted_out: false,
  last_customer_msg_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(), // 1 hour ago
  language: "en",
  recent_test_messages: 0,
  ...over,
});
const ok = (data: unknown): RpcResult => ({ data, error: null });
const calls = (fn: string) => rpc.mock.calls.filter(([name]) => name === fn).map(([, args]) => args);

const sender = { sendText: vi.fn(), sendTemplate: vi.fn() };

beforeEach(() => {
  rpc.mockClear();
  isEnabled.mockReset().mockResolvedValue(true);
  sender.sendText.mockReset().mockResolvedValue({ providerMsgId: "wamid.text" });
  sender.sendTemplate.mockReset().mockResolvedValue({ providerMsgId: "wamid.tpl" });
  registerSender(async () => sender);
  rpcHandlers.notify_target = () => ok([target()]);
  rpcHandlers.notify_template = () => ok([{ name: "reminder_24h_v2", language: "en", category: "utility" }]);
  rpcHandlers.notify_record = () => ok(null);
  rpcHandlers.spend_credits = () => ok(true);
  rpcHandlers.refund_credits = () => ok(1);
});

describe("test_message", () => {
  const payload = { to: "+919840012345", text: "Hello from Spark Agent", actorId: STAFF };

  it("sends free text inside the window for 0 credits and records it in messages and audit_logs", async () => {
    const outcome = await send(TENANT, "test_message", payload);
    expect(outcome).toMatchObject({ status: "sent", providerMsgId: "wamid.text", creditsCharged: 0, usedTemplate: false });
    expect(sender.sendText).toHaveBeenCalledWith("+919840012345", "Hello from Spark Agent");
    expect(calls("spend_credits")).toHaveLength(0);
    expect(calls("notify_record")[0]).toMatchObject({ p_sender: "staff", p_actor: STAFF, p_kind: "test_message", p_credits: 0 });
  });

  it("refuses outside the 24-hour window instead of sending", async () => {
    rpcHandlers.notify_target = () => ok([target({ last_customer_msg_at: null })]);
    await expect(send(TENANT, "test_message", payload)).resolves.toEqual({ status: "skipped", reason: "outside_window" });
    expect(sender.sendText).not.toHaveBeenCalled();
  });

  it(`allows ${TEST_MESSAGES_PER_HOUR} an hour per business`, async () => {
    rpcHandlers.notify_target = () => ok([target({ recent_test_messages: TEST_MESSAGES_PER_HOUR })]);
    await expect(send(TENANT, "test_message", payload)).resolves.toMatchObject({ status: "failed", error: { code: "rate_limited" } });
    expect(sender.sendText).not.toHaveBeenCalled();
  });

  it("reports a business with no connected number", async () => {
    rpcHandlers.notify_target = () => ({ data: null, error: { code: "PA409", message: "no active WhatsApp connection" } });
    await expect(send(TENANT, "test_message", payload)).resolves.toMatchObject({
      status: "failed",
      error: { code: "whatsapp_not_connected" },
    });
  });
});

describe("customer messages", () => {
  it("skips a kind whose feature is off without looking anything up", async () => {
    isEnabled.mockResolvedValue(false);
    await expect(send(TENANT, "ai_reply", { conversationId: CONVERSATION, text: "Hi" })).resolves.toEqual({
      status: "skipped",
      reason: "feature_off",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("never messages a contact who opted out", async () => {
    rpcHandlers.notify_target = () => ok([target({ opted_out: true })]);
    await expect(send(TENANT, "ai_reply", { conversationId: CONVERSATION, text: "Hi" })).resolves.toEqual({
      status: "skipped",
      reason: "opted_out",
    });
  });

  it("charges an AI reply 1 credit, with the message id as ref_id", async () => {
    const outcome = await send(TENANT, "ai_reply", { conversationId: CONVERSATION, text: "Aster 3BHKs start at ₹88 L." });
    expect(outcome).toMatchObject({ status: "sent", creditsCharged: 1, usedTemplate: false });
    if (outcome.status !== "sent") throw new Error("not sent");
    expect(calls("spend_credits")[0]).toMatchObject({ p_amount: 1, p_reason: "ai_reply", p_ref_id: outcome.messageId });
    expect(calls("notify_record")[0]).toMatchObject({ p_message_id: outcome.messageId, p_sender: "ai", p_actor: "ai", p_credits: 1 });
  });

  it("does not send when the business is out of credits", async () => {
    rpcHandlers.spend_credits = () => ok(false);
    await expect(send(TENANT, "ai_reply", { conversationId: CONVERSATION, text: "Hi" })).resolves.toEqual({
      status: "skipped",
      reason: "insufficient_credits",
    });
    expect(sender.sendText).not.toHaveBeenCalled();
  });

  it("refunds the credits when WhatsApp rejects the message", async () => {
    sender.sendText.mockRejectedValue(new Error("131026 undeliverable"));
    const outcome = await send(TENANT, "ai_reply", { conversationId: CONVERSATION, text: "Hi" });
    expect(outcome).toMatchObject({ status: "failed", error: { code: "upstream_failed" } });
    const spent = calls("spend_credits")[0];
    expect(calls("refund_credits")[0]).toMatchObject({ p_tenant_id: TENANT, p_ref_id: spent.p_ref_id });
    expect(calls("notify_record")).toHaveLength(0);
  });

  it("skips and refunds an AI reply when WhatsApp says the window has closed", async () => {
    sender.sendText.mockRejectedValue(new OutsideWindowError());
    await expect(send(TENANT, "ai_reply", { conversationId: CONVERSATION, text: "Hi" })).resolves.toEqual({
      status: "skipped",
      reason: "outside_window",
    });
    expect(calls("refund_credits")).toHaveLength(1);
    expect(calls("notify_record")).toHaveLength(0);
  });

  it("sends the template instead when the window closes during a free-text send", async () => {
    sender.sendText.mockRejectedValue(new OutsideWindowError());
    rpcHandlers.notify_template = () => ok([{ name: "booking_confirmed_v1", language: "en", category: "utility" }]);
    const outcome = await send(TENANT, "booking_confirmation", {
      conversationId: CONVERSATION,
      text: "See you at 4 pm.",
      templateParams: ["4 pm"],
    });
    expect(outcome).toMatchObject({ status: "sent", usedTemplate: true, creditsCharged: 1 });
    expect(sender.sendTemplate).toHaveBeenCalledWith("+919840012345", "booking_confirmed_v1", "en", ["4 pm"]);
    const [first, second] = calls("spend_credits");
    expect(calls("refund_credits")).toEqual([expect.objectContaining({ p_ref_id: first.p_ref_id })]);
    expect(calls("notify_record")).toEqual([
      expect.objectContaining({ p_message_id: second.p_ref_id, p_template_name: "booking_confirmed_v1", p_body: null }),
    ]);
  });

  it("does not retry when a template send is refused", async () => {
    sender.sendTemplate.mockRejectedValue(new OutsideWindowError());
    const outcome = await send(TENANT, "reminder_24h", { conversationId: CONVERSATION, templateParams: ["4 pm"] });
    expect(outcome).toMatchObject({ status: "failed", error: { code: "upstream_failed" } });
    expect(sender.sendTemplate).toHaveBeenCalledTimes(1);
    expect(calls("refund_credits")).toHaveLength(1);
  });

  it("sends the approved template outside the window and charges by its category", async () => {
    rpcHandlers.notify_target = () => ok([target({ last_customer_msg_at: null, language: "ta" })]);
    rpcHandlers.notify_template = () => ok([{ name: "nudge_v1", language: "en", category: "marketing" }]);
    const outcome = await send(TENANT, "followup_nudge", { conversationId: CONVERSATION, templateParams: ["Priya"] });
    expect(outcome).toMatchObject({ status: "sent", usedTemplate: true, creditsCharged: 1 });
    expect(calls("notify_template")[0]).toMatchObject({ p_base_name: "nudge", p_language: "ta" });
    expect(sender.sendTemplate).toHaveBeenCalledWith("+919840012345", "nudge_v1", "en", ["Priya"]);
    expect(calls("spend_credits")[0]).toMatchObject({ p_reason: "template_marketing" });
  });

  it("uses a template even inside the window when the job gives no free text", async () => {
    const outcome = await send(TENANT, "reminder_24h", { conversationId: CONVERSATION, templateParams: ["4 pm"] });
    expect(outcome).toMatchObject({ status: "sent", usedTemplate: true });
    expect(calls("spend_credits")[0]).toMatchObject({ p_reason: "template_utility" });
  });

  it("skips outside the window when no approved template exists", async () => {
    rpcHandlers.notify_target = () => ok([target({ last_customer_msg_at: null })]);
    rpcHandlers.notify_template = () => ok([]);
    await expect(send(TENANT, "reminder_24h", { conversationId: CONVERSATION, templateParams: [] })).resolves.toEqual({
      status: "skipped",
      reason: "outside_window",
    });
    expect(calls("spend_credits")).toHaveLength(0);
  });

  it("keeps staff replies free and records the staff member", async () => {
    await expect(send(TENANT, "staff_reply", { conversationId: CONVERSATION, text: "Hi", actorId: STAFF })).resolves.toMatchObject({
      status: "sent",
      creditsCharged: 0,
    });
    expect(calls("spend_credits")).toHaveLength(0);
    expect(calls("notify_record")[0]).toMatchObject({ p_sender: "staff", p_actor: STAFF });
  });
});

describe("before the adapter exists", () => {
  it("answers not_available before spending anything", async () => {
    registerSender(undefined);
    await expect(send(TENANT, "ai_reply", { conversationId: CONVERSATION, text: "Hi" })).resolves.toMatchObject({
      status: "failed",
      error: { code: "not_available" },
    });
    expect(calls("spend_credits")).toHaveLength(0);
  });
});
