import { describe, expect, it } from "vitest";
import { parseApiUrl, parsePublicEnv } from "./env";

describe("parseApiUrl", () => {
  it("accepts the API's origin, with or without a trailing slash", () => {
    expect(parseApiUrl("https://api.pakkaagent.in")).toBe("https://api.pakkaagent.in");
    expect(parseApiUrl("http://localhost:4000/")).toBe("http://localhost:4000");
  });

  it.each([undefined, "", "api.example.test", "https://api.example.test/api", "ftp://api.example.test", "https://user:pw@api.example.test"])(
    "refuses %j, naming the variable but not the value",
    (value) => {
      expect(() => parseApiUrl(value)).toThrow(/NEXT_PUBLIC_API_URL/);
      if (value) expect(() => parseApiUrl(value)).not.toThrow(value);
    },
  );
});

describe("parsePublicEnv", () => {
  it("accepts the project's https API URL and anon key", () => {
    expect(parsePublicEnv({ NEXT_PUBLIC_SUPABASE_URL: "https://abcd.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon" })).toEqual({
      url: "https://abcd.supabase.co",
      anonKey: "anon",
    });
  });

  it("rejects a Postgres connection string without echoing it", () => {
    const value = "postgresql://postgres:p%40ss@db.abcd.supabase.co:5432/postgres";
    let message = "";
    try {
      parsePublicEnv({ NEXT_PUBLIC_SUPABASE_URL: value, NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon" });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain("NEXT_PUBLIC_SUPABASE_URL");
    expect(message).not.toContain("p%40ss");
    expect(message).not.toContain("postgres:");
  });

  it("rejects URLs with credentials and missing keys", () => {
    expect(() => parsePublicEnv({ NEXT_PUBLIC_SUPABASE_URL: "https://user:pw@abcd.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon" })).toThrow(/credentials/);
    expect(() => parsePublicEnv({ NEXT_PUBLIC_SUPABASE_URL: "https://abcd.supabase.co" })).toThrow(/NEXT_PUBLIC_SUPABASE_ANON_KEY/);
  });
});
