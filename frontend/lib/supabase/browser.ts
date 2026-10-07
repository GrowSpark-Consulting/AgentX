"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabasePublicConfig } from "@/lib/env";

let client: SupabaseClient | undefined;

/**
 * Supabase client for Client Components, acting as the signed-in user: it reads the session from the
 * same cookies the server client and the proxy maintain, so row-level security applies to every read
 * and Realtime subscription. One instance per browser tab.
 */
export function getSupabaseBrowserClient(): SupabaseClient {
  if (!client) {
    const { url, anonKey } = supabasePublicConfig();
    client = createBrowserClient(url, anonKey);
  }
  return client;
}

/**
 * Resolves once the signed-in user's session is loaded and handed to Realtime, so a subscription is
 * authorised as the member (and RLS applies) rather than as an anonymous visitor who would silently
 * receive nothing. Returns false when there is no session.
 */
export async function ensureRealtimeAuth(supabase: SupabaseClient): Promise<boolean> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return false;
  await supabase.realtime.setAuth(session.access_token);
  return true;
}
