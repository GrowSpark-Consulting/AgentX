import { E164 } from "@pakka/types";
import { z } from "zod";
import { connectionSecretContext, encryptSecret } from "../../lib/crypto";
import type { ServerEnv } from "../../lib/env";
import { maskPhone, normalizeE164 } from "./phone";

// The logic of `pnpm seed:connection`: connect one of OUR OWN WhatsApp numbers (test or demo, in our own
// Meta app) to a business as a `platform` connection. Database and network are injected, so the tests
// use neither. Rules: local database only unless --allow-remote; the token comes only from the
// environment; the Graph check runs before anything is written; output and errors never carry the
// token, a full phone number, Meta's own error text or a Postgres message.

/** A problem the person running the script can act on. The message is fixed text, safe to print. */
export class SeedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SeedError";
  }
}

export type SeedArgs = {
  tenantId?: string;
  routeCode?: string;
  phoneNumberId?: string;
  wabaId?: string;
  displayPhone?: string;
  tokenExpiresAt?: string;
  skipCheck: boolean;
  allowRemote: boolean;
};

export type SeedEnv = Pick<
  ServerEnv,
  "NEXT_PUBLIC_SUPABASE_URL" | "META_SYSTEM_USER_TOKEN" | "ENCRYPTION_KEY" | "META_GRAPH_API_VERSION" | "WHATSAPP_DEMO_PHONE_NUMBER_ID" | "WHATSAPP_DEMO_WABA_ID"
>;

export type SeedConnectionRow = {
  id: string;
  tenantId: string;
  channelId: string;
  method: "platform";
  wabaId: string;
  phoneNumberId: string;
  displayPhone: string | null;
  verifiedName: string | null;
  tokenEnc: string;
  tokenType: "system_user";
  tokenExpiresAt: string | null;
  status: "active";
  connectedBy: "system:seed";
};

export interface SeedDb {
  findTenant(tenantId: string): Promise<{ id: string; name: string } | null>;
  findTenantIdByRouteCode(code: string): Promise<string | null>;
  /** By the number's id, which is unique across all businesses: the one lookup that cannot filter by tenant. */
  findConnectionByPhoneNumberId(
    phoneNumberId: string,
  ): Promise<{ id: string; tenantId: string; channelId: string; method: string; displayPhone?: string | null; verifiedName?: string | null } | null>;
  findWhatsappChannelId(tenantId: string): Promise<string | null>;
  insertWhatsappChannel(tenantId: string): Promise<string>;
  upsertConnection(row: SeedConnectionRow): Promise<void>;
}

export type SeedResult = {
  tenantId: string;
  tenantName: string;
  displayPhoneMasked: string | null;
  verifiedName: string | null;
  connectionId: string;
  status: "active";
  tokenExpiresAt: string | null;
};

// Arguments -----------------------------------------------------------------------------------------------

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const META_ID = /^\d{5,20}$/;
const ROUTE_CODE = /^[A-Za-z0-9_-]{1,64}$/;
const VALUE_FLAGS = ["tenant", "route-code", "phone-number-id", "waba-id", "display-phone", "token-expires-at"] as const;
const BOOLEAN_FLAGS = ["skip-check", "allow-remote"] as const;

function refuse(message: string): never {
  throw new SeedError(message);
}

/** Reads the command line. A refused value is never echoed back. The token has no flag: it only comes from the environment. */
export function parseSeedArgs(argv: string[]): SeedArgs {
  const values = new Map<string, string>();
  const switches = new Set<string>();

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === "--") continue; // pnpm passes it through
    if (!token.startsWith("--")) return refuse("Unexpected argument. Use --flag value.");
    const equals = token.indexOf("=");
    const name = token.slice(2, equals === -1 ? undefined : equals);
    const inline = equals === -1 ? undefined : token.slice(equals + 1);

    if ((BOOLEAN_FLAGS as readonly string[]).includes(name)) {
      if (inline !== undefined) return refuse("A switch takes no value.");
      switches.add(name);
    } else if ((VALUE_FLAGS as readonly string[]).includes(name)) {
      const value = inline ?? argv[i + 1];
      if (value === undefined || value === "" || (inline === undefined && value.startsWith("--"))) return refuse(`--${name} needs a value.`);
      if (inline === undefined) i++;
      values.set(name, value);
    } else {
      return refuse(`Unknown option. Allowed: ${[...VALUE_FLAGS, ...BOOLEAN_FLAGS].map((f) => `--${f}`).join(", ")}.`);
    }
  }

  const tenantId = values.get("tenant");
  const routeCode = values.get("route-code");
  if ((tenantId === undefined) === (routeCode === undefined)) return refuse("Give exactly one of --tenant <uuid> or --route-code <code>.");
  if (tenantId !== undefined && !GUID.test(tenantId)) return refuse("--tenant must be a uuid.");
  if (routeCode !== undefined && !ROUTE_CODE.test(routeCode)) return refuse("--route-code is not a valid code.");

  const phoneNumberId = values.get("phone-number-id");
  const wabaId = values.get("waba-id");
  if (phoneNumberId !== undefined && !META_ID.test(phoneNumberId)) return refuse("--phone-number-id must be digits.");
  if (wabaId !== undefined && !META_ID.test(wabaId)) return refuse("--waba-id must be digits.");
  const displayPhone = values.get("display-phone");
  if (displayPhone !== undefined && !E164.safeParse(displayPhone).success) return refuse("--display-phone must be E.164, like +919812345621.");
  const tokenExpiresAt = values.get("token-expires-at");
  if (tokenExpiresAt !== undefined && !z.iso.datetime({ offset: true }).safeParse(tokenExpiresAt).success) {
    return refuse("--token-expires-at must be an ISO date and time, like 2026-10-09T10:00:00Z.");
  }

  return {
    ...(tenantId !== undefined && { tenantId }),
    ...(routeCode !== undefined && { routeCode }),
    ...(phoneNumberId !== undefined && { phoneNumberId }),
    ...(wabaId !== undefined && { wabaId }),
    ...(displayPhone !== undefined && { displayPhone }),
    ...(tokenExpiresAt !== undefined && { tokenExpiresAt }),
    skipCheck: switches.has("skip-check"),
    allowRemote: switches.has("allow-remote"),
  };
}

// The guards -----------------------------------------------------------------------------------------------

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

/** Fails closed: anything that is not clearly a local address is remote. */
function assertLocal(databaseUrl: string, allowRemote: boolean): void {
  let host: string;
  try {
    host = new URL(databaseUrl).hostname;
  } catch {
    host = "";
  }
  if (!allowRemote && !LOCAL_HOSTS.has(host)) {
    refuse("The database is not local. This script only runs against local Supabase; pass --allow-remote only if you mean it.");
  }
}

const GRAPH_URL = "https://graph.facebook.com";
const CHECK_TIMEOUT_MS = 10_000;
const GraphAnswer = z.object({ id: z.string(), verified_name: z.string().optional(), display_phone_number: z.string().optional() });

/** One GET for the number's details. Proves the token and the id belong together. Nothing from Meta's error is passed on. */
async function checkWithMeta(
  token: string,
  graphVersion: string,
  phoneNumberId: string,
  call: typeof fetch,
): Promise<{ verifiedName: string | null; displayPhone: string | null }> {
  const failed = () => new SeedError("Meta did not accept this token for this number. Check META_SYSTEM_USER_TOKEN and the phone number id (or pass --skip-check).");
  let res: Response;
  try {
    res = await call(`${GRAPH_URL}/${graphVersion}/${phoneNumberId}?fields=verified_name,display_phone_number`, {
      method: "GET",
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
    });
  } catch {
    throw new SeedError("Meta could not be reached. Check the network (or pass --skip-check).");
  }
  if (!res.ok) throw failed();
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw failed();
  }
  const answer = GraphAnswer.safeParse(body);
  if (!answer.success || answer.data.id !== phoneNumberId) throw failed();
  return { verifiedName: answer.data.verified_name ?? null, displayPhone: normalizeE164(answer.data.display_phone_number) };
}

// The seed ---------------------------------------------------------------------------------------------------

export type SeedDeps = {
  db: SeedDb;
  env: SeedEnv;
  fetch?: typeof fetch;
  now?: () => Date;
  newId?: () => string;
};

export async function seedConnection(args: SeedArgs, deps: SeedDeps): Promise<SeedResult> {
  const { db, env } = deps;
  assertLocal(env.NEXT_PUBLIC_SUPABASE_URL, args.allowRemote);

  const token = env.META_SYSTEM_USER_TOKEN;
  if (!token) refuse("META_SYSTEM_USER_TOKEN is not set (the token only ever comes from the environment).");
  if (!env.ENCRYPTION_KEY) refuse("ENCRYPTION_KEY is not set.");
  const phoneNumberId = args.phoneNumberId ?? env.WHATSAPP_DEMO_PHONE_NUMBER_ID;
  const wabaId = args.wabaId ?? env.WHATSAPP_DEMO_WABA_ID;
  if (!phoneNumberId || !META_ID.test(phoneNumberId)) refuse("No phone number id: pass --phone-number-id or set WHATSAPP_DEMO_PHONE_NUMBER_ID.");
  if (!wabaId || !META_ID.test(wabaId)) refuse("No WhatsApp account id: pass --waba-id or set WHATSAPP_DEMO_WABA_ID.");

  let tokenExpiresAt: string | null = null;
  if (args.tokenExpiresAt !== undefined) {
    const expires = new Date(args.tokenExpiresAt);
    if (Number.isNaN(expires.getTime()) || expires.getTime() <= (deps.now ?? (() => new Date()))().getTime()) {
      refuse("--token-expires-at is already in the past.");
    }
    tokenExpiresAt = expires.toISOString();
  }

  const tenantId = args.tenantId ?? (await db.findTenantIdByRouteCode(args.routeCode ?? ""));
  if (!tenantId) refuse("No business has that route code.");
  const tenant = await db.findTenant(tenantId);
  if (!tenant) refuse("No such business.");

  const existing = await db.findConnectionByPhoneNumberId(phoneNumberId);
  if (existing && existing.tenantId !== tenant.id) refuse("That number is already connected to another business. This script never moves a number.");
  if (existing && existing.method !== "platform") refuse("That number is already connected another way. This script only manages platform connections.");

  // Before any write: a wrong token or number stops here and nothing is created.
  const checked = args.skipCheck ? null : await checkWithMeta(token, env.META_GRAPH_API_VERSION, phoneNumberId, deps.fetch ?? fetch);
  const displayPhone = checked?.displayPhone ?? args.displayPhone ?? existing?.displayPhone ?? null;
  const verifiedName = checked?.verifiedName ?? existing?.verifiedName ?? null;

  const channelId = existing?.channelId ?? (await db.findWhatsappChannelId(tenant.id)) ?? (await db.insertWhatsappChannel(tenant.id));
  // The id exists before the token is encrypted: it is part of what the ciphertext is bound to.
  const connectionId = existing?.id ?? (deps.newId ?? (() => crypto.randomUUID()))();
  let tokenEnc: string;
  try {
    tokenEnc = encryptSecret(token, connectionSecretContext({ column: "token_enc", tenantId: tenant.id, connectionId }), env);
  } catch {
    throw new SeedError("The token could not be encrypted. Check ENCRYPTION_KEY.");
  }

  await db.upsertConnection({
    id: connectionId,
    tenantId: tenant.id,
    channelId,
    method: "platform",
    wabaId,
    phoneNumberId,
    displayPhone,
    verifiedName,
    tokenEnc,
    tokenType: "system_user",
    tokenExpiresAt,
    status: "active",
    connectedBy: "system:seed",
  });

  return {
    tenantId: tenant.id,
    tenantName: tenant.name,
    displayPhoneMasked: displayPhone === null ? null : maskPhone(displayPhone),
    verifiedName,
    connectionId,
    status: "active",
    tokenExpiresAt,
  };
}

/** The lines the script prints: the business, the masked number, the connection and its status, and the expiry date. */
export function formatSeedResult(result: SeedResult): string[] {
  const number = result.displayPhoneMasked ?? "(not set)";
  return [
    `Tenant:      ${result.tenantId} (${result.tenantName})`,
    `Number:      ${number}${result.verifiedName ? ` (${result.verifiedName})` : ""}`,
    `Connection:  ${result.connectionId}`,
    `Status:      ${result.status}`,
    ...(result.tokenExpiresAt ? [`Token expires: ${result.tokenExpiresAt.slice(0, 10)}`] : []),
  ];
}
