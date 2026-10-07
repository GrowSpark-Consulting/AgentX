import { INDUSTRY_KEYS, redactSecrets, TRIAL_PACKS, type IndustryKey, type StartTrialResult } from "@pakka/types";
import { z } from "zod";
import type { TenantResolution } from "../lib/tenant";
import type { Balance } from "./credits";
import type { TrialSignup } from "./trial";

// The onboarding Business step (POST /api/onboarding/trial): creates the signed-in account's trial
// business through createTrialTenant. The browser sends only the name and the trade it picked. The
// user comes from the verified access token and the pack key from the trade, both on the server.

export type SessionState = { status: "signed_out" } | TenantResolution;

export interface StartTrialDeps {
  currentUser: () => Promise<{ id: string } | null>;
  sessionState: () => Promise<SessionState>;
  createTrialTenant: (input: { userId: string; name: string; vertical: string }) => Promise<TrialSignup>;
  getBalance: (tenantId: string) => Promise<Balance>;
  now?: () => number;
}

const Input = z.object({
  // Same limit as createTrialTenant.
  name: z.string().trim().min(1, "Enter your business name").max(120, "Keep it under 120 characters"),
  industry: z.enum(INDUSTRY_KEYS, "Choose what you do"),
});

const DAY_MS = 24 * 60 * 60 * 1000;
const SIGNED_OUT = "Your session has ended. Sign in again to start your trial.";
const TRY_AGAIN = "We couldn't set up your trial. Try again in a moment.";

/** The pack a trade's trial runs on, or null while that trade has none. */
export function trialPackKey(industry: IndustryKey): string | null {
  return TRIAL_PACKS[industry] ?? null;
}

const errorText = (e: unknown) => redactSecrets(e instanceof Error ? e.message : String(e));

export async function startTrialFor(rawInput: unknown, deps: StartTrialDeps): Promise<StartTrialResult> {
  const user = await deps.currentUser();
  if (!user) return { status: "failed", message: SIGNED_OUT };

  const parsed = Input.safeParse(rawInput);
  if (!parsed.success) {
    const fields: { name?: string; industry?: string } = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (key === "name" || key === "industry") fields[key] ??= issue.message;
    }
    return { status: "invalid", fields };
  }
  const vertical = trialPackKey(parsed.data.industry);
  if (!vertical) return { status: "unavailable" };

  // Members of any business, in any role (an invited staff member, an owner), never get a trial
  // here. create_trial_tenant only looks at owner memberships, so this check comes first.
  let state: SessionState;
  try {
    state = await deps.sessionState();
  } catch (e) {
    console.error(`[onboarding] could not check memberships: ${errorText(e)}`);
    return { status: "failed", message: TRY_AGAIN };
  }
  if (state.status === "signed_out") return { status: "failed", message: SIGNED_OUT };
  if (state.status !== "no_membership") return { status: "has_business" };

  let signup: TrialSignup;
  try {
    signup = await deps.createTrialTenant({ userId: user.id, name: parsed.data.name, vertical });
  } catch (e) {
    const text = errorText(e);
    if (text.includes("already owns a business")) {
      return { status: "failed", message: "This account already owns a business. Open your dashboard to continue." };
    }
    console.error(`[onboarding] trial signup failed: ${text}`);
    return { status: "failed", message: TRY_AGAIN };
  }

  // The business exists and is funded by now; a failed balance read only hides the number.
  let credits: number | null = null;
  try {
    credits = (await deps.getBalance(signup.tenantId)).total;
  } catch (e) {
    console.error(`[onboarding] could not read the trial balance: ${errorText(e)}`);
  }
  const now = deps.now?.() ?? Date.now();
  const trialDays = Math.max(0, Math.ceil((Date.parse(signup.trialEndsAt) - now) / DAY_MS));
  return { status: "ready", trial: { routeCode: signup.routeCode, trialDays, credits } };
}
