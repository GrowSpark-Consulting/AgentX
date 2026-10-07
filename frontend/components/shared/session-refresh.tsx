"use client";

import { useEffect } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

/**
 * Keeps the Supabase session cookies fresh. Server Components can read the session but can't write
 * cookies, so a token they refresh is never saved; the browser client refreshes the access token
 * before it expires (and on load, if it already has) and writes the cookies the server reads on the
 * next request. Renders nothing, and does nothing for a signed-out visitor.
 */
export function SessionRefresh() {
  useEffect(() => {
    getSupabaseBrowserClient();
  }, []);
  return null;
}
