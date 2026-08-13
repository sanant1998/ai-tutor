"use client";

import Link from "next/link";
import { ArrowRight, BookOpen, ChevronRight, Crown, Layers } from "lucide-react";

import { Panel } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import type { OnboardingState } from "@/lib/onboarding";
import { subjectColour, type PlannedDay } from "@/lib/schedule";
import { chosenSubjects, chosenUnits, type Progress } from "@/lib/study";
import { acc, text } from "@/lib/theme";

export function JourneyTab({
  state,
  days,
  progress,
}: {
  state: OnboardingState;
  days: PlannedDay[];
  progress: Progress;
}) {
  const subjects = chosenSubjects(state);
  const today = days[0];
  const next = today?.sessions.find(
    (session) => !progress.doneSessions.includes(session.id),
  );

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2
          className="font-display text-[1.2rem] font-extrabold tracking-[-0.02em]"
          style={{ color: text() }}
        >
          Subjects
        </h2>

        <Button asChild variant="glass" size="sm">
          <Link href="/settings">
            <Layers className="h-4 w-4" />
            View all units
          </Link>
        </Button>
      </div>

      {next && (
        <Panel className="mt-4 p-5" style={{ borderColor: acc(0.3) }}>
          <div className="flex flex-wrap items-center gap-4">
            <span
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
              style={{ background: acc(0.16), color: acc() }}
            >
              <BookOpen className="h-5 w-5" />
            </span>

            <div className="min-w-0 flex-1">
              <p
                className="font-mono text-[10.5px] font-bold uppercase tracking-[0.16em]"
                style={{ color: text(0.45) }}
              >
                Today&apos;s next session
              </p>
              <p
                className="mt-1.5 text-[16px] font-bold"
                style={{ color: text() }}
              >
                {next.topic.name}
              </p>
              <p className="mt-0.5 text-[13px]" style={{ color: text(0.5) }}>
                {next.topic.subjectName} · {next.topic.unitCode} · ~
                {next.minutes} min
              </p>
            </div>

            <Button asChild size="sm">
              <Link href="/dashboard">
                Start now
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </Panel>
      )}

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {subjects.map((subject) => {
          const units = chosenUnits(state, subject.id);
          const sessions = days.flatMap((day) =>
            day.sessions.filter((s) => s.topic.subjectId === subject.id),
          );
          const done = sessions.filter((s) =>
            progress.doneSessions.includes(s.id),
          ).length;
          const percent = sessions.length
            ? Math.round((done / sessions.length) * 100)
            : 0;

          return (
            <Panel
              key={subject.id}
              className="overflow-hidden p-0"
            >
              <div
                className="h-1 w-full"
                style={{ background: subjectColour(subject.id) }}
              />

              <div className="p-5">
                <div className="flex items-center gap-3">
                  <span
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[18px]"
                    style={{ background: text(0.06) }}
                  >
                    {subject.glyph}
                  </span>
                  <div className="min-w-0">
                    <p
                      className="truncate text-[15.5px] font-bold"
                      style={{ color: text() }}
                    >
                      {subject.name}
                    </p>
                    <p
                      className="mt-0.5 font-mono text-[11.5px]"
                      style={{ color: text(0.45) }}
                    >
                      {units.length} units · {sessions.length} sessions
                    </p>
                  </div>
                </div>

                <div className="mt-5 flex items-baseline justify-between">
                  <span className="text-[13px]" style={{ color: text(0.55) }}>
                    {done}/{sessions.length} done
                  </span>
                  <span
                    className="font-mono text-[13px] font-bold"
                    style={{ color: subjectColour(subject.id) }}
                  >
                    {percent}%
                  </span>
                </div>

                <div
                  className="mt-2 h-1 overflow-hidden rounded-full"
                  style={{ background: text(0.1) }}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${percent}%`,
                      background: subjectColour(subject.id),
                    }}
                  />
                </div>

                <Link
                  href="/settings"
                  className="mt-4 inline-flex items-center gap-1 text-[13.5px] font-semibold"
                  style={{ color: text(0.6) }}
                >
                  Open units
                  <ChevronRight className="h-4 w-4" />
                </Link>
              </div>
            </Panel>
          );
        })}
      </div>

      <Panel className="mt-5 p-8 text-center">
        <Crown className="mx-auto h-7 w-7" style={{ color: "#eab308" }} />
        <p
          className="font-display mt-4 text-[1.3rem] font-extrabold tracking-[-0.02em]"
          style={{ color: text() }}
        >
          Study without limits
        </p>
        <p
          className="mx-auto mt-3 max-w-md text-[14.5px] leading-[1.6]"
          style={{ color: text(0.6) }}
        >
          Free plan covers one subject&apos;s full roadmap — go Pro to unlock
          every subject and all AI tools.
        </p>
        <Button asChild className="mt-6">
          <Link href="/pricing">See plans</Link>
        </Button>
      </Panel>
    </div>
  );
}
