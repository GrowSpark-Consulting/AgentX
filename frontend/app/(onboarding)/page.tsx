import { redirect } from "next/navigation";

// `/` is the sign-in page for everyone, signed in or not: the session alone decides nothing here.
// Signing in (lib/auth/actions.ts, app/auth/callback/route.ts) sends the account on to the dashboard,
// or to onboarding while it has no business yet.
export default function Home() {
  redirect("/login");
}
