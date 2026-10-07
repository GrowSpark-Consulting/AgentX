import type { Metadata } from "next";
import Link from "next/link";
import { GoogleButton } from "@/components/dashboard/google-button";
import { SignupForm } from "@/components/dashboard/signup-form";
import { ErrorState } from "@/components/shared/states";
import { authLinkErrorMessage } from "@/lib/auth/redirect";
import { redirectIfSignedIn } from "@/lib/auth/session";
import "@/styles/app.css";

export const metadata: Metadata = { title: "Sign up · Pakka" };

// New accounts, which continue to onboarding. A visitor who is already signed in goes where their
// account belongs instead: the dashboard for a member, onboarding while it has no business yet.
// "Continue with Google" asks for onboarding, but /auth/callback sends an existing member to the
// dashboard.
export default async function SignupPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { error } = await searchParams;
  await redirectIfSignedIn();
  const linkError = authLinkErrorMessage(error);
  return (
    <div className="app-auth">
      <div className="app-auth-card">
        <Link href="/login" className="app-brand">
          <span className="app-brand-mark" aria-hidden="true" />
          <span className="app-brand-name">Pakka</span>
        </Link>
        <div>
          <h1 className="app-h1" style={{ fontSize: 34 }}>Sign up</h1>
          <p className="app-lede" style={{ fontSize: 15 }}>Create the account you&apos;ll use to sign in to Pakka.</p>
        </div>
        {linkError ? <ErrorState compact title="Couldn't sign you up" description={linkError} /> : null}
        <SignupForm />
        <p className="app-hint" style={{ fontSize: 14, margin: 0 }}>Or</p>
        <GoogleButton next="/onboarding" />
        <p className="app-hint" style={{ fontSize: 14 }}>
          Already have an account? <Link href="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
