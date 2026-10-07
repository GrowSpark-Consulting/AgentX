import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OnboardingFlow } from "@/components/onboarding/onboarding-flow";
import { getAuth } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Spark Agent — Onboarding",
};

// Needs a signed-in account; a signed-out visitor is sent to create one first. The wizard
// keeps its state in the browser, except the Business step, which creates the account's trial
// business on the server (lib/onboarding/actions.ts).
// Needs a signed-in account (the proxy redirects first; this is the authoritative check). The wizard
// keeps its state in the browser, except the Business step, which asks the API to create the
// account's trial business (lib/onboarding/trial.ts → POST /api/onboarding/trial).
export default async function OnboardingPage() {
  const { user } = await getAuth();
  if (!user) redirect("/signup?next=%2Fonboarding");
  return <OnboardingFlow />;
}
