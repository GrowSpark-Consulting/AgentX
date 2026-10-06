import { z } from "zod";

// The only Supabase settings the app needs at request time; both are public by design (the anon /
// publishable key is limited by row-level security). Server secrets are read through serverEnv()
// in @pakka/backend/lib/env and never from here.
const PublicEnv = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z
    .url()
    .refine((v) => /^https?:$/.test(new URL(v).protocol), "must be the project's https API URL, e.g. https://<ref>.supabase.co")
    .refine((v) => !new URL(v).username && !new URL(v).password, "must not contain credentials"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, "is required"),
});

export interface SupabasePublicConfig {
  url: string;
  anonKey: string;
}

/** Validates the public Supabase settings. Errors name the variable, never its value. */
export function parsePublicEnv(source: Record<string, string | undefined>): SupabasePublicConfig {
  const result = PublicEnv.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues.map((i) => `${i.path.join(".")} ${i.message}`);
    throw new Error(`Invalid Supabase configuration: ${problems.join("; ")}`);
  }
  return { url: result.data.NEXT_PUBLIC_SUPABASE_URL, anonKey: result.data.NEXT_PUBLIC_SUPABASE_ANON_KEY };
}

export function supabasePublicConfig(): SupabasePublicConfig {
  // Referenced literally so Next.js can inline them where needed.
  return parsePublicEnv({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
}
