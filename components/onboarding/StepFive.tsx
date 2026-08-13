"use client";

import { persistOnboarding } from "@/lib/repository";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";

import { BuildingRoadmap } from "@/components/onboarding/BuildingRoadmap";
import { GlassCard } from "@/components/primitives";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_ONBOARDING,
  GRADES,
  SUBJECTS,
  readOnboarding,
  type OnboardingState,
  type Subject,
} from "@/lib/onboarding";
import { acc, text } from "@/lib/theme";

const MIN_HOURS = 1;
const MAX_HOURS = 6;

export function StepFive() {
  const router = useRouter();
  const [state, setState] = useState<OnboardingState>(DEFAULT_ONBOARDING);
  const [mounted, setMounted] = useState(false);
  const [building, setBuilding] = useState(false);

  useEffect(() => {
    setState(readOnboarding());
    setMounted(true);
  }, []);

  if (building) {
    return <BuildingRoadmap onDone={() => router.push("/onboarding/done")} />;
  }

  const update = (patch: Partial<OnboardingState>) => {
    const next = { ...state, ...patch };
    setState(next);
    persistOnboarding(next);
  };

  const chosenSubjects = SUBJECTS.filter((subject) =>
    state.subjectIds.includes(subject.id),
  );

  return (
    <div>
      <h1
        className="font-display text-[2.2rem] font-extrabold leading-[1.05] tracking-[-0.035em] sm:text-[2.9rem]"
        style={{ color: text() }}
      >
        Targets and intensity.
      </h1>
      <p className="mt-3 text-[15px]" style={{ color: text(0.6) }}>
        How hard are you pushing, and for how many hours a day?
      </p>

      <div className="mt-8 space-y-4">
        <GlassCard className="p-6 sm:p-7">
          <div className="flex items-center justify-between gap-4">
            <p
              className="font-display text-[16px] font-extrabold tracking-[-0.01em]"
              style={{ color: text() }}
            >
              Daily study hours
            </p>
            <p
              className="font-display text-[1.4rem] font-extrabold leading-none"
              style={{ color: acc() }}
            >
              {mounted ? state.dailyHours : DEFAULT_ONBOARDING.dailyHours}h
            </p>
          </div>

          <input
            type="range"
            min={MIN_HOURS}
            max={MAX_HOURS}
            step={1}
            value={mounted ? state.dailyHours : DEFAULT_ONBOARDING.dailyHours}
            onChange={(event) =>
              update({ dailyHours: Number(event.target.value) })
            }
            aria-label="Daily study hours"
            className="mt-4 h-1.5 w-full cursor-pointer appearance-none rounded-full outline-none [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-[var(--acc)] [&::-moz-range-thumb]:bg-[var(--bg)] [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-[var(--acc)] [&::-webkit-slider-thumb]:bg-[var(--bg)]"
            style={{
              background: `linear-gradient(90deg, ${acc()} ${((state.dailyHours - MIN_HOURS) / (MAX_HOURS - MIN_HOURS)) * 100}%, ${text(0.12)} ${((state.dailyHours - MIN_HOURS) / (MAX_HOURS - MIN_HOURS)) * 100}%)`,
            }}
          />

          <div
            className="mt-2.5 flex justify-between text-[10px] font-bold uppercase tracking-[0.14em]"
            style={{ color: text(0.4) }}
          >
            <span>Light · 1h</span>
            <span>Steady · 2–3h</span>
            <span>Heavy · 5h+</span>
          </div>

          <p className="mt-4 text-[13px]" style={{ color: text(0.55) }}>
            Your roadmap will pace topics so you cover roughly this much per
            day. You can change it anytime in Settings.
          </p>
        </GlassCard>

        {chosenSubjects.map((subject) => (
          <GradeCard
            key={subject.id}
            subject={subject}
            target={state.targetGrades[subject.id] ?? "A"}
            predicted={state.predictedGrades[subject.id] ?? "C"}
            onChange={(field, value) =>
              update({
                [field]: { ...state[field], [subject.id]: value },
              } as Partial<OnboardingState>)
            }
          />
        ))}
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        <Button
          variant="glass"
          size="lg"
          onClick={() => router.push("/onboarding/4")}
        >
          <ArrowLeft className="h-[18px] w-[18px]" />
          Back
        </Button>

        <Button
          size="lg"
          className="uppercase tracking-[0.12em]"
          onClick={() => setBuilding(true)}
        >
          Build my roadmap
          <ArrowRight className="h-[18px] w-[18px]" />
        </Button>
      </div>
    </div>
  );
}

function GradeCard({
  subject,
  target,
  predicted,
  onChange,
}: {
  subject: Subject;
  target: string;
  predicted: string;
  onChange: (
    field: "targetGrades" | "predictedGrades",
    value: string,
  ) => void;
}) {
  return (
    <GlassCard className="p-6 sm:p-7">
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="font-display text-[1.3rem] leading-none">
          {subject.glyph}
        </span>
        <p
          className="font-display text-[1.1rem] font-extrabold tracking-[-0.01em]"
          style={{ color: text() }}
        >
          {subject.name}
        </p>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <GradeSelect
          id={`${subject.id}-target`}
          label="Target grade"
          value={target}
          onChange={(value) => onChange("targetGrades", value)}
        />
        <GradeSelect
          id={`${subject.id}-predicted`}
          label="Currently predicted"
          value={predicted}
          onChange={(value) => onChange("predictedGrades", value)}
        />
      </div>
    </GlassCard>
  );
}

function GradeSelect({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="block text-[11px] font-bold uppercase tracking-[0.14em]"
        style={{ color: text(0.5) }}
      >
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="glass mt-2 h-11 w-full cursor-pointer rounded-xl px-3 text-[15px] outline-none focus-visible:border-[var(--acc)]"
        style={{ color: text() }}
      >
        {GRADES.map((grade) => (
          <option key={grade} value={grade} style={{ color: "#111" }}>
            {grade}
          </option>
        ))}
      </select>
    </div>
  );
}
