import type { Metadata } from "next";
import { OnboardingFlow } from "@/components/onboarding/onboarding-flow";

export const metadata: Metadata = {
  title: "Pakka — Onboarding",
};

export default function OnboardingPage() {
  return <OnboardingFlow />;
}
