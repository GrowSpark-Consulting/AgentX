import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabasePublicConfig } from "@/lib/env";

// Keeps the Supabase session cookie fresh and does the fast, optimistic redirects. The real
// authorization check runs again on the server (app/(dashboard)/dashboard/layout.tsx,
// app/(onboarding)/onboarding/page.tsx, API routes).
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { url, anonKey } = supabasePublicConfig();
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet, headers) => {
        for (const { name, value } of toSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
        for (const [key, value] of Object.entries(headers ?? {})) response.headers.set(key, value);
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { pathname, search } = request.nextUrl;

  if (!user && pathname.startsWith("/dashboard")) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", pathname + search);
    return redirectKeepingCookies(login, response);
  }
  // Onboarding sets up the signed-in account's business, so it starts with creating an account.
  if (!user && pathname === "/onboarding") {
    const signup = new URL("/signup", request.url);
    signup.searchParams.set("next", "/onboarding");
    return redirectKeepingCookies(signup, response);
  }
  // A signed-in visitor on /login or /signup is sent on by the page itself, which knows whether the
  // account has a business yet (lib/auth/session.ts: redirectIfSignedIn). Signed-out visitors always
  // get the real page.
  return response;
}

/** A redirect that carries any refreshed session cookies. */
function redirectKeepingCookies(to: URL, from: NextResponse) {
  const redirect = NextResponse.redirect(to);
  for (const cookie of from.cookies.getAll()) redirect.cookies.set(cookie);
  return redirect;
}

export const config = {
  matcher: ["/dashboard/:path*", "/login", "/signup", "/onboarding", "/reset-password"],
};
