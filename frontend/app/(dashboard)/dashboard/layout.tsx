import { redactSecrets } from "@pakka/types";
import Link from "next/link";
import { redirect, unstable_rethrow } from "next/navigation";
import type { ReactNode } from "react";
import { EmptyState, ErrorState } from "@/components/shared/states";
import { TenantProvider } from "@/components/dashboard/tenant-context";
import { chooseTenant, logout } from "@/lib/auth/actions";
import { getSessionState, type SessionState } from "@/lib/auth/session";
import { dashboardWithoutTenant } from "@/lib/dev-mode";
import { formatError } from "@/lib/errors";
import "@/styles/app.css";

// Everything under /dashboard requires a signed-in member of a business (in development, also a
// signed-in account with no business yet: see lib/dev-mode.ts). The proxy already
// redirected signed-out visitors; this is the authoritative check (Supabase verifies the token and
// row-level security decides which memberships are visible). In the normal case it renders no
// markup of its own, so the prototype at /dashboard/preview keeps its exact output.
export default async function DashboardGate({ children }: { children: ReactNode }) {
  let state: SessionState;
  try {
    state = await getSessionState();
  } catch (err) {
    unstable_rethrow(err); // Next.js control flow (dynamic rendering, redirects) must pass through.
    // Developers see the cause (credentials stripped); the user sees a safe message.
    console.error(`[dashboard] could not load the session: ${redactSecrets(err instanceof Error ? err.message : String(err))}`);
    const e = formatError(err);
    return (
      <Gate>
        <ErrorState title={e.title} description={e.message} retryHref="/dashboard" action={<LogoutButton />} />
      </Gate>
    );
  }

  if (state.status === "signed_out") redirect("/login?next=/dashboard");

  if (state.status === "no_membership") {
    // Development only: the shell renders with empty states. No TenantProvider, so nothing below can
    // read a tenant; each page gets the "no_business" view from requireDashboardView() instead.
    if (dashboardWithoutTenant()) return children;
    return (
      <Gate>
        <EmptyState
          title="Your account isn't linked to a business yet"
          description="Ask the business owner to add you to their team, or start a free trial to set up your own business."
          action={
            <>
              <Link className="btn btn-primary" href="/onboarding">
                Start a free trial
              </Link>
              <LogoutButton />
            </>
          }
        />
      </Gate>
    );
  }

  if (state.status === "choose") {
    return (
      <Gate>
        <div className="app-page">
          <div>
            <p className="app-eyebrow">Choose a business</p>
            <h1 className="app-h1">Which business are you working on?</h1>
            <p className="app-lede">Your account belongs to more than one business.</p>
          </div>
          <form action={chooseTenant} className="app-grid">
            {state.memberships.map((m) => (
              <button key={m.tenantId} type="submit" name="tenantId" value={m.tenantId} className="app-card" style={{ textAlign: "left", cursor: "pointer", font: "inherit" }}>
                <span className="app-card-title">{m.name}</span>
                <span className="app-card-text">{m.role === "owner" ? "Owner" : m.role === "admin" ? "Admin" : "Staff"}</span>
              </button>
            ))}
          </form>
          <div>
            <LogoutButton />
          </div>
        </div>
      </Gate>
    );
  }

  return <TenantProvider value={state.context}>{children}</TenantProvider>;
}

function Gate({ children }: { children: ReactNode }) {
  return (
    <div className="app-auth">
      <div className="app-auth-card" style={{ width: "min(720px, 100%)" }}>
        <span className="app-brand">
          <span className="app-brand-mark" aria-hidden="true" />
          <span className="app-brand-name">Pakka</span>
        </span>
        {children}
      </div>
    </div>
  );
}

function LogoutButton() {
  return (
    <form action={logout}>
      <button type="submit" className="btn btn-secondary">
        Log out
      </button>
    </form>
  );
}
