import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { EnvError, parseServerEnv } from "./env";

const base = {
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service",
};

describe("parseServerEnv", () => {
  it("accepts the minimum local setup", () => {
    expect(parseServerEnv(base).NEXT_PUBLIC_SUPABASE_URL).toBe(
      "http://127.0.0.1:54321",
    );
  });

  it("treats empty values as unset", () => {
    expect(() =>
      parseServerEnv({ ...base, SUPABASE_SERVICE_ROLE_KEY: "" }),
    ).toThrow(EnvError);
    expect(parseServerEnv({ ...base, ANTHROPIC_API_KEY: "" }).ANTHROPIC_API_KEY)
      .toBeUndefined();
  });

  it("names the bad variable without echoing its value", () => {
    try {
      parseServerEnv({ ...base, WHATSAPP_REGISTER_PIN: "12ab-secret" });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(EnvError);
      expect((e as EnvError).message).toContain("WHATSAPP_REGISTER_PIN");
      expect((e as EnvError).message).not.toContain("12ab-secret");
    }
  });

  it("requires ENCRYPTION_KEY to be 32 bytes", () => {
    const good = randomBytes(32).toString("base64");
    const short = randomBytes(16).toString("base64");
    expect(parseServerEnv({ ...base, ENCRYPTION_KEY: good }).ENCRYPTION_KEY)
      .toBe(good);
    expect(() => parseServerEnv({ ...base, ENCRYPTION_KEY: short })).toThrow(
      /ENCRYPTION_KEY/,
    );
  });

  it("pins the Graph API version format", () => {
    expect(
      parseServerEnv({ ...base, META_GRAPH_API_VERSION: "v23.0" })
        .META_GRAPH_API_VERSION,
    ).toBe("v23.0");
    expect(() =>
      parseServerEnv({ ...base, META_GRAPH_API_VERSION: "latest" }),
    ).toThrow(/META_GRAPH_API_VERSION/);
  });
});
