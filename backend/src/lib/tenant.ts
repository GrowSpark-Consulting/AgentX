import type { MembershipWithTenant, Role, TenantContext, TenantRow } from "@pakka/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "./errors";

export const TENANT_COLUMNS = "id, name, vertical, timezone, status, plan_key, trial_ends_at";

export interface MembershipOption {
  tenantId: string;
  name: string;
  role: Role;
}

export type TenantResolution =
  | { status: "ok"; context: TenantContext; memberships: MembershipOption[] }
  | { status: "no_membership" }
  | { status: "choose"; memberships: MembershipOption[] };

/**
 * Auth user → memberships → tenant, using the signed-in user's own client so row-level security
 * decides what is visible (`is_member`). The tenant is never taken from the browser:
 * `preferredTenantId` (e.g. from a cookie) is only honoured if it is one of the user's memberships.
 * With several memberships and no valid preference, the caller must ask the user to choose.
 */
export async function resolveTenant(
  client: SupabaseClient,
  user: { id: string; email?: string | null },
  preferredTenantId?: string | null,
): Promise<TenantResolution> {
  const { data, error } = await client
    .from("memberships")
    .select(`tenant_id, role, tenants (${TENANT_COLUMNS})`)
    .eq("user_id", user.id)
    .returns<MembershipWithTenant[]>();

  if (error) {
    throw new AppError("upstream_failed", "We couldn't load your business. Try again in a moment.");
  }

  // A membership whose tenant RLS hides is not usable; skip it rather than guess.
  const usable = (data ?? []).filter((m): m is MembershipWithTenant & { tenants: TenantRow } => m.tenants !== null);
  if (usable.length === 0) return { status: "no_membership" };

  const memberships = usable
    .map((m) => ({ tenantId: m.tenant_id, name: m.tenants.name, role: m.role }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const chosen =
    usable.length === 1 ? usable[0] : usable.find((m) => m.tenant_id === preferredTenantId);
  if (!chosen) return { status: "choose", memberships };

  const t = chosen.tenants;
  return {
    status: "ok",
    memberships,
    context: {
      user: { id: user.id, email: user.email ?? null },
      role: chosen.role,
      tenant: {
        id: t.id,
        name: t.name,
        vertical: t.vertical,
        timezone: t.timezone,
        status: t.status,
        planKey: t.plan_key,
        trialEndsAt: t.trial_ends_at,
      },
    },
  };
}

/** Throws unless the member's role is one of `allowed`. */
export function requireRole(context: TenantContext, allowed: readonly Role[], action: string): void {
  if (!allowed.includes(context.role)) {
    throw new AppError("forbidden", `Only an owner or admin can ${action}.`);
  }
}
