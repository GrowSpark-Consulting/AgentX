import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleWhatsAppVerification, verifyWebhookChallenge } from "./verify-challenge";

// serverEnv() is mocked so the default path can be tested without a real environment.
const serverEnvMock = vi.fn();
vi.mock("../../lib/env", () => ({ serverEnv: () => serverEnvMock() }));

// Synthetic values: nothing here is a real verify token.
const TOKEN = "synthetic-verify-token-0001";
const CHALLENGE = "1158201444";
const env = { META_WEBHOOK_VERIFY_TOKEN: TOKEN };

const url = (query: string) => `http://localhost:3000/api/webhooks/whatsapp${query}`;
const meta = (over: Record<string, string> = {}) => {
  const params = new URLSearchParams({
    "hub.mode": "subscribe",
    "hub.verify_token": TOKEN,
    "hub.challenge": CHALLENGE,
    ...over,
  });
  return new Request(url(`?${params}`));
};
const without = (name: string) => {
  const params = new URLSearchParams({
    "hub.mode": "subscribe",
    "hub.verify_token": TOKEN,
    "hub.challenge": CHALLENGE,
  });
  params.delete(name);
  return new Request(url(`?${params}`));
};

let logs: unknown[][];
beforeEach(() => {
  logs = [];
  serverEnvMock.mockReset();
  for (const method of ["log", "info", "warn", "error", "debug"] as const) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      logs.push(args);
    });
  }
});
afterEach(() => vi.restoreAllMocks());

const expectForbidden = async (res: Response) => {
  expect(res.status).toBe(403);
  expect(await res.text()).toBe("");
};

describe("verifyWebhookChallenge", () => {
  const q = { mode: "subscribe", token: TOKEN, challenge: CHALLENGE };

  it("returns the challenge for the right mode and token", () => {
    expect(verifyWebhookChallenge(q, TOKEN)).toBe(CHALLENGE);
  });

  it.each([
    ["a wrong token", { ...q, token: "wrong" }],
    ["a token that differs by one character", { ...q, token: `${TOKEN}x` }],
    ["a wrong mode", { ...q, mode: "unsubscribe" }],
    ["a mode in another case", { ...q, mode: "Subscribe" }],
    ["a missing mode", { ...q, mode: null }],
    ["a missing token", { ...q, token: null }],
    ["a missing challenge", { ...q, challenge: null }],
    ["an empty token", { ...q, token: "" }],
    ["an empty challenge", { ...q, challenge: "" }],
  ])("returns null for %s", (_why, query) => {
    expect(verifyWebhookChallenge(query, TOKEN)).toBeNull();
  });

  it.each([
    ["undefined", undefined],
    ["an empty string", ""],
    ["only spaces", "   "],
  ])("returns null when the configured token is %s, even if the request token is also empty", (_why, expected) => {
    expect(verifyWebhookChallenge(q, expected)).toBeNull();
    expect(verifyWebhookChallenge({ ...q, token: "" }, expected)).toBeNull();
    expect(verifyWebhookChallenge({ ...q, token: expected ?? "" }, expected)).toBeNull();
  });

  it.each([1, 3, 1000, 100_000])("does not throw on a request token of %i characters", (length) => {
    const run = () => verifyWebhookChallenge({ ...q, token: "a".repeat(length) }, TOKEN);
    expect(run).not.toThrow();
    expect(run()).toBeNull();
  });

  it("handles unicode tokens", () => {
    const unicode = "டோக்கன்-🔑-é";
    expect(verifyWebhookChallenge({ ...q, token: unicode }, unicode)).toBe(CHALLENGE);
    expect(verifyWebhookChallenge({ ...q, token: unicode }, TOKEN)).toBeNull();
  });

  it("accepts 1 to 256 printable ASCII characters as the challenge, and nothing else", () => {
    for (const ok of ["1", "abc 123", "~!@#", "x".repeat(256)]) {
      expect(verifyWebhookChallenge({ ...q, challenge: ok }, TOKEN)).toBe(ok);
    }
    for (const bad of ["x".repeat(257), "line\nbreak", "tab\there", "é", "🔑", "\u0000", "\u007f"]) {
      expect(verifyWebhookChallenge({ ...q, challenge: bad }, TOKEN)).toBeNull();
    }
  });

  it("never throws on values that are not strings", () => {
    for (const bad of [undefined, 42, {}, [], Symbol("x")]) {
      const run = () => verifyWebhookChallenge({ mode: bad, token: bad, challenge: bad } as never, bad as never);
      expect(run).not.toThrow();
      expect(run()).toBeNull();
    }
  });
});

describe("handleWhatsAppVerification", () => {
  it("answers 200 with exactly the challenge as plain text", async () => {
    const res = handleWhatsAppVerification(meta(), env);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(CHALLENGE);
    expect(res.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("reads the token from serverEnv() when no env is passed", async () => {
    serverEnvMock.mockReturnValue(env);
    const res = handleWhatsAppVerification(meta());
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(CHALLENGE);
  });

  it("works with the exact query Meta sends (the dotted parameter names)", async () => {
    const req = new Request(url(`?hub.mode=subscribe&hub.challenge=${CHALLENGE}&hub.verify_token=${TOKEN}`));
    expect(await handleWhatsAppVerification(req, env).text()).toBe(CHALLENGE);
  });

  it.each([
    ["a wrong token", () => meta({ "hub.verify_token": "wrong" })],
    ["a wrong mode", () => meta({ "hub.mode": "unsubscribe" })],
    ["a missing mode", () => without("hub.mode")],
    ["a missing token", () => without("hub.verify_token")],
    ["a missing challenge", () => without("hub.challenge")],
    ["an empty token", () => meta({ "hub.verify_token": "" })],
    ["no query at all", () => new Request(url(""))],
    ["a challenge with a control character", () => meta({ "hub.challenge": "a\nb" })],
    ["a challenge over 256 characters", () => meta({ "hub.challenge": "x".repeat(257) })],
    ["a repeated mode", () => new Request(url(`?hub.mode=subscribe&hub.mode=subscribe&hub.verify_token=${TOKEN}&hub.challenge=${CHALLENGE}`))],
    ["a repeated token", () => new Request(url(`?hub.mode=subscribe&hub.verify_token=${TOKEN}&hub.verify_token=${TOKEN}&hub.challenge=${CHALLENGE}`))],
  ])("answers 403 with an empty body for %s", async (_why, request) => {
    await expectForbidden(handleWhatsAppVerification(request(), env));
  });

  it.each([
    ["unset", {}],
    ["empty", { META_WEBHOOK_VERIFY_TOKEN: "" }],
  ])("answers 403 when the configured token is %s, even with an empty request token", async (_why, config) => {
    await expectForbidden(handleWhatsAppVerification(meta(), config));
    await expectForbidden(handleWhatsAppVerification(meta({ "hub.verify_token": "" }), config));
  });

  it("never puts the token in a response, successful or not", async () => {
    const responses = [
      handleWhatsAppVerification(meta(), env),
      handleWhatsAppVerification(meta({ "hub.verify_token": `${TOKEN}-wrong` }), env),
      handleWhatsAppVerification(meta({ "hub.mode": "nope" }), env),
      handleWhatsAppVerification(meta(), {}),
    ];
    for (const res of responses) {
      const text = await res.text();
      expect(text).not.toContain(TOKEN);
      expect(JSON.stringify([...res.headers])).not.toContain(TOKEN);
    }
  });

  it("logs nothing on any success or refusal", async () => {
    await handleWhatsAppVerification(meta(), env).text();
    await handleWhatsAppVerification(meta({ "hub.verify_token": "wrong" }), env).text();
    await handleWhatsAppVerification(meta(), {}).text();
    await handleWhatsAppVerification(new Request(url("")), env).text();
    expect(logs).toEqual([]);
  });

  it("answers 403 and logs one fixed line, with no values, when serverEnv() throws", async () => {
    serverEnvMock.mockImplementation(() => {
      throw new Error(`Invalid environment: ${TOKEN} ${CHALLENGE}`);
    });
    await expectForbidden(handleWhatsAppVerification(meta()));
    expect(logs).toEqual([["webhook verification: environment invalid"]]);
    expect(JSON.stringify(logs)).not.toContain(TOKEN);
    expect(JSON.stringify(logs)).not.toContain(CHALLENGE);
  });
});
