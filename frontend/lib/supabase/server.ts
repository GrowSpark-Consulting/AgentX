import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { supabasePublicConfig } from "@/lib/env";

/**
 * Supabase client for Server Components, Server Actions and Route Handlers, acting as the signed-in
 * user (row-level security applies). Create one per request; never share it.
 */
export async function createSupabaseServerClient(): Promise<SupabaseClient> {
  // cookies() first: it marks the route as per-request, so nothing that signs in is prerendered.
  const cookieStore = await cookies();
  const { url, anonKey } = supabasePublicConfig();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
        } catch {
          // Server Components can't set cookies. The browser client keeps the session cookies
          // fresh (components/shared/session-refresh.tsx), so a skipped write here is made there.
        }
      },
    },
  });
}
