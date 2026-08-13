"use client";

import { useMemo } from "react";
import Link from "next/link";
import { CalendarPlus, Check, Flame, Play, SkipForward } from "lucide-react";

import { Kicker, Panel } from "@/components/app/ui";
import { ParentLinkBanner } from "@/components/app/ParentLinkBanner";
import { Button } from "@/components/ui/button";
import {
  buildSchedule,
  dressDay,
  type DisplaySession,
} from "@/lib/schedule";
import { useAppData } from "@/lib/useAppData";
import {
  buildRoadmap,
  completeSession,
  coverageOf,
  daysUntil,
  greeting,
  nextExam,

  urgencyScore,
  type Progress,
} from "@/lib/study";
import { acc, acc2, acc3, text } from "@/lib/theme";

const QUICK_TILES = [
  { href: "/notes", label: "Notes", glyph: "📖" },
  { href: "/questions", label: "Practice", glyph: "📝" },
  { href: "/exams", label: "Exam dates", glyph: "⏳" },
  { href: "/mock-papers", label: "Mocks", glyph: "🎯" },
];

export function TodayView() {
  /* One hook owns the student's data: local copy first so the page paints
     instantly, then the server row once it arrives. */
  const { state, progress, exams, now, updateProgress } = useAppData();

  const roadmap = useMemo(() => buildRoadmap(state), [state]);

  const upcoming = now ? nextExam(exams, now) : undefined;
  const daysToExam = upcoming && now ? daysUntil(upcoming.date, now) : null;

  /* One schedule drives both this page and the roadmap. */
  const sessions: DisplaySession[] = useMemo(() => {
    if (!now) return [];
    const days = buildSchedule(state, roadmap, now, 3);
    return dressDay(days[0], now, daysToExam);
  }, [state, roadmap, now, daysToExam]);

  const isDone = (session: DisplaySession) =>
    progress.doneSessions.includes(session.id);

  const doneToday = sessions.filter(isDone).length;

  const minutesDone = sessions
    .filter(isDone)
    .reduce((total, session) => total + session.minutes, 0);

  const urgency = urgencyScore(daysToExam, coverageOf(roadmap, progress));

  const update = updateProgress;

  const onComplete = (sessionId: string, topicId: string, minutes: number) => {
    if (!now) return;
    update(completeSession(progress, sessionId, topicId, now, minutes));
  };

  const onSkip = (sessionId: string) => {
    update({
      ...progress,
      skipped: progress.skipped.includes(sessionId)
        ? progress.skipped.filter((id) => id !== sessionId)
        : [...progress.skipped, sessionId],
    });
  };

  return (
    <div>
      {/* A pending parent link, if there is one. Above everything else because
          it is a question waiting on an answer, and it renders nothing at all
          the rest of the time. */}
      <div className="mb-4 space-y-3">
        <ParentLinkBanner />
      </div>

      {/* The hero and the two headline cards share one surface, as in the
          live app, so the page opens with a single block rather than four. */}
      <Panel className="p-5 sm:p-7">
        <div className="grid gap-6 lg:grid-cols-[1fr_330px]">
          <div className="min-w-0">
            <Kicker>Study workspace</Kicker>
            <h1
              className="font-display mt-3 text-[2rem] font-extrabold leading-[1.05] tracking-[-0.035em] sm:text-[2.6rem]"
              style={{ color: text() }}
            >
              {now ? greeting(now) : "Hello"}, {state.name || "there"}. Your
              revision desk for the day.
            </h1>
            <p className="mt-3 text-[15px]" style={{ color: text(0.6) }}>
              {upcoming
                ? `Next exam in ${daysToExam} days. Your plan is paced to it.`
                : "No exam dates set yet. Add them so we can pace your plan."}
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              <Chip tone={acc2}>
                <Flame className="h-3.5 w-3.5" />
                {progress.streak} day streak
              </Chip>
              <Chip tone={acc3}>
                <Check className="h-3.5 w-3.5" />
                {doneToday}/{sessions.length} sessions
              </Chip>
            </div>
          </div>

          <div className="space-y-4">
            <Panel className="p-5" data-tour="countdown">
              <Kicker>Next exam</Kicker>
              {upcoming ? (
                <>
                  <p
                    className="font-display mt-3 text-[1.3rem] font-extrabold tracking-[-0.02em]"
                    style={{
                      color:
                        daysToExam !== null && daysToExam < 14 ? acc2() : text(),
                    }}
                  >
                    {daysToExam} days away
                  </p>
                  <p className="mt-1.5 text-[13.5px]" style={{ color: text(0.55) }}>
                    {upcoming.date}
                  </p>
                </>
              ) : (
                <>
                  <p
                    className="font-display mt-3 text-[1.2rem] font-extrabold tracking-[-0.02em]"
                    style={{ color: text() }}
                  >
                    Set your first exam
                  </p>
                  <p className="mt-1.5 text-[13.5px]" style={{ color: text(0.55) }}>
                    Open Exams to add dates.
                  </p>
                </>
              )}
            </Panel>

            <Panel className="p-5">
              <Kicker>Today&apos;s focus</Kicker>
              <p
                className="font-display mt-3 text-[1.3rem] font-extrabold tracking-[-0.02em]"
                style={{ color: text() }}
              >
                {sessions.length - doneToday} open task
                {sessions.length - doneToday === 1 ? "" : "s"}
              </p>
              <p className="mt-1.5 text-[13.5px]" style={{ color: text(0.55) }}>
                Tap a session to jump into a focused study block.
              </p>
            </Panel>
          </div>
        </div>
      </Panel>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_330px]">
        <div className="min-w-0">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {QUICK_TILES.map((tile) => (
              <Link key={tile.href} href={tile.href}>
                <Panel className="p-4 transition-transform hover:-translate-y-0.5">
                  <span aria-hidden="true" className="text-[22px]">
                    {tile.glyph}
                  </span>
                  <p
                    className="mt-2 text-[15px] font-bold"
                    style={{ color: text() }}
                  >
                    {tile.label}
                  </p>
                </Panel>
              </Link>
            ))}
          </div>

          {!upcoming && (
            <Panel className="mt-5 p-5" style={{ borderColor: acc2(0.35) }}>
              <p
                className="flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.16em]"
                style={{ color: acc2() }}
              >
                <CalendarPlus className="h-4 w-4" />
                Exam dates missing
              </p>
              <p className="mt-3 text-[14.5px]" style={{ color: text(0.65) }}>
                Add your real exam dates so your plan, urgency and countdowns
                match the exam day.
              </p>
              <Button asChild size="sm" className="mt-4">
                <Link href="/exams">Add exam dates</Link>
              </Button>
            </Panel>
          )}

          <section className="mt-5" data-tour="plan">
            <Panel className="p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Kicker>Today&apos;s plan</Kicker>
                  <p className="mt-2 text-[14.5px]" style={{ color: text(0.6) }}>
                    Focused sessions, aligned to your next exam.
                  </p>
                </div>
                <p className="font-mono text-[12px]" style={{ color: text(0.5) }}>
                  {doneToday}/{sessions.length} complete
                </p>
              </div>

              <div className="mt-5 space-y-3">
                {sessions.length === 0 && (
                  <p className="text-[14px]" style={{ color: text(0.55) }}>
                    {roadmap.length === 0 ? (
                      <>
                        {/* A link, not a sentence. A student who lands here
                            straight after their parent consented has nothing
                            set up and previously had nothing to click. */}
                        No units picked yet —{" "}
                        <Link href="/onboarding" className="underline">
                          finish setting up
                        </Link>{" "}
                        to build your plan.
                      </>
                    ) : (
                      "Nothing scheduled today — enjoy the rest day."
                    )}
                  </p>
                )}

                {sessions.map((session, index) => (
                  <SessionCard
                    key={session.id}
                    session={session}
                    first={index === 0}
                    done={progress.doneSessions.includes(session.id)}
                    skipped={progress.skipped.includes(session.id)}
                    onComplete={() =>
                      onComplete(session.id, session.topic.id, session.minutes)
                    }
                    onSkip={() => onSkip(session.id)}
                  />
                ))}
              </div>
            </Panel>
          </section>
        </div>

        <aside className="space-y-4">
          <Panel className="p-5">
            <Kicker>Urgency score</Kicker>
            <div className="mt-4 flex items-center gap-4">
              <Gauge value={urgency} />
              <div>
                <p
                  className="font-display text-[1.6rem] font-extrabold leading-none"
                  style={{ color: urgency > 60 ? acc2() : text() }}
                >
                  {urgency}
                </p>
                <p className="mt-1 font-mono text-[11px]" style={{ color: text(0.4) }}>
                  / 100
                </p>
              </div>
            </div>
            <p className="mt-4 text-[13px]" style={{ color: text(0.55) }}>
              {upcoming
                ? "Rises as the exam nears and as topics stay uncovered."
                : "Add an exam date to start the urgency clock."}
            </p>
            <p className="mt-2 font-mono text-[11px]" style={{ color: text(0.35) }}>
              {daysToExam ?? 0}d to nearest exam
            </p>
          </Panel>

          <Panel className="p-5">
            <Kicker>Today</Kicker>
            <div className="mt-3">
              <Row label="Sessions" value={`${doneToday} / ${sessions.length}`} />
              <Row label="Study time" value={`${minutesDone} min`} />
            </div>
          </Panel>

          <Panel className="p-5">
            <div className="flex items-center justify-between">
              <Kicker>Upcoming exams</Kicker>
              <Link
                href="/exams"
                className="text-[12px] font-semibold"
                style={{ color: acc() }}
              >
                Manage
              </Link>
            </div>

            {exams.length === 0 ? (
              <>
                <p className="mt-3 text-[13.5px]" style={{ color: text(0.55) }}>
                  No exam dates yet.
                </p>
                <Button asChild variant="glass" size="sm" className="mt-4 w-full">
                  <Link href="/exams">
                    <CalendarPlus className="h-4 w-4" />
                    Add exam dates
                  </Link>
                </Button>
              </>
            ) : (
              <ul className="mt-3 space-y-2">
                {exams.slice(0, 4).map((exam) => (
                  <li key={exam.id}>
                    <Row
                      label={exam.subjectId}
                      value={now ? `${daysUntil(exam.date, now)}d` : exam.date}
                    />
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </aside>
      </div>
    </div>
  );
}

function Chip({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: (a?: number) => string;
}) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-bold"
      style={{ background: tone(0.14), color: tone() }}
    >
      {children}
    </span>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <span className="text-[14px] capitalize" style={{ color: text(0.6) }}>
        {label}
      </span>
      <span className="font-mono text-[13px] font-bold" style={{ color: text(0.9) }}>
        {value}
      </span>
    </div>
  );
}

function Gauge({ value }: { value: number }) {
  const radius = 26;
  const circumference = Math.PI * radius;

  return (
    <svg viewBox="0 0 72 44" className="h-11 w-[72px]" aria-hidden="true">
      <path
        d="M8 38 A 28 28 0 0 1 64 38"
        fill="none"
        stroke={text(0.12)}
        strokeWidth="7"
        strokeLinecap="round"
      />
      <path
        d="M8 38 A 28 28 0 0 1 64 38"
        fill="none"
        stroke={value > 60 ? acc2() : acc()}
        strokeWidth="7"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - value / 100)}
        style={{ transition: "stroke-dashoffset 600ms ease" }}
      />
    </svg>
  );
}

function SessionCard({
  session,
  first,
  done,
  skipped,
  onComplete,
  onSkip,
}: {
  session: DisplaySession;
  first: boolean;
  done: boolean;
  skipped: boolean;
  onComplete: () => void;
  onSkip: () => void;
}) {
  return (
    <article
      className="rounded-xl p-4 sm:p-5"
      style={{
        background: text(0.03),
        border: `1px solid ${done ? acc3(0.4) : text(0.08)}`,
        opacity: skipped ? 0.55 : 1,
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-[12px]" style={{ color: text(0.55) }}>
          {session.start} – {session.end}
        </p>
        <p className="font-mono text-[11px]" style={{ color: text(0.4) }}>
          FOCUS · {session.minutes}M
        </p>
      </div>

      <p
        className="mt-3 font-mono text-[11px] uppercase tracking-[0.14em]"
        style={{ color: text(0.45) }}
      >
        {session.topic.subjectName} · {session.topic.unitCode}
      </p>

      <h3
        className="font-display mt-1.5 border-l-2 pl-3 text-[1.15rem] font-extrabold tracking-[-0.015em]"
        style={{ color: text(), borderColor: acc() }}
      >
        {session.topic.name}
      </h3>

      <p className="mt-1.5 pl-3 text-[13px]" style={{ color: acc() }}>
        Method: {session.method}
      </p>

      <p
        className="mt-3 border-l pl-3 text-[13px] italic leading-relaxed"
        style={{ color: text(0.5), borderColor: text(0.12) }}
      >
        Why now: {session.why}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          data-tour={first ? "begin" : undefined}
          disabled={done}
          onClick={onComplete}
        >
          <Play className="h-4 w-4" />
          {done ? "Completed" : "Start session"}
        </Button>

        <Button variant="glass" size="sm" disabled={done} onClick={onComplete}>
          Mark complete
        </Button>

        <button
          type="button"
          onClick={onSkip}
          className="inline-flex items-center gap-1.5 px-2 text-[13.5px] font-semibold"
          style={{ color: text(0.5) }}
        >
          <SkipForward className="h-4 w-4" />
          {skipped ? "Unskip" : "Skip"}
        </button>
      </div>
    </article>
  );
}
