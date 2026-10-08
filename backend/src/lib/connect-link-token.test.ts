import { describe, expect, it } from "vitest";
import { hashConnectLinkToken, isConnectLinkToken, newConnectLinkToken } from "./connect-link-token";

describe("connect link tokens", () => {
  it("hashes like SQL's encode(sha256(convert_to(token, 'UTF8')), 'hex') (same vector as platform_admins.test.sql)", () => {
    expect(hashConnectLinkToken("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("makes 32-byte base64url tokens with the hash to store", () => {
    const a = newConnectLinkToken();
    const b = newConnectLinkToken();
    expect(a.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a.tokenHash).toBe(hashConnectLinkToken(a.token));
    expect(a.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(b.token).not.toBe(a.token);
  });

  it("recognises the token shape only", () => {
    expect(isConnectLinkToken(newConnectLinkToken().token)).toBe(true);
    for (const bad of ["", "short", "x".repeat(44), `${"x".repeat(42)}=`, `${"x".repeat(42)}/`]) {
      expect(isConnectLinkToken(bad), bad).toBe(false);
    }
  });
});
