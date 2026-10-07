import { resolveTenant } from "@pakka/backend/lib/tenant";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { destinationAfterAuth } from "@/lib/auth/redirect";

// Server only. Where a signed-in account goes next, decided from its real state in the database and
// never from which page the person started on: an account with no business yet still has onboarding
// to finish; a member of any business goes to the dashboard (the page they asked for, if any).

/**
 * `supabase` must already carry this user's session, so row-level security shows their memberships.
 * Used after sign-in (password, Google, email links) and when a signed-in visitor opens /login or
 * /signup.
 */
export async function destinationForUser(supabase: SupabaseClient, user: Pick<User, "id" | "email">, next: unknown): Promise<string> {
  let hasBusiness = true;
  try {
    hasBusiness = (await resolveTenant(supabase, user)).status !== "no_membership";
  } catch {
    // Signed in, but the business couldn't be loaded: the dashboard gate shows that error properly.
  }
  return destinationAfterAuth(hasBusiness, next);
}
