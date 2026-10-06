import type { ReactNode } from "react";
import { AppShell, type ShellIdentity } from "@/components/dashboard/app-shell";
import { requireDashboardView } from "@/lib/auth/session";

// Shell for the signed-in screens (/dashboard, /dashboard/messages/test, …). The prototype at
// /dashboard/preview sits outside this group and keeps its own full-screen layout.
export default async function AppLayout({ children }: { children: ReactNode }) {
  const view = await requireDashboardView();
  const identity: ShellIdentity =
    view.kind === "tenant"
      ? {
          email: view.context.user.email,
          business: { name: view.context.tenant.name, vertical: view.context.tenant.vertical, role: view.context.role },
        }
      : { email: view.user.email, business: null };
  return <AppShell identity={identity}>{children}</AppShell>;
}
