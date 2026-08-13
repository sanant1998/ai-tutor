"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";

import { Panel } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { SUBJECTS } from "@/lib/onboarding";
import {
  addDays,
  daySlice,
  isoDate,
  startOfWeek,
  subjectColour,
  type PlannedDay,
} from "@/lib/schedule";
import { text } from "@/lib/theme";

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function CalendarTab({
  days,
  now,
}: {
  days: PlannedDay[];
  now: Date;
}) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(now));
  /* Busy slots are the student's own commitments; the plan flows around them
     once the scheduler reads them, which is the next thing to wire. */
  const [busy, setBusy] = useState<string[]>([]);

  const week = daySlice(days, weekStart, 7);
  const today = isoDate(now);

  const monthLabel = weekStart.toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });

  const rangeLabel = `${weekStart.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} — ${addDays(weekStart, 6).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2
            className="font-display text-[1.4rem] font-extrabold tracking-[-0.02em]"
            style={{ color: text() }}
          >
            {monthLabel}
          </h2>
          <p className="mt-1 text-[13.5px]" style={{ color: text(0.5) }}>
            {rangeLabel}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <IconButton
            label="Previous week"
            onClick={() => setWeekStart((value) => addDays(value, -7))}
          >
            <ChevronLeft className="h-4 w-4" />
          </IconButton>

          <button
            type="button"
            onClick={() => setWeekStart(startOfWeek(now))}
            className="rounded-lg px-3.5 py-2 text-[13px] font-bold"
            style={{ background: text(0.06), color: text(0.75) }}
          >
            Today
          </button>

          <IconButton
            label="Next week"
            onClick={() => setWeekStart((value) => addDays(value, 7))}
          >
            <ChevronRight className="h-4 w-4" />
          </IconButton>

          <Button
            variant="glass"
            size="sm"
            onClick={() =>
              setBusy((value) => [...value, isoDate(addDays(weekStart, 0))])
            }
          >
            <Plus className="h-4 w-4" />
            Add busy slot
          </Button>
        </div>
      </div>

      <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2">
        {SUBJECTS.map((subject) => (
          <LegendDot
            key={subject.id}
            colour={subjectColour(subject.id)}
            label={subject.name}
          />
        ))}
        <LegendDot colour={text(0.35)} label="Busy" />
        <LegendDot colour="#22c55e" label="Done" />
      </ul>

      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {week.map((day, index) => {
          const isToday = day.date === today;
          const dayNumber = new Date(`${day.date}T00:00:00`).getDate();

          return (
            <Panel
              key={day.date}
              className="flex min-h-[260px] flex-col p-0"
              style={
                isToday
                  ? { borderColor: "#22c55e", background: "rgb(34 197 94 / 0.06)" }
                  : undefined
              }
            >
              <div
                className="px-3 py-3 text-center"
                style={{ borderBottom: `1px solid ${text(0.07)}` }}
              >
                <p
                  className="font-mono text-[10px] font-bold uppercase tracking-[0.16em]"
                  style={{ color: text(0.4) }}
                >
                  {WEEKDAY_LABELS[index]}
                </p>
                <p
                  className="font-display mt-1 text-[1.35rem] font-extrabold leading-none"
                  style={{ color: isToday ? "#22c55e" : text(0.85) }}
                >
                  {dayNumber}
                </p>
              </div>

              <div className="flex-1 space-y-1.5 p-2">
                {busy.includes(day.date) && (
                  <Chip
                    kindLabel="Busy"
                    title="Blocked out"
                    colour={text(0.35)}
                  />
                )}

                {day.sessions.map((session) => (
                  <Chip
                    key={session.id}
                    kindLabel={session.kind === "learn" ? "Learn" : "Review"}
                    title={
                      session.kind === "review"
                        ? `Spaced review: ${session.topic.name}`
                        : session.topic.name
                    }
                    colour={subjectColour(session.topic.subjectId)}
                  />
                ))}
              </div>

              {day.minutes > 0 && (
                <p
                  className="px-3 pb-2 text-right font-mono text-[10px]"
                  style={{ color: text(0.4) }}
                >
                  {day.minutes} min
                </p>
              )}
            </Panel>
          );
        })}
      </div>
    </div>
  );
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex h-9 w-9 items-center justify-center rounded-lg"
      style={{ background: text(0.06), color: text(0.7) }}
    >
      {children}
    </button>
  );
}

function LegendDot({ colour, label }: { colour: string; label: string }) {
  return (
    <li className="flex items-center gap-2">
      <span
        aria-hidden="true"
        className="h-2.5 w-2.5 rounded-full"
        style={{ background: colour }}
      />
      <span className="text-[12.5px]" style={{ color: text(0.55) }}>
        {label}
      </span>
    </li>
  );
}

function Chip({
  kindLabel,
  title,
  colour,
}: {
  kindLabel: string;
  title: string;
  colour: string;
}) {
  return (
    <div
      className="rounded-md px-2 py-1.5"
      style={{
        background: `color-mix(in srgb, ${colour} 14%, transparent)`,
        borderLeft: `2px solid ${colour}`,
      }}
    >
      <p className="text-[10px] font-bold" style={{ color: colour }}>
        {kindLabel}
      </p>
      <p
        className="truncate text-[11.5px] leading-tight"
        style={{ color: text(0.8) }}
      >
        {title}
      </p>
    </div>
  );
}
