import { z } from "zod";

// Server-only: never import this from a client component.
// Values are validated, never printed; errors name the variable only.

const secret = z.string().min(1);

/**
 * "https://app.example.com, http://localhost:3000" → each entry's origin. Null when any entry is
 * not a bare http(s) origin (a path, credentials or a wildcard), so a typo can't widen CORS.
 */
export function parseOrigins(list: string): string[] | null {
  const origins: string[] = [];
  for (const raw of list.split(",").map((s) => s.trim()).filter(Boolean)) {
    if (raw.includes("*") || !URL.canParse(raw)) return null;
    const url = new URL(raw);
    const bare = /^https?:$/.test(url.protocol) && !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash;
    if (!bare || raw.replace(/\/$/, "") !== url.origin) return null;
    origins.push(url.origin);
  }
  return origins;
}

const serverEnvSchema = z.object({
  // The frontend's address (Vercel). The API accepts browser requests from it (CORS).
  NEXT_PUBLIC_APP_URL: z.url(),
  // The Supabase project URL and anon/publishable key: the API verifies the caller's access token
  // and reads as that user (row-level security), like the frontend does. Same names on both hosts.
  NEXT_PUBLIC_SUPABASE_URL: z.url({ protocol: /^https?$/, error: "must be the project's https API URL, e.g. https://<ref>.supabase.co" }),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: secret,
  SUPABASE_SERVICE_ROLE_KEY: secret,

  // The API server (backend/src/server). Railway sets PORT; locally the API runs on 4000.
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  HOST: z.string().min(1).default("0.0.0.0"),
  // Browser origins allowed besides NEXT_PUBLIC_APP_URL, comma-separated (e.g. the staging frontend
  // or http://localhost:3000). Exact origins only: never "*".
  CORS_ALLOWED_ORIGINS: z
    .string()
    .refine((v) => parseOrigins(v) !== null, "must be comma-separated origins such as https://staging.pakkaagent.in")
    .transform((v) => parseOrigins(v) ?? [])
    .optional(),

  // Optional until the module that uses them lands; make each one required in
  // the same PR that first reads it.
  ANTHROPIC_API_KEY: secret.optional(),
  EMBEDDINGS_API_KEY: secret.optional(),

  NEXT_PUBLIC_META_APP_ID: secret.optional(),
  META_APP_SECRET: secret.optional(),
  NEXT_PUBLIC_META_ES_CONFIG_ID: secret.optional(),
  META_GRAPH_API_VERSION: z
    .string()
    .regex(/^v\d+\.\d+$/, "must look like v26.0")
    // One pinned version; an unset variable can never build a "/undefined/" Graph API URL.
    .default("v26.0"),
  META_WEBHOOK_VERIFY_TOKEN: secret.optional(),
  META_SYSTEM_USER_TOKEN: secret.optional(),
  WHATSAPP_DEMO_WABA_ID: secret.optional(),
  WHATSAPP_DEMO_PHONE_NUMBER_ID: secret.optional(),
  WHATSAPP_REGISTER_PIN: z
    .string()
    .regex(/^\d{6}$/, "must be 6 digits")
    .optional(),

  GOOGLE_CLIENT_ID: secret.optional(),
  GOOGLE_CLIENT_SECRET: secret.optional(),

  RAZORPAY_KEY_ID: secret.optional(),
  RAZORPAY_KEY_SECRET: secret.optional(),
  RAZORPAY_WEBHOOK_SECRET: secret.optional(),

  INNGEST_EVENT_KEY: secret.optional(),
  INNGEST_SIGNING_KEY: secret.optional(),
  // Read by the Inngest SDK: the API's public origin, so the URL Inngest syncs never comes from a
  // request's Host header (e.g. https://api.pakkaagent.in).
  INNGEST_SERVE_ORIGIN: z.url().optional(),

  RESEND_API_KEY: secret.optional(),
  SENTRY_DSN: z.url().optional(),
  LANGFUSE_PUBLIC_KEY: secret.optional(),
  LANGFUSE_SECRET_KEY: secret.optional(),

  ENCRYPTION_KEY: z
    .string()
    .refine(
      (v) => Buffer.from(v, "base64").length === 32,
      "must be 32 random bytes, base64 (openssl rand -base64 32)",
    )
    .optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export class EnvError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Invalid environment:\n  ${problems.join("\n  ")}`);
    this.name = "EnvError";
  }
}

export function parseServerEnv(
  source: Record<string, string | undefined>,
): ServerEnv {
  // `KEY=` in a .env file means unset, not an empty secret.
  const present = Object.fromEntries(
    Object.entries(source).filter(([, v]) => v !== undefined && v !== ""),
  );
  const result = serverEnvSchema.safeParse(present);
  if (!result.success) {
    throw new EnvError(
      result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
    );
  }
  return result.data;
}

let cached: ServerEnv | undefined;

export function serverEnv(): ServerEnv {
  cached ??= parseServerEnv(process.env);
  return cached;
}
