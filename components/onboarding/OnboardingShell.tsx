import Link from "next/link";

import { Aurora } from "@/components/motion";
import { ONBOARDING_TOTAL_STEPS } from "@/lib/onboarding";
import { acc, text } from "@/lib/theme";

/* Frame shared by every onboarding step: brand, step counter, progress rail. */
export function OnboardingShell({
  step,
  children,
}: {
  step: number;
  children: React.ReactNode;
}) {
  return (
    <div className="grain relative min-h-screen overflow-hidden">
      <Aurora />

      <div className="relative z-10 mx-auto max-w-[960px] px-5 py-8 sm:px-8 sm:py-10">
        <header className="flex items-center justify-between gap-4">
          <Link
            href="/"
            className="font-display text-[17px] font-extrabold tracking-[-0.02em]"
            style={{ color: text() }}
          >
            PaperPath
          </Link>

          <p
            className="text-[11px] font-bold uppercase tracking-[0.2em]"
            style={{ color: text(0.5) }}
          >
            Step {step} / {ONBOARDING_TOTAL_STEPS}
          </p>
        </header>

        <div
          className="mt-5 h-[3px] overflow-hidden rounded-full"
          role="progressbar"
          aria-valuenow={step}
          aria-valuemin={1}
          aria-valuemax={ONBOARDING_TOTAL_STEPS}
          aria-label="Onboarding progress"
          style={{ background: text(0.1) }}
        >
          <div
            className="h-full rounded-full transition-[width] duration-700 ease-out"
            style={{
              width: `${(step / ONBOARDING_TOTAL_STEPS) * 100}%`,
              background: acc(),
            }}
          />
        </div>

        <div className="pb-16 pt-10 sm:pt-12">{children}</div>
      </div>
    </div>
  );
}
