import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { serverEnv } from "./env";

// Service-role client: bypasses RLS. Server code only, and every query still filters by tenant_id.
let client: SupabaseClient | undefined;

export function supabaseAdmin(): SupabaseClient {
  if (!client) {
    const env = serverEnv();
    client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}
