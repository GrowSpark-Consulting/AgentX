// Shapes of the tenancy tables in supabase/migrations/0001_init.sql (columns used by the app only).

export const ROLES = ["owner", "admin", "staff"] as const;
export type Role = (typeof ROLES)[number];

export type TenantStatus = "trial" | "active" | "paused" | "cancelled";

/** public.tenants: the columns the signed-in app reads. */
export interface TenantRow {
  id: string;
  name: string;
  vertical: string;
  timezone: string;
  status: TenantStatus;
  plan_key: string;
  trial_ends_at: string | null;
}

/** public.memberships joined to its tenant. */
export interface MembershipWithTenant {
  tenant_id: string;
  role: Role;
  tenants: TenantRow | null;
}

/** The signed-in user's view of their business, passed to the UI. */
export interface TenantContext {
  user: { id: string; email: string | null };
  role: Role;
  tenant: {
    id: string;
    name: string;
    vertical: string;
    timezone: string;
    status: TenantStatus;
    planKey: string;
    trialEndsAt: string | null;
  };
}
