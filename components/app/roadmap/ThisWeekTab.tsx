"use client";

import Link from "next/link";
import { ArrowRight, TrendingUp } from "lucide-react";

import { Kicker, Panel } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import type { OnboardingState } from "@/lib/onboarding";
import {
  daySlice,
  formatDayLabel,
  formatShortDate,
  isoDate,
  subjectColour,
  type PlannedDay,
} from "@/lib/schedule";
import { chosenSubjects } from "@/lib/study";
import { useAppData } from "@/lib/useAppData";
import { acc, text } from "@/lib/theme";

export function ThisWeekTab({
  state,
  days,
  now,
}: {
  state: OnboardingState;
  days: PlannedDay[];
  now: Date;
}) {
  const { exams } = useAppData();
  const week = daySlice(days, now, 7);
  const hasExams = exams.length > 0;
  const today = isoDate(now);

  const subjects = chosenSubjects(state).map((subject) => {
    const sessions = week.flatMap((day) =>
      day.sessions.filter((session) => session.topic.subjectId === subject.id),
    );

    return {
      subject,
      total: sessions.length,
      minutes: sessions.reduce((sum, session) => sum + session.minutes, 0),
      learn: sessions.filter((session) => session.kind === "learn").length,
      review: sessions.filter((session) => session.kind === "review").length,
    };
  });

  return (
    <div>
      <Panel className="p-5" style={{ borderColor: acc(0.25) }}>
        <div className="flex items-start gap-4">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
            style={{ background: acc(0.16), color: acc() }}
          >
            <TrendingUp className="h-5 w-5" />
          </span>
          <div>
            <Kicker>AI recommendation</Kicker>
            <p className="mt-2 text-[14.5px]" style={{ color: text(0.8) }}>
              {hasExams
                ? "Your plan is paced to your nearest exam. Keep the reviews — they are what stops the early topics slipping."
                : "No exam dates set yet. Add exam dates in the Exams tab to get a personalised study plan."}
            </p>
          </div>
        </div>
      </Panel>

      <Kicker className="mt-7">This week&apos;s focus</Kicker>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {subjects
          .filter((row) => row.total > 0)
          .map((row) => (
            <Panel
              key={row.subject.id}
              className="p-5"
              style={{ borderLeft: `3px solid ${subjectColour(row.subject.id)}` }}
            >
              <div className="flex items-center gap-3">
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[17px]"
                  style={{ background: text(0.06) }}
                >
                  {row.subject.glyph}
                </span>
                <div className="min-w-0">
                  <p
                    className="truncate text-[15px] font-bold"
                    style={{ color: text() }}
                  >
                    {row.subject.name}
                  </p>
                  <p
                    className="mt-0.5 font-mono text-[11.5px]"
                    style={{ color: text(0.45) }}
                  >
                    {row.total} sessions · ~{row.minutes} min
                  </p>
                </div>
              </div>

              <div className="mt-4 flex gap-2">
                <Tag colour="#3b82f6">{row.learn} learn</Tag>
                <Tag colour="#eab308">{row.review} review</Tag>
              </div>
            </Panel>
          ))}
      </div>

      <Kicker className="mt-7">7-day plan</Kicker>

      <ul className="mt-3 space-y-2.5">
        {week.map((day) => (
          <li key={day.date}>
            <Panel className="p-4 sm:p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-[15px] font-bold">
                  <span
                    style={{ color: day.date === today ? "#22c55e" : text() }}
                  >
                    {formatDayLabel(day.date, now)}
                  </span>{" "}
                  <span
                    className="font-mono text-[12px] font-normal"
                    style={{ color: text(0.45) }}
                  >
                    {formatShortDate(day.date)}
                  </span>
                  {day.date === today && (
                    <span
                      aria-hidden="true"
                      className="ml-2 inline-block h-1.5 w-1.5 rounded-full align-middle"
                      style={{ background: "#22c55e" }}
                    />
                  )}
                </p>

                {day.sessions.length > 0 && (
                  <p className="font-mono text-[12px]" style={{ color: text(0.45) }}>
                    {day.sessions.length} session
                    {day.sessions.length === 1 ? "" : "s"} · ~{day.minutes} min
                  </p>
                )}
              </div>

              {day.sessions.length === 0 ? (
                <p
                  className="mt-2 text-[13.5px] italic"
                  style={{ color: text(0.4) }}
                >
                  Rest day or no sessions scheduled
                </p>
              ) : (
                <ul className="mt-3 flex flex-wrap gap-2">
                  {day.sessions.map((session) => (
                    <li key={session.id}>
                      <span
                        className="inline-flex max-w-[240px] items-center gap-1.5 truncate rounded-md px-2.5 py-1 text-[12px]"
                        style={{
                          background: `color-mix(in srgb, ${subjectColour(session.topic.subjectId)} 14%, transparent)`,
                          color: text(0.85),
                        }}
                      >
                        <span
                          aria-hidden="true"
                          className="h-2 w-2 shrink-0 rounded-[2px]"
                          style={{
                            background: subjectColour(session.topic.subjectId),
                          }}
                        />
                        {session.kind === "review"
                          ? `Spaced review: ${session.topic.name}`
                          : session.topic.name}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </li>
        ))}
      </ul>

      <Panel className="mt-5 flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <p className="text-[15px] font-bold" style={{ color: text() }}>
            Want to study something specific?
          </p>
          <p className="mt-1 text-[13.5px]" style={{ color: text(0.55) }}>
            Override the plan and choose your own topic from the notes library.
          </p>
        </div>

        <Button asChild variant="glass" size="sm">
          <Link href="/notes">
            Choose topic
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </Panel>
    </div>
  );
}

function Tag({ colour, children }: { colour: string; children: React.ReactNode }) {
  return (
    <span
      className="rounded-md px-2.5 py-1 text-[11.5px] font-bold"
      style={{
        background: `color-mix(in srgb, ${colour} 16%, transparent)`,
        color: colour,
      }}
    >
      {children}
    </span>
  );
}
