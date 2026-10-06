import { resolveTenant } from "@pakka/backend/lib/tenant";
import { redactSecrets } from "@pakka/types";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { authErrorPath, authLinkErrorFrom, destinationAfterAuth } from "@/lib/auth/redirect";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// GET /auth/callback?code=…&next=… — where Supabase sends the browser after Google sign-in and after
// an email confirmation link. Exchanges the one-time code for a session cookie, then sends a new
// account (no business yet) to onboarding and everyone else to the dashboard.

const Params = z.object({
  code: z.string().min(1).max(512).optional(),
  next: z.string().max(512).optional(),
  error: z.string().max(200).optional(),
  error_code: z.string().max(200).optional(),
  sb_flow_id: z.string().max(200).optional(),
});

export async function GET(request: NextRequest) {
  const parsed = Params.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  const params = parsed.success ? parsed.data : {};
  const to = (path: string) => NextResponse.redirect(new URL(path, request.url));

  // Supabase reports a cancelled or failed sign-in on the redirect itself.
  if (!parsed.success || params.error || !params.code) {
    return to(authErrorPath(authLinkErrorFrom(params.error ?? null, params.error_code ?? null), params.next));
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(
    params.code,
    params.sb_flow_id ? { flowId: params.sb_flow_id } : undefined,
  );
  if (error || !data.user) {
    console.error(`[auth] code exchange failed: ${redactSecrets(error?.code ?? error?.message ?? "no user")}`);
    return to(authErrorPath("signin_failed", params.next));
  }

  // The same client now holds the new session, so row-level security sees this user's memberships.
  let hasBusiness = true;
  try {
    hasBusiness = (await resolveTenant(supabase, data.user)).status !== "no_membership";
  } catch {
    // Signed in, but the business couldn't be loaded: the dashboard gate shows that error properly.
  }
  return to(destinationAfterAuth(hasBusiness, params.next));
}
