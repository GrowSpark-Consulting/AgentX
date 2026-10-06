import { describe, expect, it } from "vitest";
import { parsePublicEnv } from "./env";

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
