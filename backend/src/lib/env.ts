import { z } from "zod";

// Server-only: never import this from a client component.
// Values are validated, never printed; errors name the variable only.

const secret = z.string().min(1);

const serverEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: secret,
  SUPABASE_SERVICE_ROLE_KEY: secret,

  // Development only: a signed-in account with no business sees the dashboard shell with empty
  // states instead of the "not linked to a business" screen. Already on under `next dev`; set
  // "true" to try it on a production build. Ignored on Vercel production (frontend/lib/dev-mode.ts).
  DEV_DASHBOARD_WITHOUT_TENANT: z.enum(["true", "false"]).optional(),

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
    .optional(),
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
