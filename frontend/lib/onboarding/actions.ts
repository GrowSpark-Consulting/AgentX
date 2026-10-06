"use server";

import { getBalance } from "@pakka/backend/billing/credits";
import { createTrialTenant } from "@pakka/backend/billing/trial";
import { getAuth, getSessionState } from "@/lib/auth/session";
import { startTrialFor, type StartTrialResult } from "./start-trial";

/** Onboarding's Business step: `{ name, industry }` → the account's trial business. */
export async function startTrial(input: { name: string; industry: string }): Promise<StartTrialResult> {
  return startTrialFor(input, {
    currentUser: async () => (await getAuth()).user,
    sessionState: getSessionState,
    createTrialTenant,
    getBalance,
  });
}
