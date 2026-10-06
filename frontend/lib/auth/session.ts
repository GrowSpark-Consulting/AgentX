import { AppError } from "@pakka/backend/lib/errors";
import { resolveTenant, type TenantResolution } from "@pakka/backend/lib/tenant";
import type { TenantContext } from "@pakka/types";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { dashboardWithoutTenant } from "@/lib/dev-mode";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Data access layer for the signed-in user (server only). Everything that needs "who is this and
// which business" goes through here, so the check is the same for pages, layouts and API routes.

/** Holds the business the user picked when they belong to several; validated on every read. */
export const TENANT_COOKIE = "pakka_tenant";

export const getAuth = cache(async (): Promise<{ supabase: SupabaseClient; user: User | null }> => {
  const supabase = await createSupabaseServerClient();
  // getUser() asks Supabase Auth to verify the token; the cookie alone is not trusted.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
});

export type SessionState = { status: "signed_out" } | TenantResolution;

export const getSessionState = cache(async (): Promise<SessionState> => {
  const { supabase, user } = await getAuth();
  if (!user) return { status: "signed_out" };
  const preferred = (await cookies()).get(TENANT_COOKIE)?.value ?? null;
  return resolveTenant(supabase, user, preferred);
});

/** For pages inside the signed-in app; the dashboard layout has already handled other states. */
export async function requireTenantContext(): Promise<TenantContext> {
  const state = await getSessionState();
  if (state.status === "signed_out") redirect("/login");
  if (state.status !== "ok") redirect("/dashboard");
  return state.context;
}

/**
 * What a dashboard page shows: the member's business, or (development only, see lib/dev-mode.ts) the
 * signed-in user alone when they have no business yet. The "no_business" view carries no tenant at
 * all, so a page can't run a tenant-scoped query from it.
 */
export type DashboardView =
  | { kind: "tenant"; context: TenantContext }
  | { kind: "no_business"; user: { id: string; email: string | null } };

/** For pages and layouts inside the signed-in app that can also render without a business. */
export async function requireDashboardView(): Promise<DashboardView> {
  const state = await getSessionState();
  if (state.status === "signed_out") redirect("/login");
  if (state.status === "ok") return { kind: "tenant", context: state.context };
  if (state.status === "no_membership" && dashboardWithoutTenant()) {
    const { user } = await getAuth();
    if (!user) redirect("/login");
    return { kind: "no_business", user: { id: user.id, email: user.email ?? null } };
  }
  redirect("/dashboard");
}

/** For API routes: the caller's client and tenant, or an AppError the route turns into a response. */
export async function requireApiTenant(): Promise<{ supabase: SupabaseClient; context: TenantContext }> {
  const { supabase } = await getAuth();
  const state = await getSessionState();
  if (state.status === "signed_out") throw new AppError("unauthenticated", "Your session has ended. Sign in again.");
  if (state.status === "no_membership") throw new AppError("no_membership", "Your account isn't linked to a business yet.");
  if (state.status === "choose") throw new AppError("forbidden", "Choose a business first.");
  return { supabase, context: state.context };
}
