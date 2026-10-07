import { z } from "zod";

export interface DevModeInputs {
  nodeEnv: string | undefined;
  vercelEnv: string | undefined;
  /** DEV_DASHBOARD_WITHOUT_TENANT */
  flag: string | undefined;
}

/**
 * Whether a signed-in account with no business may see the dashboard shell (empty states, no
 * business data) instead of the "not linked to a business" screen. Development only: on under
 * `next dev`, or on a production build with DEV_DASHBOARD_WITHOUT_TENANT=true; never on a Vercel
 * production deployment, whatever the flag says.
 */
export function dashboardWithoutTenantAllowed({ nodeEnv, vercelEnv, flag }: DevModeInputs): boolean {
  if (vercelEnv === "production") return false;
  return nodeEnv === "development" || flag === "true";
}

const Flag = z.enum(["true", "false"]).optional();

/** Server only. Fails closed: a flag that isn't "true" or "false" counts as off. */
export function dashboardWithoutTenant(): boolean {
  const parsed = Flag.safeParse(process.env.DEV_DASHBOARD_WITHOUT_TENANT || undefined);
  return dashboardWithoutTenantAllowed({
    nodeEnv: process.env.NODE_ENV,
    vercelEnv: process.env.VERCEL_ENV,
    flag: parsed.success ? parsed.data : undefined,
  });
}
