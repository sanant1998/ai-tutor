"use client";

import { persistOnboarding } from "@/lib/repository";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DEFAULT_ONBOARDING,
  EXAM_BOARDS,
  subjectsForClass,
  readOnboarding,
  type OnboardingState,
  type Subject,
} from "@/lib/onboarding";
import { acc, text } from "@/lib/theme";

export function StepTwo() {
  const router = useRouter();
  const [state, setState] = useState<OnboardingState>(DEFAULT_ONBOARDING);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setState(readOnboarding());
    setMounted(true);
  }, []);

  const board = EXAM_BOARDS.find((item) => item.id === state.boardId);
  const chosen = state.subjectIds.length;

  const toggle = (id: string) => {
    const subjectIds = state.subjectIds.includes(id)
      ? state.subjectIds.filter((existing) => existing !== id)
      : [...state.subjectIds, id];

    const next = { ...state, subjectIds };
    setState(next);
    persistOnboarding(next);
  };

  return (
    <div>
      <h1
        className="font-display text-[2.2rem] font-extrabold leading-[1.05] tracking-[-0.035em] sm:text-[2.9rem]"
        style={{ color: text() }}
      >
        Which subjects are you taking?
      </h1>
      <p className="mt-3 text-[15px]" style={{ color: text(0.6) }}>
        Pick all that apply. You&apos;ll choose units next.
      </p>

      <div
        role="group"
        aria-label="Subjects"
        className="mt-8 grid gap-3.5 sm:grid-cols-2"
      >
        {subjectsForClass(state.classLevel ?? 10, state.countryId).map((subject) => (
          <SubjectCard
            key={subject.id}
            subject={subject}
            boardName={board?.name}
            selected={mounted && state.subjectIds.includes(subject.id)}
            onToggle={() => toggle(subject.id)}
          />
        ))}
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        <Button
          variant="glass"
          size="lg"
          onClick={() => router.push("/onboarding")}
        >
          <ArrowLeft className="h-[18px] w-[18px]" />
          Back
        </Button>

        <Button
          size="lg"
          disabled={chosen === 0}
          onClick={() => router.push("/onboarding/3")}
        >
          Continue with {chosen} subject{chosen === 1 ? "" : "s"}
          <ArrowRight className="h-[18px] w-[18px]" />
        </Button>
      </div>
    </div>
  );
}

function SubjectCard({
  subject,
  boardName,
  selected,
  onToggle,
}: {
  subject: Subject;
  boardName?: string;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={selected}
      onClick={onToggle}
      className="glass relative rounded-2xl p-5 text-left transition-all hover:-translate-y-0.5 hover:border-[var(--line-strong)]"
      style={selected ? { borderColor: acc(0.8), background: acc(0.08) } : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <span
          aria-hidden="true"
          className="font-display text-[1.6rem] leading-none"
          style={{ color: text(0.9) }}
        >
          {subject.glyph}
        </span>

        <span
          aria-hidden="true"
          className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px]"
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
      </div>

      <p
        className="font-display mt-4 text-[1.15rem] font-extrabold tracking-[-0.01em]"
        style={{ color: text() }}
      >
        {subject.name}
      </p>
      <p
        className="mt-1.5 font-mono text-[12px]"
        style={{ color: text(0.45) }}
      >
        {boardName ? `${boardName} · ` : ""}
        {subject.classes.length === 10 ? "Class 1-10" : `Class ${subject.classes[0]}-${subject.classes[subject.classes.length - 1]}`}
      </p>
    </button>
  );
}
