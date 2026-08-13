import type { Metadata } from "next";

import { OnboardingShell } from "@/components/onboarding/OnboardingShell";
import { StepOne } from "@/components/onboarding/StepOne";

export const metadata: Metadata = {
  title: "Set up your account | PaperPath",
  robots: { index: false, follow: false },
};

export default function OnboardingPage() {
  return (
    <OnboardingShell step={1}>
      <StepOne />
    </OnboardingShell>
  );
}
