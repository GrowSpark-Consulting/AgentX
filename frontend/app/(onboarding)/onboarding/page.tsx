import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OnboardingFlow } from "@/components/onboarding/onboarding-flow";
import { getAuth } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Pakka — Onboarding",
};

// Needs a signed-in account (the proxy redirects first; this is the authoritative check). The wizard
// itself is unchanged and still keeps its state in the browser only.
export default async function OnboardingPage() {
  const { user } = await getAuth();
  if (!user) redirect("/signup?next=%2Fonboarding");
  return <OnboardingFlow />;
}
