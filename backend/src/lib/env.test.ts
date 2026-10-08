import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { EnvError, parseServerEnv } from "./env";

const base = {
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service",
  EMBEDDINGS_API_KEY: "test-embeddings-key",
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

  it("refuses a Postgres connection string as the Supabase URL, without echoing it", () => {
    const value = "postgresql://postgres:p%40ss@db.abcd.supabase.co:5432/postgres";
    expect(() => parseServerEnv({ ...base, NEXT_PUBLIC_SUPABASE_URL: value })).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
    expect(() => parseServerEnv({ ...base, NEXT_PUBLIC_SUPABASE_URL: value })).not.toThrow(/p%40ss/);
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

describe("API server settings", () => {
  it("listens on 0.0.0.0:4000 unless PORT and HOST say otherwise", () => {
    expect(parseServerEnv(base)).toMatchObject({ PORT: 4000, HOST: "0.0.0.0" });
    expect(parseServerEnv({ ...base, PORT: "8080" }).PORT).toBe(8080);
    expect(() => parseServerEnv({ ...base, PORT: "eighty" })).toThrow(/PORT/);
  });

  it("parses CORS_ALLOWED_ORIGINS into exact origins", () => {
    expect(
      parseServerEnv({ ...base, CORS_ALLOWED_ORIGINS: "https://staging.pakkaagent.in, http://localhost:3000/" })
        .CORS_ALLOWED_ORIGINS,
    ).toEqual(["https://staging.pakkaagent.in", "http://localhost:3000"]);
    expect(parseServerEnv(base).CORS_ALLOWED_ORIGINS).toBeUndefined();
  });

  it.each(["*", "https://*.vercel.app", "https://app.example.com/path", "ftp://files.example.com", "https://user:pw@app.example.com", "not a url"])(
    "refuses %j as a CORS origin",
    (bad) => {
      expect(() => parseServerEnv({ ...base, CORS_ALLOWED_ORIGINS: bad })).toThrow(/CORS_ALLOWED_ORIGINS/);
    },
  );
});

describe("META_GRAPH_API_VERSION default", () => {
  it("defaults to v26.0 when unset or empty", () => {
    expect(parseServerEnv(base).META_GRAPH_API_VERSION).toBe("v26.0");
    expect(
      parseServerEnv({ ...base, META_GRAPH_API_VERSION: "" }).META_GRAPH_API_VERSION,
    ).toBe("v26.0");
  });

  it("keeps an explicit version", () => {
    expect(
      parseServerEnv({ ...base, META_GRAPH_API_VERSION: "v27.0" }).META_GRAPH_API_VERSION,
    ).toBe("v27.0");
  });

  it.each(["latest", "26.0", " v26.0", "v26"])("still rejects %j", (bad) => {
    expect(() => parseServerEnv({ ...base, META_GRAPH_API_VERSION: bad })).toThrow(
      /META_GRAPH_API_VERSION/,
    );
  });
});

describe("embeddings settings", () => {
  it("defaults to the Atlas endpoint for Voyage models and voyage-4", () => {
    const env = parseServerEnv(base);
    expect(env.EMBEDDINGS_BASE_URL).toBe("https://ai.mongodb.com/v1");
    expect(env.EMBEDDINGS_MODEL).toBe("voyage-4");
  });

  it("accepts a Voyage-direct endpoint and rejects a base URL that isn't a URL", () => {
    expect(parseServerEnv({ ...base, EMBEDDINGS_BASE_URL: "https://api.voyageai.com/v1" }).EMBEDDINGS_BASE_URL).toBe("https://api.voyageai.com/v1");
    expect(() => parseServerEnv({ ...base, EMBEDDINGS_BASE_URL: "not a url" })).toThrow(/EMBEDDINGS_BASE_URL/);
  });

  it("requires https for the embeddings endpoint, since the key travels to it", () => {
    for (const url of ["http://api.voyageai.com/v1", "http://localhost:9000/v1", "ftp://x.test/v1"]) {
      expect(() => parseServerEnv({ ...base, EMBEDDINGS_BASE_URL: url })).toThrow(/EMBEDDINGS_BASE_URL/);
    }
  });

  it("requires EMBEDDINGS_API_KEY, naming it without echoing anything", () => {
    const withoutKey: Record<string, string | undefined> = { ...base, EMBEDDINGS_API_KEY: undefined };
    expect(() => parseServerEnv(withoutKey)).toThrow(/EMBEDDINGS_API_KEY/);
    expect(() => parseServerEnv({ ...base, EMBEDDINGS_API_KEY: "" })).toThrow(/EMBEDDINGS_API_KEY/);
    try {
      parseServerEnv(withoutKey);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(EnvError);
      expect((e as EnvError).problems).toHaveLength(1);
    }
  });
});
