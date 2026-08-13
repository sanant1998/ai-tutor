"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";

import { GlassCard } from "@/components/primitives";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_ONBOARDING,
  EXAM_BOARDS,
  SUBJECTS,
  readOnboarding,
  totalStudyHours,
  type OnboardingState,
} from "@/lib/onboarding";
import { acc, text } from "@/lib/theme";

/* Closes the flow and shows back what was captured. The roadmap itself is
   built server-side once the answers are persisted to Supabase, which is not
   wired yet — see the README. */
export function Done() {
  const [state, setState] = useState<OnboardingState>(DEFAULT_ONBOARDING);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setState(readOnboarding());
    setMounted(true);
  }, []);

  const board = EXAM_BOARDS.find((item) => item.id === state.boardId);
  const subjects = SUBJECTS.filter((subject) =>
    state.subjectIds.includes(subject.id),
  );

  const rows = [
    { label: "Exam board", value: board?.name ?? "—" },
    {
      label: "Subjects",
      value: subjects.length ? subjects.map((s) => s.name).join(", ") : "—",
    },
    {
      label: "Units",
      value: state.unitIds.length
        ? `${state.unitIds.length} · about ${totalStudyHours(state)}h of study`
        : "—",
    },
    { label: "Finish by", value: state.deadline || "—" },
    { label: "Daily hours", value: `${state.dailyHours}h` },
  ];

  return (
    <div>
      <span
        className="flex h-12 w-12 items-center justify-center rounded-2xl"
        style={{ background: acc(0.16), color: acc() }}
      >
        <Check className="h-6 w-6" strokeWidth={3} />
      </span>

      <h1
        className="font-display mt-6 text-[2.2rem] font-extrabold leading-[1.05] tracking-[-0.035em] sm:text-[2.7rem]"
        style={{ color: text() }}
      >
        That&apos;s everything we need{state.name ? `, ${state.name}` : ""}.
      </h1>
      <p className="mt-3 max-w-xl text-[15px] leading-[1.6]" style={{ color: text(0.6) }}>
        Your roadmap gets built from these answers the moment the app is
        connected to your account.
      </p>

      <GlassCard className="mt-8 max-w-xl p-6 sm:p-7">
        <dl className="space-y-4">
          {rows.map((row) => (
            <div
              key={row.label}
              className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1"
            >
              <dt
                className="text-[11px] font-bold uppercase tracking-[0.14em]"
                style={{ color: text(0.45) }}
              >
                {row.label}
              </dt>
              <dd
                className="text-right text-[14.5px] font-semibold"
                style={{ color: text(0.9) }}
              >
                {mounted ? row.value : "…"}
              </dd>
            </div>
          ))}
        </dl>
      </GlassCard>

      <div className="mt-8 flex flex-wrap gap-3">
        <Button asChild variant="glass" size="lg">
          <Link href="/onboarding/5">Change something</Link>
        </Button>
        <Button asChild size="lg">
          <Link href="/dashboard">Open my revision desk</Link>
        </Button>
      </div>
    </div>
  );
}
