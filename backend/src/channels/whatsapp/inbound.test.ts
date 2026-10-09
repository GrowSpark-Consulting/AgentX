import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The webhook handler's events that name only a WhatsApp business account (a template's status, a number's quality,
// an account notice), unknown fields, and what the handler waits for before it answers. The database and the queue
// are injected fakes; the real SQL is in supabase/tests. The bodies are the synthetic fixtures or built here.

const SECRET = "synthetic-meta-app-secret";
vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "synthetic-anon-key");
vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "synthetic-service-key");
vi.stubEnv("EMBEDDINGS_API_KEY", "synthetic-embeddings-key");
vi.stubEnv("ANTHROPIC_API_KEY", "synthetic-anthropic-key");
vi.stubEnv("META_WEBHOOK_VERIFY_TOKEN", "synthetic-route-token");
vi.stubEnv("META_APP_SECRET", SECRET);

const { handleWhatsAppWebhook } = await import("./inbound");
const { WebhookDbError } = await import("./inbound-db");
type Deps = Parameters<typeof handleWhatsAppWebhook>[1] & object;

const TENANT_A = "a0000000-0000-4000-8000-00000000000a";
const TENANT_B = "b0000000-0000-4000-8000-00000000000b";
const WABA = "100000000000001";
const PNID = "200000000000001";
const CONN_A = "c0000000-0000-4000-8000-0000000000a1";
const CONN_A2 = "c0000000-0000-4000-8000-0000000000a2";
const TEMPLATE_ID = "123456789012345";

const sign = (raw: Uint8Array | string) => `sha256=${createHmac("sha256", SECRET).update(raw).digest("hex")}`;
const request = (raw: string | Buffer) =>
  new Request("http://localhost:4000/api/webhooks/whatsapp", { method: "POST", body: raw, headers: { "content-type": "application/json", "x-hub-signature-256": sign(raw) } });
const fixture = (name: string) => readFileSync(new URL(`./__fixtures__/${name}.json`, import.meta.url));
const change = (field: string, value: unknown, waba = WABA) => JSON.stringify({ object: "whatsapp_business_account", entry: [{ id: waba, changes: [{ field, value }] }] });

type Conn = { id: string; tenantId: string; channelId: string; phoneNumberId: string; wabaId: string; method: string; status: string };
const conn = (over: Partial<Conn> = {}): Conn => ({ id: CONN_A, tenantId: TENANT_A, channelId: "ch1", phoneNumberId: PNID, wabaId: WABA, method: "platform", status: "active", ...over });

function fakes(over: { connections?: Conn[]; templates?: { tenantId: string; metaId: string }[]; setResult?: boolean } = {}) {
  const connections = over.connections ?? [conn()];
  const templates = over.templates ?? [{ tenantId: TENANT_A, metaId: TEMPLATE_ID }];
  const calls: string[] = [];
  const deps = {
    findConnections: vi.fn(async (ids: string[]) => (calls.push("findConnections"), connections.filter((c) => ids.includes(c.phoneNumberId)))),
    findConnectionsByWaba: vi.fn(async (ids: string[]) => (calls.push("findConnectionsByWaba"), connections.filter((c) => ids.includes(c.wabaId)))),
    storeInboundMessage: vi.fn(async () => (calls.push("store"), { conversationId: "cv", messageId: "m1", inserted: true })),
    applyMessageStatus: vi.fn(async () => (calls.push("status"), true)),
    templateBelongsToTenant: vi.fn(async (tenantId: string, metaId: string) => (calls.push("templateBelongs"), templates.some((t) => t.tenantId === tenantId && t.metaId === metaId))),
    setTemplateStatus: vi.fn(async () => (calls.push("setTemplateStatus"), over.setResult ?? true)),
    updateConnectionHealth: vi.fn(async () => void calls.push("health")),
    sendEvent: vi.fn(async () => void calls.push("send")),
  };
  return { deps: deps as unknown as Deps, mocks: deps, calls };
}

let log: ReturnType<typeof vi.spyOn>;
const logged = () => log.mock.calls.flat().join("\n");
beforeEach(() => {
  log = vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("message_template_status_update", () => {
  it("sets the status through set_template_status, for the business whose connection has that account", async () => {
    const f = fakes();
    const res = await handleWhatsAppWebhook(request(fixture("synthetic-template-approved")), f.deps);
    expect(res.status).toBe(200);
    expect(f.mocks.findConnectionsByWaba).toHaveBeenCalledWith([WABA]);
    expect(f.mocks.templateBelongsToTenant).toHaveBeenCalledWith(TENANT_A, TEMPLATE_ID);
    expect(f.mocks.setTemplateStatus).toHaveBeenCalledWith({ metaTemplateId: TEMPLATE_ID, event: "APPROVED", reason: "NONE" });
    expect(f.calls.indexOf("templateBelongs")).toBeLessThan(f.calls.indexOf("setTemplateStatus")); // ownership first
  });

  it("changes nothing for a template that is not this business's (another business has that id)", async () => {
    const f = fakes({ templates: [{ tenantId: TENANT_B, metaId: TEMPLATE_ID }] });
    const res = await handleWhatsAppWebhook(request(fixture("synthetic-template-approved")), f.deps);
    expect(res.status).toBe(200);
    expect(f.mocks.setTemplateStatus).not.toHaveBeenCalled();
    expect(logged()).toContain("templates_not_ours=1");
  });

  it("still sets a template's status when a message in the same batch fails to store (a poison message must not hold it back)", async () => {
    const f = fakes();
    f.mocks.storeInboundMessage.mockRejectedValue(new WebhookDbError("store_inbound_message", "22021"));
    const batch = JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{ id: WABA, changes: [
        { field: "messages", value: { messaging_product: "whatsapp", metadata: { phone_number_id: PNID }, messages: [{ id: "wamid.X", from: "919840012345", timestamp: "1759743000", type: "text", text: { body: "hi" } }] } },
        { field: "message_template_status_update", value: { event: "APPROVED", message_template_id: Number(TEMPLATE_ID), message_template_name: "t", reason: "NONE" } },
      ] }],
    });
    expect((await handleWhatsAppWebhook(request(batch), f.deps)).status).toBe(500); // Meta tries again; everything repeats safely
    expect(f.mocks.setTemplateStatus).toHaveBeenCalledOnce();
  });

  it("cleans and shortens Meta's reason before it is stored as the rejection reason", async () => {
    const f = fakes();
    const reason = "Bad\u0000 content \n" + "x".repeat(2000);
    await handleWhatsAppWebhook(request(change("message_template_status_update", { event: "REJECTED", message_template_id: Number(TEMPLATE_ID), message_template_name: "t", reason })), f.deps);
    const sent = (f.mocks.setTemplateStatus.mock.calls as unknown as [{ reason: string }][])[0][0];
    expect(sent.reason.length).toBeLessThanOrEqual(500);
    expect(sent.reason).not.toContain("\u0000");
    expect(sent.reason.startsWith("Bad content")).toBe(true);
  });

  it("logs and ignores an unknown template, with a 200", async () => {
    const f = fakes({ templates: [] });
    expect((await handleWhatsAppWebhook(request(fixture("synthetic-template-approved")), f.deps)).status).toBe(200);
    expect(f.mocks.setTemplateStatus).not.toHaveBeenCalled();
  });

  it("logs and ignores a status Meta added that the database does not know (the function says false), with a 200", async () => {
    const f = fakes({ setResult: false });
    expect((await handleWhatsAppWebhook(request(fixture("synthetic-template-approved")), f.deps)).status).toBe(200);
    expect(logged()).toContain("templates_set=0 templates_ignored=1 templates_not_ours=0");
  });

  it("is idempotent: the same event twice ends the same way and never errors", async () => {
    const f = fakes();
    for (let i = 0; i < 2; i++) expect((await handleWhatsAppWebhook(request(fixture("synthetic-template-approved")), f.deps)).status).toBe(200);
    expect(f.mocks.setTemplateStatus).toHaveBeenCalledTimes(2);
  });

  it("does nothing for an account that no connection of ours has, or one that is not signed by our app", async () => {
    for (const connections of [[], [conn({ method: "manual_byo" })]]) {
      const f = fakes({ connections });
      expect((await handleWhatsAppWebhook(request(fixture("synthetic-template-approved")), f.deps)).status).toBe(200);
      expect(f.mocks.templateBelongsToTenant).not.toHaveBeenCalled();
      expect(f.mocks.setTemplateStatus).not.toHaveBeenCalled();
    }
  });

  it("does not guess when one account is claimed by two businesses", async () => {
    const f = fakes({ connections: [conn(), conn({ id: CONN_A2, tenantId: TENANT_B, phoneNumberId: "200000000000002" })] });
    expect((await handleWhatsAppWebhook(request(fixture("synthetic-template-approved")), f.deps)).status).toBe(200);
    expect(f.mocks.setTemplateStatus).not.toHaveBeenCalled();
  });

  it("answers 500 when the database fails, so Meta tries again (the status is idempotent)", async () => {
    const f = fakes();
    f.mocks.setTemplateStatus.mockRejectedValueOnce(new WebhookDbError("set_template_status", "57014"));
    expect((await handleWhatsAppWebhook(request(fixture("synthetic-template-approved")), f.deps)).status).toBe(500);
  });
});

describe("phone_number_quality_update", () => {
  const body = (value: Record<string, unknown>) => request(change("phone_number_quality_update", { display_phone_number: "919840012345", ...value }));

  it("records the messaging limit on this business's connection, and logs the event by name", async () => {
    const f = fakes();
    expect((await handleWhatsAppWebhook(body({ event: "UPGRADE", current_limit: "TIER_10K" }), f.deps)).status).toBe(200);
    expect(f.mocks.updateConnectionHealth).toHaveBeenCalledWith({ tenantId: TENANT_A, connectionId: CONN_A, messagingLimit: "TIER_10K", qualityRating: undefined });
    expect(logged()).toContain(`phone_number_quality_update event=UPGRADE connection=${CONN_A} limit=TIER_10K`);
  });

  it("records a quality rating when the payload carries one", async () => {
    const f = fakes();
    await handleWhatsAppWebhook(body({ event: "DOWNGRADE", quality_rating: "YELLOW" }), f.deps);
    expect(f.mocks.updateConnectionHealth).toHaveBeenCalledWith({ tenantId: TENANT_A, connectionId: CONN_A, messagingLimit: undefined, qualityRating: "YELLOW" });
  });

  it("only logs when the payload carries neither", async () => {
    const f = fakes();
    expect((await handleWhatsAppWebhook(body({ event: "ONBOARDING" }), f.deps)).status).toBe(200);
    expect(f.mocks.updateConnectionHealth).not.toHaveBeenCalled();
    expect(logged()).toContain("event=ONBOARDING");
  });

  it("does not guess which number it is when the account has several: log only", async () => {
    const f = fakes({ connections: [conn(), conn({ id: CONN_A2, phoneNumberId: "200000000000009" })] });
    expect((await handleWhatsAppWebhook(body({ event: "UPGRADE", current_limit: "TIER_10K" }), f.deps)).status).toBe(200);
    expect(f.mocks.updateConnectionHealth).not.toHaveBeenCalled();
    expect(logged()).toContain("connection=ambiguous");
  });

  it("keeps only plain identifiers from the payload: nothing else reaches the log or the database", async () => {
    const f = fakes();
    await handleWhatsAppWebhook(body({ event: "UP GRADE <script>", current_limit: "TIER 1\nK", extra: "secret text" }), f.deps);
    expect(f.mocks.updateConnectionHealth).not.toHaveBeenCalled();
    expect(logged()).not.toMatch(/secret text|script|919840012345/);
    expect(logged()).toContain("event=unknown");
  });

  it("never logs the phone number", async () => {
    const f = fakes();
    await handleWhatsAppWebhook(body({ event: "UPGRADE", current_limit: "TIER_1K" }), f.deps);
    expect(logged()).not.toContain("919840012345");
  });
});

describe("account_update", () => {
  it("logs the event by name with the connection id, and answers 200", async () => {
    const f = fakes();
    const res = await handleWhatsAppWebhook(request(change("account_update", { phone_number: "919840012345", event: "ACCOUNT_VIOLATION" })), f.deps);
    expect(res.status).toBe(200);
    expect(logged()).toContain(`account_update event=ACCOUNT_VIOLATION connection=${CONN_A}`);
    expect(logged()).not.toContain("919840012345");
    expect(f.mocks.updateConnectionHealth).not.toHaveBeenCalled();
  });

  it("is a 200 for an account we do not know, logged with no connection", async () => {
    const f = fakes({ connections: [] });
    expect((await handleWhatsAppWebhook(request(change("account_update", { event: "VERIFIED_ACCOUNT" })), f.deps)).status).toBe(200);
    expect(logged()).toContain("connection=none");
  });
});

describe("a field we do not handle", () => {
  it("is logged by name with a count, never an error, always 200", async () => {
    const f = fakes();
    const res = await handleWhatsAppWebhook(request(fixture("synthetic-unknown-field")), f.deps);
    expect(res.status).toBe(200);
    expect(logged()).toContain("fields=future_feature_synthetic:1");
    expect(logged()).not.toMatch(/goes|nested/); // its contents are not logged
  });
});

const flush = async () => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
};

describe("what the handler waits for before it answers", () => {
  it("waits for the database store and then the queue's send, calls no network client, and uses no other dependency", async () => {
    const f = fakes();
    // Anything slow or outside would show: the network is closed, and the only things allowed to be pending are these two.
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("the webhook must not call out"));
    let releaseStore: (value: { conversationId: string; messageId: string; inserted: boolean }) => void = () => {};
    let releaseSend: () => void = () => {};
    f.mocks.storeInboundMessage.mockImplementation(() => new Promise((resolve) => (releaseStore = resolve)));
    f.mocks.sendEvent.mockImplementation(() => new Promise<undefined>((resolve) => (releaseSend = () => resolve(undefined))));

    let answered = false;
    const pending = handleWhatsAppWebhook(request(fixture("synthetic-text-message")), f.deps).then((res) => ((answered = true), res));
    await vi.waitFor(() => expect(f.mocks.storeInboundMessage).toHaveBeenCalledOnce());
    await flush();
    expect(answered).toBe(false); // waiting for the store
    expect(f.mocks.sendEvent).not.toHaveBeenCalled();

    releaseStore({ conversationId: "cv", messageId: "m1", inserted: true });
    await vi.waitFor(() => expect(f.mocks.sendEvent).toHaveBeenCalledOnce());
    await flush();
    expect(answered).toBe(false); // waiting for the send

    releaseSend();
    expect((await pending).status).toBe(200);
    expect(fetchSpy).not.toHaveBeenCalled();
    // the only dependencies it used
    expect(Object.entries(f.mocks).filter(([, m]) => m.mock.calls.length > 0).map(([name]) => name).sort()).toEqual(["findConnections", "sendEvent", "storeInboundMessage"]);
  });

  it("for a template event waits for the account lookup, the ownership check and the status function: database calls, in turn", async () => {
    const f = fakes();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("the webhook must not call out"));
    const gates = { lookup: () => {}, owns: () => {}, set: () => {} };
    f.mocks.findConnectionsByWaba.mockImplementation(() => new Promise((resolve) => (gates.lookup = () => resolve([conn()]))));
    f.mocks.templateBelongsToTenant.mockImplementation(() => new Promise((resolve) => (gates.owns = () => resolve(true))));
    f.mocks.setTemplateStatus.mockImplementation(() => new Promise((resolve) => (gates.set = () => resolve(true))));

    let answered = false;
    const pending = handleWhatsAppWebhook(request(fixture("synthetic-template-approved")), f.deps).then((res) => ((answered = true), res));
    for (const [gate, next] of [["lookup", "templateBelongsToTenant"], ["owns", "setTemplateStatus"], ["set", null]] as const) {
      await vi.waitFor(() => expect(f.mocks[gate === "lookup" ? "findConnectionsByWaba" : gate === "owns" ? "templateBelongsToTenant" : "setTemplateStatus"]).toHaveBeenCalledOnce());
      await flush();
      expect(answered).toBe(false);
      if (next) expect(f.mocks[next]).not.toHaveBeenCalled();
      gates[gate]();
    }
    expect((await pending).status).toBe(200);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(f.mocks.sendEvent).not.toHaveBeenCalled();
    expect(f.mocks.storeInboundMessage).not.toHaveBeenCalled();
  });
});
