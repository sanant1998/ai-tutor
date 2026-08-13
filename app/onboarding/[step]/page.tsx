import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Done } from "@/components/onboarding/Done";
import { OnboardingShell } from "@/components/onboarding/OnboardingShell";
import { StepFive } from "@/components/onboarding/StepFive";
import { StepFour } from "@/components/onboarding/StepFour";
import { StepThree } from "@/components/onboarding/StepThree";
import { StepTwo } from "@/components/onboarding/StepTwo";
import { ONBOARDING_TOTAL_STEPS } from "@/lib/onboarding";

export const metadata: Metadata = {
  title: "Set up your account | PaperPath",
  robots: { index: false, follow: false },
};

const STEPS = {
  2: StepTwo,
  3: StepThree,
  4: StepFour,
  5: StepFive,
} as const;

export default async function OnboardingStepPage({
  params,
}: {
  params: Promise<{ step: string }>;
}) {
  const { step: raw } = await params;

  if (raw === "done") {
    return (
      <OnboardingShell step={ONBOARDING_TOTAL_STEPS}>
        <Done />
      </OnboardingShell>
    );
  }

  const step = Number(raw);
  const Step = STEPS[step as keyof typeof STEPS];

  if (!Step) notFound();

  return (
    <OnboardingShell step={step}>
      <Step />
    </OnboardingShell>
  );
}
