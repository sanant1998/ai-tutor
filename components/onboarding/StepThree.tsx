"use client";

import { persistOnboarding } from "@/lib/repository";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";

import { GlassCard } from "@/components/primitives";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_ONBOARDING,
  SUBJECTS,
  unitsFor,
  readOnboarding,
  unitKey,
  type OnboardingState,
  type Subject,
  type Unit,
} from "@/lib/onboarding";
import { acc, text } from "@/lib/theme";

export function StepThree() {
  const router = useRouter();
  const [state, setState] = useState<OnboardingState>(DEFAULT_ONBOARDING);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setState(readOnboarding());
    setMounted(true);
  }, []);

  const chosenSubjects = SUBJECTS.filter((subject) =>
    state.subjectIds.includes(subject.id),
  );

  const toggle = (key: string) => {
    const unitIds = state.unitIds.includes(key)
      ? state.unitIds.filter((existing) => existing !== key)
      : [...state.unitIds, key];

    const next = { ...state, unitIds };
    setState(next);
    persistOnboarding(next);
  };

  return (
    <div>
      <h1
        className="font-display text-[2.2rem] font-extrabold leading-[1.05] tracking-[-0.035em] sm:text-[2.9rem]"
        style={{ color: text() }}
      >
        Which units are you studying?
      </h1>
      <p
        className="mt-3 max-w-2xl text-[15px] leading-[1.6]"
        style={{ color: text(0.6) }}
      >
        Tick every unit you&apos;re covering this year. You can add specific
        tests, mocks or board exams from the{" "}
        <span className="font-semibold" style={{ color: acc() }}>
          Exams
        </span>{" "}
        tab whenever you have one scheduled.
      </p>

      {mounted && chosenSubjects.length === 0 ? (
        <GlassCard className="mt-8 p-7">
          <p className="text-[15px]" style={{ color: text(0.7) }}>
            No subjects picked yet — go back a step and choose at least one.
          </p>
        </GlassCard>
      ) : (
        <div className="mt-8 space-y-4">
          {chosenSubjects.map((subject) => (
            <SubjectUnits
              key={subject.id}
              subject={subject}
              state={state}
              selected={state.unitIds}
              mounted={mounted}
              onToggle={toggle}
            />
          ))}
        </div>
      )}

      <div className="mt-8 flex flex-wrap gap-3">
        <Button
          variant="glass"
          size="lg"
          onClick={() => router.push("/onboarding/2")}
        >
          <ArrowLeft className="h-[18px] w-[18px]" />
          Back
        </Button>

        <Button
          size="lg"
          disabled={state.unitIds.length === 0}
          onClick={() => router.push("/onboarding/4")}
        >
          Set your deadline
          <ArrowRight className="h-[18px] w-[18px]" />
        </Button>
      </div>
    </div>
  );
}

function SubjectUnits({
  subject,
  state,
  selected,
  mounted,
  onToggle,
}: {
  subject: Subject;
  state: OnboardingState;
  selected: string[];
  mounted: boolean;
  onToggle: (key: string) => void;
}) {
  const units = unitsFor(state.boardId, state.classLevel, subject.id);
  const chapterCount = units.length;

  return (
    <GlassCard className="p-5 sm:p-6">
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="font-display text-[1.4rem] leading-none"
        >
          {subject.glyph}
        </span>
        <div>
          <p
            className="font-display text-[1.1rem] font-extrabold tracking-[-0.01em]"
            style={{ color: text() }}
          >
            {subject.name}
          </p>
          <p className="mt-0.5 font-mono text-[11px]" style={{ color: text(0.42) }}>
            {chapterCount} chapters
          </p>
        </div>
      </div>

      <div
        className="mt-5 grid gap-3 border-t pt-5 sm:grid-cols-2"
        style={{ borderColor: "var(--line)" }}
      >
        {units.map((unit) => {
          const key = unitKey(subject.id, unit.id);
          return (
            <UnitRow
              key={key}
              unit={unit}
              selected={mounted && selected.includes(key)}
              onToggle={() => onToggle(key)}
            />
          );
        })}
      </div>
    </GlassCard>
  );
}

function UnitRow({
  unit,
  selected,
  onToggle,
}: {
  unit: Unit;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={selected}
      onClick={onToggle}
      className="rounded-xl border px-3.5 py-3 text-left transition-colors"
      style={{
        borderColor: selected ? acc(0.8) : "var(--line)",
        background: selected ? acc(0.09) : text(0.03),
      }}
    >
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden="true"
          className="flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-[4px]"
          style={{
            background: selected ? acc() : "transparent",
            border: `1.5px solid ${selected ? acc() : acc(0.5)}`,
          }}
        >
          {selected && (
            <Check
              className="h-3 w-3"
              strokeWidth={3.5}
              style={{ color: "var(--onacc)" }}
            />
          )}
        </span>

        <span
          className="font-mono text-[11px] font-bold"
          style={{ color: acc() }}
        >
          {unit.code}
        </span>

        <span
          className="truncate text-[14px] font-bold"
          style={{ color: text() }}
        >
          {unit.name}
        </span>
      </div>

      <p className="mt-1.5 pl-[27px] font-mono text-[11px]" style={{ color: text(0.42) }}>
        {unit.code} · about {unit.studyMinutes} min to learn
      </p>
    </button>
  );
}
