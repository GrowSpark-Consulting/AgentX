import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { connectionSecretContext, decryptSecret } from "../../lib/crypto";
import { formatSeedResult, parseSeedArgs, seedConnection, SeedError, type SeedArgs, type SeedDb, type SeedEnv } from "./seed-connection";

// The seed script's logic with an in-memory database and a fake Graph API. Nothing here reads a real
// .env or calls Meta. All numbers, ids and tokens are synthetic.

const TENANT = "d0000000-0000-4000-8000-000000000001";
const OTHER_TENANT = "d0000000-0000-4000-8000-000000000002";
const PNID = "200000000000001";
const WABA = "100000000000001";
const TOKEN = "SYNTHETIC-SYSTEM-USER-TOKEN-do-not-leak";
const KEY = randomBytes(32).toString("base64");
const NOW = new Date("2026-10-08T12:00:00Z");

const env = (overrides: Partial<SeedEnv> = {}): SeedEnv => ({
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  META_SYSTEM_USER_TOKEN: TOKEN,
  ENCRYPTION_KEY: KEY,
  META_GRAPH_API_VERSION: "v26.0",
  WHATSAPP_DEMO_PHONE_NUMBER_ID: PNID,
  WHATSAPP_DEMO_WABA_ID: WABA,
  ...overrides,
});

type Row = Parameters<SeedDb["upsertConnection"]>[0];
type Existing = { id: string; tenantId: string; channelId: string; method: string };

function fakeDb(
  seed: { tenants?: { id: string; name: string }[]; routeCodes?: Record<string, string>; connections?: Existing[]; channels?: { id: string; tenantId: string }[] } = {},
) {
  const state = {
    tenants: seed.tenants ?? [{ id: TENANT, name: "Spark Agent Demo" }],
    routeCodes: seed.routeCodes ?? {},
    connections: [...(seed.connections ?? [])] as (Existing & Partial<Row>)[],
    channels: [...(seed.channels ?? [])],
    rows: [] as Row[],
    calls: [] as string[],
  };
  const db: SeedDb = {
    async findTenant(tenantId) {
      state.calls.push("findTenant");
      return state.tenants.find((t) => t.id === tenantId) ?? null;
    },
    async findTenantIdByRouteCode(code) {
      state.calls.push("findTenantIdByRouteCode");
      return state.routeCodes[code] ?? null;
    },
    async findConnectionByPhoneNumberId(phoneNumberId) {
      state.calls.push("findConnection");
      return state.connections.find((c) => (c as Partial<Row>).phoneNumberId === phoneNumberId) ?? null;
    },
    async findWhatsappChannelId(tenantId) {
      state.calls.push("findChannel");
      return state.channels.find((c) => c.tenantId === tenantId)?.id ?? null;
    },
    async insertWhatsappChannel(tenantId) {
      state.calls.push("insertChannel");
      const id = crypto.randomUUID();
      state.channels.push({ id, tenantId });
      return id;
    },
    async upsertConnection(row) {
      state.calls.push("upsertConnection");
      state.rows = state.rows.filter((r) => r.phoneNumberId !== row.phoneNumberId);
      state.rows.push(row);
      state.connections = state.connections.filter((c) => (c as Partial<Row>).phoneNumberId !== row.phoneNumberId);
      state.connections.push({ id: row.id, tenantId: row.tenantId, channelId: row.channelId, method: row.method, phoneNumberId: row.phoneNumberId });
    },
  };
  return { db, state };
}

const graphOk = (body: unknown = { id: PNID, verified_name: "Spark Agent", display_phone_number: "+91 00000 00001" }, log?: string[]) =>
  vi.fn<typeof fetch>(async () => {
    log?.push("graph");
    return Response.json(body);
  });

const args = (overrides: Partial<SeedArgs> = {}): SeedArgs => ({ tenantId: TENANT, skipCheck: false, allowRemote: false, ...overrides });

async function seed(
  a: SeedArgs = args(),
  parts: { env?: SeedEnv; db?: ReturnType<typeof fakeDb>; fetch?: ReturnType<typeof graphOk> } = {},
) {
  const database = parts.db ?? fakeDb();
  const fetch = parts.fetch ?? graphOk(undefined, database.state.calls);
  const result = await seedConnection(a, { db: database.db, env: parts.env ?? env(), fetch, now: () => NOW });
  return { result, database, fetch };
}

const nothingWritten = (database: ReturnType<typeof fakeDb>) => {
  expect(database.state.rows).toEqual([]);
  expect(database.state.channels).toEqual([]);
  expect(database.state.calls).not.toContain("upsertConnection");
  expect(database.state.calls).not.toContain("insertChannel");
};

describe("parseSeedArgs", () => {
  it("reads every flag, in both `--flag value` and `--flag=value` form", () => {
    expect(
      parseSeedArgs(["--tenant", TENANT, "--phone-number-id=" + PNID, "--waba-id", WABA, "--display-phone", "+910000000001", "--token-expires-at=2026-10-09T10:00:00Z", "--skip-check", "--allow-remote"]),
    ).toEqual({
      tenantId: TENANT,
      phoneNumberId: PNID,
      wabaId: WABA,
      displayPhone: "+910000000001",
      tokenExpiresAt: "2026-10-09T10:00:00Z",
      skipCheck: true,
      allowRemote: true,
    });
  });

  it("checks the token and refuses to write to a remote database unless told, by default", () => {
    expect(parseSeedArgs(["--tenant", TENANT])).toMatchObject({ skipCheck: false, allowRemote: false });
  });

  it("accepts a route code instead of a tenant id", () => {
    expect(parseSeedArgs(["--route-code", "DEMO-SALON"])).toMatchObject({ routeCode: "DEMO-SALON" });
  });

  it.each([
    [[], "neither a tenant nor a route code"],
    [["--tenant", TENANT, "--route-code", "DEMO-SALON"], "both a tenant and a route code"],
    [["--tenant", "not-a-uuid"], "a tenant that is not a uuid"],
    [["--tenant", TENANT, "--token", "abc"], "a --token flag (the token only ever comes from the environment)"],
    [["--tenant", TENANT, "--bogus"], "an unknown flag"],
    [["--tenant"], "a flag with no value"],
    [["--tenant", TENANT, "--phone-number-id", "12ab"], "a phone number id that is not digits"],
    [["--tenant", TENANT, "--display-phone", "98765"], "a display phone that is not E.164"],
    [["--tenant", TENANT, "--token-expires-at", "tomorrow"], "an expiry that is not an ISO date"],
    [["--tenant", TENANT, "stray"], "a stray argument"],
  ])("refuses %j (%s)", (argv) => {
    expect(() => parseSeedArgs(argv as string[])).toThrow(SeedError);
  });

  it("never echoes a refused value back", () => {
    try {
      parseSeedArgs(["--tenant", TENANT, "--token", "SUPER-SECRET-VALUE"]);
      expect.unreachable();
    } catch (err) {
      expect((err as Error).message).not.toContain("SUPER-SECRET-VALUE");
    }
  });
});

describe("seedConnection", () => {
  it("creates the channel and an active platform connection for the tenant, checking the token before it writes", async () => {
    const { result, database, fetch } = await seed();
    expect(database.state.channels).toEqual([{ id: expect.any(String), tenantId: TENANT }]);
    expect(database.state.rows).toHaveLength(1);
    expect(database.state.rows[0]).toMatchObject({
      tenantId: TENANT,
      channelId: database.state.channels[0].id,
      method: "platform",
      wabaId: WABA,
      phoneNumberId: PNID,
      tokenType: "system_user",
      status: "active",
      connectedBy: "system:seed",
      tokenExpiresAt: null,
    });
    expect(result).toMatchObject({ tenantId: TENANT, tenantName: "Spark Agent Demo", connectionId: database.state.rows[0].id, status: "active" });
    // The Graph call came before every write: a bad token writes nothing.
    expect(fetch).toHaveBeenCalledTimes(1);
    const { calls } = database.state;
    expect(calls.indexOf("graph")).toBeGreaterThan(-1);
    expect(calls.indexOf("graph")).toBeLessThan(calls.indexOf("insertChannel"));
    expect(calls.indexOf("graph")).toBeLessThan(calls.indexOf("upsertConnection"));
  });

  it("stores the token encrypted, bound to this connection and business, and never in plain text", async () => {
    const { database } = await seed();
    const row = database.state.rows[0];
    expect(row.tokenEnc).not.toContain(TOKEN);
    expect(JSON.stringify(row)).not.toContain(TOKEN);
    const context = connectionSecretContext({ column: "token_enc", tenantId: row.tenantId, connectionId: row.id });
    expect(decryptSecret(row.tokenEnc, context, { ENCRYPTION_KEY: KEY })).toBe(TOKEN);
    const elsewhere = connectionSecretContext({ column: "token_enc", tenantId: OTHER_TENANT, connectionId: row.id });
    expect(() => decryptSecret(row.tokenEnc, elsewhere, { ENCRYPTION_KEY: KEY })).toThrow();
  });

  it("finds the business from a route code", async () => {
    const database = fakeDb({ routeCodes: { "DEMO-SALON": TENANT } });
    const { result } = await seed({ routeCode: "DEMO-SALON", skipCheck: false, allowRemote: false }, { db: database });
    expect(result.tenantId).toBe(TENANT);
    expect(database.state.rows[0].tenantId).toBe(TENANT);
  });

  it("refuses an unknown route code or tenant, and writes nothing", async () => {
    const a = fakeDb();
    await expect(seed({ routeCode: "DEMO-NOPE", skipCheck: false, allowRemote: false }, { db: a })).rejects.toThrow(SeedError);
    nothingWritten(a);
    const b = fakeDb();
    await expect(seed(args({ tenantId: OTHER_TENANT }), { db: b })).rejects.toThrow(SeedError);
    nothingWritten(b);
  });

  it("takes the number and account from the environment, and lets flags override them", async () => {
    const fromEnv = await seed(args());
    expect(fromEnv.database.state.rows[0]).toMatchObject({ phoneNumberId: PNID, wabaId: WABA });
    const fromFlags = await seed(args({ phoneNumberId: "299999999999999", wabaId: "199999999999999" }), { fetch: graphOk({ id: "299999999999999", verified_name: "X", display_phone_number: "+91 00000 00002" }) });
    expect(fromFlags.database.state.rows[0]).toMatchObject({ phoneNumberId: "299999999999999", wabaId: "199999999999999" });
  });

  it("refuses when there is no number or account anywhere", async () => {
    const database = fakeDb();
    await expect(seed(args(), { db: database, env: env({ WHATSAPP_DEMO_PHONE_NUMBER_ID: undefined }) })).rejects.toThrow(SeedError);
    await expect(seed(args(), { db: database, env: env({ WHATSAPP_DEMO_WABA_ID: undefined }) })).rejects.toThrow(SeedError);
    nothingWritten(database);
  });

  it("is safe to run twice: one connection, one channel, the same id", async () => {
    const database = fakeDb();
    const first = await seed(args(), { db: database });
    const second = await seed(args(), { db: database });
    expect(second.result.connectionId).toBe(first.result.connectionId);
    expect(database.state.rows).toHaveLength(1);
    expect(database.state.channels).toHaveLength(1);
    expect(database.state.rows[0].status).toBe("active");
    // Re-encrypted under the same binding: it still decrypts for that connection.
    const row = database.state.rows[0];
    const context = connectionSecretContext({ column: "token_enc", tenantId: row.tenantId, connectionId: row.id });
    expect(decryptSecret(row.tokenEnc, context, { ENCRYPTION_KEY: KEY })).toBe(TOKEN);
  });

  it("reuses the business's existing WhatsApp channel instead of adding another", async () => {
    const channelId = "d3000000-0000-4000-8000-000000000001";
    const database = fakeDb({ channels: [{ id: channelId, tenantId: TENANT }] });
    await seed(args(), { db: database });
    expect(database.state.channels).toHaveLength(1);
    expect(database.state.rows[0].channelId).toBe(channelId);
  });

  it("refuses a number that already belongs to another business, and changes nothing", async () => {
    const database = fakeDb({
      tenants: [{ id: TENANT, name: "A" }, { id: OTHER_TENANT, name: "B" }],
      connections: [{ id: "c1", tenantId: OTHER_TENANT, channelId: "ch1", method: "platform", phoneNumberId: PNID } as Existing],
    });
    await expect(seed(args(), { db: database })).rejects.toThrow(SeedError);
    expect(database.state.rows).toEqual([]);
    expect(database.state.calls).not.toContain("upsertConnection");
  });

  it.each(["manual_byo", "embedded_signup", "assisted"])("refuses to overwrite a real client connection (%s)", async (method) => {
    const database = fakeDb({ connections: [{ id: "c1", tenantId: TENANT, channelId: "ch1", method, phoneNumberId: PNID } as Existing] });
    await expect(seed(args(), { db: database })).rejects.toThrow(SeedError);
    expect(database.state.calls).not.toContain("upsertConnection");
  });
});

describe("the local-only guard", () => {
  it.each(["http://127.0.0.1:54321", "http://localhost:54321", "http://[::1]:54321"])("lets %s through", async (url) => {
    await expect(seed(args(), { env: env({ NEXT_PUBLIC_SUPABASE_URL: url }) })).resolves.toBeDefined();
  });

  it.each(["https://abcdefgh.supabase.co", "https://staging.example.com", "http://10.0.0.5:54321", "http://127.0.0.1.evil.example", "not a url", ""])(
    "refuses %s unless --allow-remote is given, before any database or network call",
    async (url) => {
      const database = fakeDb();
      const fetch = graphOk();
      await expect(seed(args(), { env: env({ NEXT_PUBLIC_SUPABASE_URL: url }), db: database, fetch })).rejects.toThrow(SeedError);
      expect(database.state.calls).toEqual([]);
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it("lets a remote database through only with --allow-remote", async () => {
    const { result } = await seed(args({ allowRemote: true }), { env: env({ NEXT_PUBLIC_SUPABASE_URL: "https://abcdefgh.supabase.co" }) });
    expect(result.status).toBe("active");
  });
});

describe("configuration it will not run without", () => {
  it("refuses with no token or no encryption key, and writes nothing", async () => {
    for (const overrides of [{ META_SYSTEM_USER_TOKEN: undefined }, { ENCRYPTION_KEY: undefined }]) {
      const database = fakeDb();
      const fetch = graphOk();
      await expect(seed(args(), { env: env(overrides), db: database, fetch })).rejects.toThrow(SeedError);
      nothingWritten(database);
      expect(fetch).not.toHaveBeenCalled();
    }
  });
});

describe("the token check (on by default)", () => {
  it("asks the Graph API for the number's details at the pinned version, with the token only in the header", async () => {
    const { fetch } = await seed();
    const [url, init] = fetch.mock.calls[0];
    const parsed = new URL(String(url));
    expect(`${parsed.origin}${parsed.pathname}`).toBe(`https://graph.facebook.com/v26.0/${PNID}`);
    expect(parsed.searchParams.get("fields")).toBe("verified_name,display_phone_number");
    expect(String(url)).not.toContain(TOKEN);
    expect((init?.headers as Record<string, string>).authorization).toBe(`Bearer ${TOKEN}`);
    expect(init?.method ?? "GET").toBe("GET");
  });

  it("fills in the verified name and the display number from Meta's answer", async () => {
    const { result, database } = await seed();
    expect(database.state.rows[0]).toMatchObject({ verifiedName: "Spark Agent", displayPhone: "+910000000001" });
    expect(result.verifiedName).toBe("Spark Agent");
    expect(result.displayPhoneMasked).toBe("+9100xxxxxx01");
  });

  it.each([
    ["an HTTP 401", () => new Response(JSON.stringify({ error: { message: `Invalid OAuth access token ${TOKEN}` } }), { status: 401 })],
    ["an HTTP 500", () => new Response("boom", { status: 500 })],
    ["an answer of the wrong shape", () => Response.json({ nope: true })],
    ["the details of a different number", () => Response.json({ id: "299999999999999", verified_name: "X", display_phone_number: "+91 00000 00001" })],
    ["an answer that is not JSON", () => new Response("<html>", { status: 200 })],
  ])("stops without writing anything on %s, and says so without Meta's text or the token", async (_name, respond) => {
    const database = fakeDb();
    const fetch = vi.fn(async () => respond());
    const error = await seedConnection(args(), { db: database.db, env: env(), fetch, now: () => NOW }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SeedError);
    expect((error as Error).message).not.toContain(TOKEN);
    expect((error as Error).message).not.toContain("OAuth");
    nothingWritten(database);
  });

  it("stops without writing anything when the network fails, even if the failure text contains the token", async () => {
    const database = fakeDb();
    const fetch = vi.fn().mockRejectedValue(new TypeError(`fetch failed for token ${TOKEN}`));
    const error = await seedConnection(args(), { db: database.db, env: env(), fetch, now: () => NOW }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SeedError);
    expect((error as Error).message).not.toContain(TOKEN);
    nothingWritten(database);
  });

  it("does not call Meta with --skip-check, and uses only the number given on the command line", async () => {
    const { database, fetch, result } = await seed(args({ skipCheck: true, displayPhone: "+910000000009" }));
    expect(fetch).not.toHaveBeenCalled();
    expect(database.state.rows[0]).toMatchObject({ displayPhone: "+910000000009", verifiedName: null });
    expect(result.verifiedName).toBeNull();
    expect(result.displayPhoneMasked).toBe("+9100xxxxxx09");
  });

  it("leaves the display number empty with --skip-check and no --display-phone", async () => {
    const { database, result } = await seed(args({ skipCheck: true }));
    expect(database.state.rows[0]).toMatchObject({ displayPhone: null, verifiedName: null });
    expect(result.displayPhoneMasked).toBeNull();
  });
});

describe("the token's expiry", () => {
  it("is empty without --token-expires-at", async () => {
    const { database, result } = await seed();
    expect(database.state.rows[0].tokenExpiresAt).toBeNull();
    expect(result.tokenExpiresAt).toBeNull();
  });

  it("is stored as an ISO time when given (Meta's temporary token lasts about a day)", async () => {
    const { database, result } = await seed(args({ tokenExpiresAt: "2026-10-09T10:00:00+05:30" }));
    expect(database.state.rows[0].tokenExpiresAt).toBe("2026-10-09T04:30:00.000Z");
    expect(result.tokenExpiresAt).toBe("2026-10-09T04:30:00.000Z");
  });

  it("refuses an expiry that has already passed, and writes nothing", async () => {
    const database = fakeDb();
    await expect(seed(args({ tokenExpiresAt: "2026-10-07T00:00:00Z" }), { db: database })).rejects.toThrow(SeedError);
    nothingWritten(database);
  });
});

describe("what it prints", () => {
  it("is the tenant, the masked display number, the connection id, the status and the expiry date, and nothing else", async () => {
    const { result } = await seed(args({ tokenExpiresAt: "2026-10-09T10:00:00Z" }));
    const lines = formatSeedResult(result);
    const text = lines.join("\n");
    expect(text).toContain(TENANT);
    expect(text).toContain("Spark Agent Demo");
    expect(text).toContain("+9100xxxxxx01");
    expect(text).toContain(result.connectionId);
    expect(text).toContain("active");
    expect(text).toContain("2026-10-09");
    expect(lines.length).toBeLessThanOrEqual(6);
  });

  it("holds no token, no full phone number, no encryption key and no ciphertext", async () => {
    const { result, database } = await seed(args({ tokenExpiresAt: "2026-10-09T10:00:00Z" }));
    const text = formatSeedResult(result).join("\n");
    for (const secret of [TOKEN, KEY, "910000000001", "+910000000001", database.state.rows[0].tokenEnc]) {
      expect(text).not.toContain(secret);
    }
  });

  it("shows no expiry line when there is none", async () => {
    const { result } = await seed();
    expect(formatSeedResult(result).join("\n")).not.toMatch(/expires/i);
  });
});
