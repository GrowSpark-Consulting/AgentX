import { serverEnv } from "@pakka/backend/lib/env";

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

/** Server only. Fails closed: if the server environment doesn't validate, the flag counts as off. */
export function dashboardWithoutTenant(): boolean {
  let flag: string | undefined;
  try {
    flag = serverEnv().DEV_DASHBOARD_WITHOUT_TENANT;
  } catch {
    flag = undefined;
  }
  return dashboardWithoutTenantAllowed({ nodeEnv: process.env.NODE_ENV, vercelEnv: process.env.VERCEL_ENV, flag });
}
