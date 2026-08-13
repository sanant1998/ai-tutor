"use client";

import { persistOnboarding } from "@/lib/repository";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";

import { GlassCard } from "@/components/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DEFAULT_ONBOARDING,
  WEEKDAYS,
  readOnboarding,
  totalStudyHours,
  type OnboardingState,
} from "@/lib/onboarding";
import { acc, onacc, text } from "@/lib/theme";

export function StepFour() {
  const router = useRouter();
  const [state, setState] = useState<OnboardingState>(DEFAULT_ONBOARDING);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setState(readOnboarding());
    setMounted(true);
  }, []);

  const update = (patch: Partial<OnboardingState>) => {
    const next = { ...state, ...patch };
    setState(next);
    persistOnboarding(next);
  };

  const unitCount = state.unitIds.length;
  const hours = totalStudyHours(state);

  const toggleDay = (id: string) => {
    update({
      restDays: state.restDays.includes(id)
        ? state.restDays.filter((existing) => existing !== id)
        : [...state.restDays, id],
    });
  };

  return (
    <div>
      <h1
        className="font-display max-w-2xl text-[2.2rem] font-extrabold leading-[1.05] tracking-[-0.035em] sm:text-[2.9rem]"
        style={{ color: text() }}
      >
        By when do you want to finish your syllabus?
      </h1>
      <p className="mt-3 text-[15px]" style={{ color: text(0.6) }}>
        We&apos;ll work out how many hours a day that takes across everything
        you&apos;ve picked.
      </p>

      <div className="mt-8 max-w-md space-y-4">
        <GlassCard className="p-6">
          <label
            htmlFor="deadline"
            className="font-display block text-[16px] font-extrabold tracking-[-0.01em]"
            style={{ color: text() }}
          >
            Target finish date
          </label>
          <Input
            id="deadline"
            type="date"
            className="mt-3"
            value={state.deadline}
            onChange={(event) => update({ deadline: event.target.value })}
          />
          <p className="mt-3 text-[13px]" style={{ color: text(0.5) }}>
            {mounted
              ? `Covering ${unitCount} unit${unitCount === 1 ? "" : "s"} · about ${hours}h of focused study in total.`
              : "Working out your total…"}
          </p>
        </GlassCard>

        <GlassCard className="p-6">
          <p
            className="font-display text-[16px] font-extrabold tracking-[-0.01em]"
            style={{ color: text() }}
          >
            Days you won&apos;t study
          </p>
          <p className="mt-1.5 text-[13.5px]" style={{ color: text(0.55) }}>
            We&apos;ll pack those hours into your other days instead.
          </p>

          <div role="group" aria-label="Rest days" className="mt-4 flex flex-wrap gap-2">
            {WEEKDAYS.map((day) => {
              const off = mounted && state.restDays.includes(day.id);
              return (
                <button
                  key={day.id}
                  type="button"
                  role="checkbox"
                  aria-checked={off}
                  onClick={() => toggleDay(day.id)}
                  className="rounded-lg px-3.5 py-2 text-[13px] font-bold transition-colors"
                  style={{
                    background: off ? acc() : text(0.05),
                    color: off ? onacc() : text(0.65),
                    border: `1px solid ${off ? acc() : "var(--line)"}`,
                  }}
                >
                  {day.label}
                </button>
              );
            })}
          </div>
        </GlassCard>
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        <Button
          variant="glass"
          size="lg"
          onClick={() => router.push("/onboarding/3")}
        >
          <ArrowLeft className="h-[18px] w-[18px]" />
          Back
        </Button>

        <Button
          size="lg"
          disabled={!state.deadline}
          onClick={() => router.push("/onboarding/5")}
        >
          Set targets
          <ArrowRight className="h-[18px] w-[18px]" />
        </Button>
      </div>
    </div>
  );
}
