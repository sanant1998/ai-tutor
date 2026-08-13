"use client";

import { useEffect, useMemo, useState } from "react";
import { Bell, CalendarDays, Map, RotateCw, TrendingUp, X } from "lucide-react";

import { JourneyTab } from "@/components/app/roadmap/JourneyTab";
import { CalendarTab } from "@/components/app/roadmap/CalendarTab";
import { ThisWeekTab } from "@/components/app/roadmap/ThisWeekTab";
import {
  activeDays,
  buildSchedule,
  totalSessions,
  type PlannedDay,
} from "@/lib/schedule";
import { buildRoadmap } from "@/lib/study";
import { useAppData } from "@/lib/useAppData";
import { acc, acc2, onacc, text } from "@/lib/theme";

type Tab = "journey" | "calendar" | "week";

const TABS: { id: Tab; label: string; icon: typeof Map }[] = [
  { id: "journey", label: "Journey", icon: Map },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
  { id: "week", label: "This Week", icon: TrendingUp },
];

export function RoadmapModule() {
  const [tab, setTab] = useState<Tab>("journey");
  const { state, progress, now } = useAppData();
  const [reminderOpen, setReminderOpen] = useState(true);
  /* Bumped by Regenerate, which re-derives the plan from the same answers. */
  const [seed, setSeed] = useState(0);

  const roadmap = useMemo(() => buildRoadmap(state), [state]);

  const days: PlannedDay[] = useMemo(
    () => (now ? buildSchedule(state, roadmap, now) : []),
    [state, roadmap, now, seed],
  );

  const sessions = totalSessions(days);
  const doneSessions = days
    .flatMap((day) => day.sessions)
    .filter((session) => progress.doneSessions.includes(session.id)).length;

  const percent = sessions ? Math.round((doneSessions / sessions) * 100) : 0;

  return (
    <div className="-mx-5 -mt-20 sm:-mx-8 lg:-mt-10">
      <header
        className="relative overflow-hidden px-5 pb-6 pt-20 sm:px-8 lg:pt-10"
        style={{
          background: `linear-gradient(160deg, ${acc(0.16)}, transparent 70%)`,
        }}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage: `linear-gradient(${text(0.05)} 1px, transparent 1px), linear-gradient(90deg, ${text(0.05)} 1px, transparent 1px)`,
            backgroundSize: "38px 38px",
          }}
        />

        <div className="relative mx-auto max-w-[1180px]">
          <h1
            className="font-display text-[2rem] font-extrabold leading-[1.05] tracking-[-0.035em] sm:text-[2.5rem]"
            style={{ color: text() }}
          >
            {state.name || "Your"}
            {state.name ? "'s" : ""}{" "}
            <span
              style={{
                background: `linear-gradient(100deg, ${acc2()}, #e879f9)`,
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              Revision Journey
            </span>
          </h1>

          <dl className="mt-5 flex flex-wrap gap-x-9 gap-y-4">
            <Stat value={`${percent}%`} label="Progress" />
            <Stat value={`${doneSessions} / ${sessions}`} label="Sessions done" />
            <Stat value={`${progress.streak} days 🔥`} label="Streak" />
            <Stat value={String(activeDays(days))} label="Days planned" />
          </dl>

          <div
            className="mt-5 h-1.5 max-w-md overflow-hidden rounded-full"
            style={{ background: text(0.12) }}
          >
            <div
              className="h-full rounded-full transition-[width] duration-500"
              style={{ width: `${percent}%`, background: acc() }}
            />
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <div role="tablist" aria-label="Roadmap views" className="flex gap-2">
              {TABS.map((item) => {
                const Icon = item.icon;
                const active = tab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setTab(item.id)}
                    className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-[13.5px] font-bold transition-colors"
                    style={{
                      background: active ? text(0.1) : text(0.04),
                      border: `1px solid ${active ? text(0.25) : "transparent"}`,
                      color: active ? text() : text(0.6),
                    }}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => setSeed((value) => value + 1)}
              className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.14em] transition-colors"
              style={{ background: text(0.05), color: text(0.5) }}
            >
              <RotateCw className="h-3 w-3" />
              Regenerate
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1180px] px-5 pb-10 pt-6 sm:px-8">
        {reminderOpen && (
          <div
            className="mb-6 flex flex-wrap items-center gap-4 rounded-2xl px-5 py-4"
            style={{ background: text(0.035), border: `1px solid ${text(0.08)}` }}
          >
            <Bell className="h-[18px] w-[18px] shrink-0" style={{ color: acc() }} />
            <p className="flex-1 text-[14.5px] font-bold" style={{ color: text() }}>
              Get a reminder when your next study session starts?
            </p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  if ("Notification" in window) Notification.requestPermission();
                  setReminderOpen(false);
                }}
                className="rounded-lg px-4 py-1.5 text-[13px] font-bold"
                style={{ background: acc(), color: onacc() }}
              >
                Allow
              </button>
              <button
                type="button"
                onClick={() => setReminderOpen(false)}
                className="text-[13px] font-semibold"
                style={{ color: text(0.55) }}
              >
                Not now
              </button>
            </div>
            <button
              type="button"
              onClick={() => setReminderOpen(false)}
              aria-label="Dismiss"
              style={{ color: text(0.4) }}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {tab === "journey" && (
          <JourneyTab state={state} days={days} progress={progress} />
        )}
        {tab === "calendar" && now && <CalendarTab days={days} now={now} />}
        {tab === "week" && now && (
          <ThisWeekTab state={state} days={days} now={now} />
        )}
      </div>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <dd
        className="font-display text-[1.5rem] font-extrabold leading-none tracking-[-0.02em]"
        style={{ color: text() }}
      >
        {value}
      </dd>
      <dt
        className="mt-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.16em]"
        style={{ color: text(0.45) }}
      >
        {label}
      </dt>
    </div>
  );
}
