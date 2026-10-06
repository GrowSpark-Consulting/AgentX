import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { verifySignature } from "./signature";

// Synthetic values only. Nothing here is a real app secret or a real Meta payload.
const SECRET = "synthetic-app-secret-do-not-use";
const BODY = JSON.stringify({ object: "whatsapp_business_account", entry: [{ id: "100" }] });

const sign = (body: string | Uint8Array, secret = SECRET) =>
  `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

afterEach(() => vi.restoreAllMocks());

describe("verifySignature", () => {
  it("accepts a valid signature", () => {
    expect(verifySignature(BODY, sign(BODY), SECRET)).toBe(true);
  });

  it("accepts the same bytes as a string, a Buffer or a Uint8Array", () => {
    const header = sign(BODY);
    expect(verifySignature(Buffer.from(BODY), header, SECRET)).toBe(true);
    expect(verifySignature(new TextEncoder().encode(BODY), header, SECRET)).toBe(true);
  });

  it("accepts an uppercase hex digest", () => {
    const header = `sha256=${sign(BODY).slice(7).toUpperCase()}`;
    expect(verifySignature(BODY, header, SECRET)).toBe(true);
  });

  it("rejects a tampered body", () => {
    expect(verifySignature(`${BODY} `, sign(BODY), SECRET)).toBe(false);
    expect(verifySignature(BODY.replace("100", "101"), sign(BODY), SECRET)).toBe(false);
  });

  it("rejects the same JSON re-serialised with different whitespace", () => {
    const pretty = JSON.stringify(JSON.parse(BODY), null, 2);
    expect(verifySignature(pretty, sign(BODY), SECRET)).toBe(false);
  });

  it("rejects a wrong secret", () => {
    expect(verifySignature(BODY, sign(BODY, "another-secret"), SECRET)).toBe(false);
    expect(verifySignature(BODY, sign(BODY), "another-secret")).toBe(false);
  });

  it("rejects an empty secret", () => {
    expect(verifySignature(BODY, sign(BODY, ""), "")).toBe(false);
  });

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["an empty string", ""],
    ["no prefix", sign(BODY).slice(7)],
    ["a sha1 prefix", sign(BODY).replace("sha256", "sha1")],
    ["an uppercase scheme", sign(BODY).replace("sha256", "SHA256")],
    ["a digest that is too short", sign(BODY).slice(0, -2)],
    ["a digest that is too long", `${sign(BODY)}00`],
    ["non-hex characters", `sha256=${"z".repeat(64)}`],
    ["extra text after the digest", `${sign(BODY)} extra`],
  ])("rejects a header with %s", (_why, header) => {
    expect(verifySignature(BODY, header, SECRET)).toBe(false);
  });

  it("verifies unicode bodies byte for byte", () => {
    const body = JSON.stringify({ text: { body: "வணக்கம் 🙏 café — ₹1,499" } });
    expect(verifySignature(body, sign(body), SECRET)).toBe(true);
    expect(verifySignature(Buffer.from(body, "utf8"), sign(body), SECRET)).toBe(true);
    expect(verifySignature(body.replace("café", "cafe"), sign(body), SECRET)).toBe(false);
  });

  it("verifies an empty body", () => {
    expect(verifySignature("", sign(""), SECRET)).toBe(true);
    expect(verifySignature(new Uint8Array(0), sign(""), SECRET)).toBe(true);
  });

  it("never throws on odd input and returns false", () => {
    const odd: unknown[] = [undefined, null, 42, {}, [], Symbol("x"), () => 1, NaN];
    for (const value of odd) {
      expect(() => verifySignature(value as never, sign(BODY), SECRET)).not.toThrow();
      expect(verifySignature(value as never, sign(BODY), SECRET)).toBe(false);
      expect(() => verifySignature(BODY, value as never, SECRET)).not.toThrow();
      expect(verifySignature(BODY, value as never, SECRET)).toBe(false);
      expect(() => verifySignature(BODY, sign(BODY), value as never)).not.toThrow();
      expect(verifySignature(BODY, sign(BODY), value as never)).toBe(false);
    }
  });

  it("returns only a boolean and writes nothing to the console, whatever the outcome", () => {
    const calls: unknown[][] = [];
    for (const method of ["log", "info", "warn", "error", "debug"] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        calls.push(args);
      });
    }
    const results = [
      verifySignature(BODY, sign(BODY), SECRET),
      verifySignature(BODY, sign(BODY, "x"), SECRET),
      verifySignature(BODY, "garbage", SECRET),
      verifySignature(BODY, undefined, SECRET),
      verifySignature({} as never, sign(BODY), SECRET),
    ];
    for (const result of results) {
      expect(typeof result).toBe("boolean");
      expect(JSON.stringify(result)).not.toContain(SECRET);
      expect(JSON.stringify(result)).not.toContain(BODY);
    }
    expect(calls).toEqual([]);
  });
});
