import type { Metadata } from "next";
import Link from "next/link";
import { GoogleButton } from "@/components/dashboard/google-button";
import { LoginForm } from "@/components/dashboard/login-form";
import { ErrorState } from "@/components/shared/states";
import { authLinkErrorMessage } from "@/lib/auth/redirect";
import "@/styles/app.css";

export const metadata: Metadata = { title: "Sign in · Pakka" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { next, error } = await searchParams;
  const linkError = authLinkErrorMessage(error);
  return (
    <div className="app-auth">
      <div className="app-auth-card">
        <Link href="/onboarding" className="app-brand">
          <span className="app-brand-mark" aria-hidden="true" />
          <span className="app-brand-name">Pakka</span>
        </Link>
        <div>
          <h1 className="app-h1" style={{ fontSize: 34 }}>Sign in</h1>
          <p className="app-lede" style={{ fontSize: 15 }}>Use the email and password for your business account.</p>
        </div>
        {linkError ? <ErrorState compact title="Couldn't sign you in" description={linkError} /> : null}
        <LoginForm next={typeof next === "string" ? next : undefined} />
        <p className="app-hint" style={{ fontSize: 14, margin: 0 }}>Or</p>
        <GoogleButton next={typeof next === "string" ? next : undefined} />
        <p className="app-hint" style={{ fontSize: 14 }}>
          New to Pakka? <Link href="/signup">Start your free trial</Link>
        </p>
      </div>
    </div>
  );
}
