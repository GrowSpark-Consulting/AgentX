import { z } from "zod";

// The frontend's settings. All are public by design (NEXT_PUBLIC_*, inlined into the browser bundle;
// the anon / publishable key is limited by row-level security). Server secrets live only on the API
// (backend/, Railway) and never here.
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

// The API (backend/, on Railway): its origin only, e.g. https://api.pakkaagent.in or
// http://localhost:4000. Paths such as /api/templates are added by lib/api/client.ts.
function apiUrlProblem(value: string | undefined): string | null {
  if (!value) return "is required";
  if (!URL.canParse(value)) return "must be the API's address, e.g. https://api.pakkaagent.in";
  const url = new URL(value);
  if (!/^https?:$/.test(url.protocol)) return "must be an http(s) address";
  if (url.username || url.password) return "must not contain credentials";
  if (url.pathname !== "/" || url.search || url.hash) return "must be an origin without a path, e.g. https://api.pakkaagent.in";
  return null;
}

/** Validates NEXT_PUBLIC_API_URL and returns its origin. Errors name the variable, never its value. */
export function parseApiUrl(value: string | undefined): string {
  const problem = apiUrlProblem(value);
  if (problem) throw new Error(`Invalid API configuration: NEXT_PUBLIC_API_URL ${problem}`);
  return new URL(value!).origin;
}

export function apiBaseUrl(): string {
  // Referenced literally so Next.js inlines it into the browser bundle at build time.
  return parseApiUrl(process.env.NEXT_PUBLIC_API_URL);
}
