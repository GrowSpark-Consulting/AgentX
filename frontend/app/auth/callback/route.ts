import { redactSecrets } from "@pakka/types";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { destinationForUser } from "@/lib/auth/destination";
import { authErrorPath, authLinkErrorFrom, RESET_PASSWORD_PATH } from "@/lib/auth/redirect";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// GET /auth/callback?code=…&next=… — where Supabase sends the browser after Google sign-in, an email
// confirmation link and a password reset link. Exchanges the one-time code for a session cookie, then
// sends the account where its real state says: no business yet → onboarding, a member → the
// dashboard (whichever page Google sign-in was started from), a reset link → the new-password form.

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

  // A reset link: the code verifier this browser stored when it asked for the email is marked as a
  // recovery (the URL's `next` can't make a code count as one).
  // auth-js returns `redirectType` at runtime but leaves it out of the declared type.
  if ((data as { redirectType?: unknown }).redirectType === "recovery") return to(RESET_PASSWORD_PATH);

  // The same client now holds the new session, so row-level security sees this user's memberships.
  return to(await destinationForUser(supabase, data.user, params.next));
}
