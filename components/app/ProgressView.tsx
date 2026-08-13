"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ChevronRight,
  Clock,
  FileText,
  Layers,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";

import { BarChart, LineChart, type Point } from "@/components/app/progress/Charts";
import { Bar, Kicker, Panel } from "@/components/app/ui";
import { addDays, isoDate } from "@/lib/schedule";
import { useAppData } from "@/lib/useAppData";
import {
  buildRoadmap,
  chosenSubjects,
  coverageOf,
  minutesOn,
  totalMinutes,
  type Topic,
} from "@/lib/study";
import { acc, acc2, acc3, text } from "@/lib/theme";

const PERIODS = [
  { id: 7, label: "Last 7 days" },
  { id: 30, label: "Last 30 days" },
  { id: 90, label: "Last 90 days" },
] as const;

const TABS = ["Overview", "Topic mastery", "Mock papers", "Recall"] as const;
type Tab = (typeof TABS)[number];

export function ProgressView() {
  const { state, progress, now } = useAppData();
  const [subjectId, setSubjectId] = useState("all");
  const [period, setPeriod] = useState<number>(30);
  const [tab, setTab] = useState<Tab>("Overview");

  const roadmap = useMemo(() => buildRoadmap(state), [state]);
  const subjects = chosenSubjects(state);

  const scoped: Topic[] = useMemo(
    () =>
      subjectId === "all"
        ? roadmap
        : roadmap.filter((topic) => topic.subjectId === subjectId),
    [roadmap, subjectId],
  );

  const doneScoped = scoped.filter((topic) => progress.done.includes(topic.id));
  const coverage = Math.round(coverageOf(scoped, progress) * 100);

  const hours = now ? totalMinutes(progress, period, now) / 60 : 0;

  const answered = progress.answers.length;
  const accuracy = answered
    ? Math.round(
        (progress.answers.filter((a) => a.correct).length / answered) * 100,
      )
    : 0;

  const mockAvg = progress.mockScores.length
    ? Math.round(
        progress.mockScores.reduce((sum, m) => sum + m.percent, 0) /
          progress.mockScores.length,
      )
    : 0;

  /* Days across the selected window, oldest first. */
  const dailyPoints: Point[] = useMemo(() => {
    if (!now) return [];
    return Array.from({ length: period }, (_, index) => {
      const date = addDays(now, -(period - 1 - index));
      return {
        label: date.toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
        value: minutesOn(progress, isoDate(date)),
      };
    });
  }, [progress, period, now]);

  /* Rolling five-question accuracy. */
  const accuracyPoints: Point[] = useMemo(() => {
    const window = 5;
    if (progress.answers.length < window) return [];

    return progress.answers.slice(window - 1).map((_, index) => {
      const slice = progress.answers.slice(index, index + window);
      const correct = slice.filter((a) => a.correct).length;
      return {
        label: `Q${index + window}`,
        value: Math.round((correct / window) * 100),
      };
    });
  }, [progress.answers]);

  const suggestions = buildSuggestions({
    mocks: progress.mockScores.length,
    hours,
    period,
    coverage,
    answered,
  });

  return (
    <div>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1
            className="font-display text-[2rem] font-extrabold leading-[1.05] tracking-[-0.035em] sm:text-[2.4rem]"
            style={{ color: text() }}
          >
            Progress &amp; Insights
          </h1>
          <p className="mt-2 text-[15px]" style={{ color: text(0.6) }}>
            Track mastery, spot weak topics, and get personalised next steps.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Select
            label="Subject filter"
            value={subjectId}
            onChange={setSubjectId}
            options={[
              { value: "all", label: "All subjects" },
              ...subjects.map((s) => ({ value: s.id, label: s.name })),
            ]}
          />
          <Select
            label="Period filter"
            value={String(period)}
            onChange={(value) => setPeriod(Number(value))}
            options={PERIODS.map((p) => ({ value: String(p.id), label: p.label }))}
          />
        </div>
      </header>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          icon={<Clock className="h-4 w-4" />}
          label="Study time"
          value={`${hours.toFixed(1)}h`}
          tone={acc}
        />
        <StatCard
          icon={<Target className="h-4 w-4" />}
          label="Q accuracy"
          value={`${accuracy}%`}
          foot={`${answered} answered`}
          tone={acc3}
        />
        <StatCard
          icon={<FileText className="h-4 w-4" />}
          label="Mock avg"
          value={`${mockAvg}%`}
          foot={`${progress.mockScores.length} papers`}
          tone={acc2}
        />
        <StatCard
          icon={<Layers className="h-4 w-4" />}
          label="Topics mastered"
          value={String(doneScoped.length)}
          foot={`${coverage}% retention`}
          tone={acc}
        />
        <StatCard
          icon={<Sparkles className="h-4 w-4" />}
          label="Roadmap"
          value={`${coverage}%`}
          foot={`${doneScoped.length}/${scoped.length} done`}
          tone={acc2}
        />
      </div>

      <Panel className="mt-5 p-5 sm:p-6" style={{ background: acc(0.05) }}>
        <p
          className="flex items-center gap-2 text-[15px] font-bold"
          style={{ color: text() }}
        >
          <Sparkles className="h-[18px] w-[18px]" style={{ color: acc() }} />
          Your intelligent revision partner suggests
        </p>

        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {suggestions.map((suggestion) => (
            <Panel key={suggestion.title} className="p-4">
              <div className="flex items-start gap-3">
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                  style={{ background: acc(0.14), color: acc() }}
                >
                  {suggestion.icon}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-[14.5px] font-bold" style={{ color: text() }}>
                      {suggestion.title}
                    </p>
                    <Link
                      href={suggestion.href}
                      className="inline-flex items-center gap-0.5 text-[12.5px] font-semibold"
                      style={{ color: acc() }}
                    >
                      {suggestion.action}
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                  <p
                    className="mt-1.5 text-[13px] leading-[1.55]"
                    style={{ color: text(0.6) }}
                  >
                    {suggestion.body}
                  </p>
                </div>
              </div>
            </Panel>
          ))}
        </div>
      </Panel>

      <div
        className="mt-6 inline-flex flex-wrap gap-1 rounded-xl p-1"
        role="tablist"
        aria-label="Progress views"
        style={{ background: text(0.05) }}
      >
        {TABS.map((item) => {
          const active = tab === item;
          return (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(item)}
              className="rounded-lg px-4 py-2 text-[13.5px] font-semibold transition-colors"
              style={{
                background: active ? text(0.09) : "transparent",
                color: active ? text() : text(0.55),
              }}
            >
              {item}
            </button>
          );
        })}
      </div>

      <div className="mt-4">
        {tab === "Overview" && (
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartPanel
              icon={<Clock className="h-4 w-4" />}
              title="Daily study minutes"
              badge={`${hours.toFixed(1)}h total`}
            >
              <BarChart
                points={dailyPoints}
                colour={acc(0.75)}
                emptyMessage="Complete a session and your minutes appear here."
              />
            </ChartPanel>

            <ChartPanel
              icon={<TrendingUp className="h-4 w-4" />}
              title="Accuracy trend"
              badge="Rolling 5-Q"
            >
              <LineChart
                points={accuracyPoints}
                colour={acc3()}
                emptyMessage="Answer topic wise questions to see your accuracy trend."
              />
            </ChartPanel>
          </div>
        )}

        {tab === "Topic mastery" && (
          <Panel className="p-5 sm:p-6">
            <Kicker>By subject</Kicker>

            {subjects.length === 0 ? (
              <p className="mt-4 text-[14.5px]" style={{ color: text(0.55) }}>
                Nothing to chart yet — pick subjects and units in onboarding.
              </p>
            ) : (
              <ul className="mt-5 space-y-5">
                {subjects.map((subject) => {
                  const topics = roadmap.filter(
                    (topic) => topic.subjectId === subject.id,
                  );
                  const done = topics.filter((topic) =>
                    progress.done.includes(topic.id),
                  ).length;
                  const percent = topics.length
                    ? Math.round((done / topics.length) * 100)
                    : 0;

                  return (
                    <li key={subject.id}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p
                          className="flex items-center gap-2 text-[15px] font-bold"
                          style={{ color: text() }}
                        >
                          <span aria-hidden="true">{subject.glyph}</span>
                          {subject.name}
                        </p>
                        <p
                          className="font-mono text-[12px]"
                          style={{ color: text(0.5) }}
                        >
                          {done}/{topics.length} · {percent}% · target{" "}
                          {state.targetGrades[subject.id] ?? "A"} vs predicted{" "}
                          {state.predictedGrades[subject.id] ?? "C"}
                        </p>
                      </div>
                      <Bar value={percent} className="mt-3" />
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        )}

        {tab === "Mock papers" && (
          <Panel className="p-8 text-center">
            <p className="text-[14.5px]" style={{ color: text(0.6) }}>
              {progress.mockScores.length === 0
                ? "No mock papers sat yet. Sit one and the score history appears here."
                : `${progress.mockScores.length} papers, averaging ${mockAvg}%.`}
            </p>
          </Panel>
        )}

        {tab === "Recall" && (
          <Panel className="p-5 sm:p-6">
            <Kicker>Spaced recall due</Kicker>
            <p className="mt-3 text-[14.5px]" style={{ color: text(0.6) }}>
              {doneScoped.length === 0
                ? "Finish a topic and its spaced reviews get scheduled automatically."
                : `${doneScoped.length} topics are in the review cycle. Each one comes back after 3 days, then after 10.`}
            </p>
          </Panel>
        )}
      </div>
    </div>
  );
}

function buildSuggestions({
  mocks,
  hours,
  period,
  coverage,
  answered,
}: {
  mocks: number;
  hours: number;
  period: number;
  coverage: number;
  answered: number;
}) {
  const all = [
    {
      when: mocks === 0,
      icon: <FileText className="h-4 w-4" />,
      title: "Sit your first mock paper",
      body: "Timed mocks are the single best predictor of exam performance. Start a 30-minute paper to benchmark yourself.",
      action: "Start mock",
      href: "/mock-papers",
    },
    {
      when: hours < 0.5,
      icon: <Clock className="h-4 w-4" />,
      title: "Study time is low this period",
      body: `You logged ${hours.toFixed(1)}h in the last ${period} days. Aim for at least 30 minutes per active day to stay on track.`,
      action: "Open plan",
      href: "/dashboard",
    },
    {
      when: answered === 0,
      icon: <Target className="h-4 w-4" />,
      title: "You have not answered any questions",
      body: "Accuracy is the fastest signal of what you actually know. Drill a topic and the trend chart starts filling in.",
      action: "Practise",
      href: "/questions",
    },
    {
      when: coverage > 0 && coverage < 40,
      icon: <Sparkles className="h-4 w-4" />,
      title: "Keep the roadmap moving",
      body: `You are ${coverage}% through. The plan reorders itself around whatever you leave behind, so finishing sessions beats reshuffling them.`,
      action: "Open roadmap",
      href: "/roadmap",
    },
  ];

  const active = all.filter((item) => item.when);
  return (active.length ? active : all).slice(0, 2);
}

function StatCard({
  icon,
  label,
  value,
  foot,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  foot?: string;
  tone: (a?: number) => string;
}) {
  return (
    <Panel className="p-4">
      <p
        className="flex items-center gap-2 text-[12.5px] font-semibold"
        style={{ color: text(0.6) }}
      >
        <span style={{ color: tone() }}>{icon}</span>
        {label}
      </p>
      <p
        className="font-display mt-2 text-[1.8rem] font-extrabold leading-none tracking-[-0.03em]"
        style={{ color: text() }}
      >
        {value}
      </p>
      {foot && (
        <p className="mt-1.5 text-[12px]" style={{ color: text(0.45) }}>
          {foot}
        </p>
      )}
    </Panel>
  );
}

function ChartPanel({
  icon,
  title,
  badge,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  badge: string;
  children: React.ReactNode;
}) {
  return (
    <Panel className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p
          className="flex items-center gap-2 text-[14.5px] font-bold"
          style={{ color: text() }}
        >
          <span style={{ color: acc() }}>{icon}</span>
          {title}
        </p>
        <span
          className="rounded-full px-2.5 py-1 font-mono text-[11px]"
          style={{ background: text(0.06), color: text(0.55) }}
        >
          {badge}
        </span>
      </div>

      <div className="mt-5">{children}</div>
    </Panel>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-10 cursor-pointer rounded-xl px-3 text-[13.5px] font-medium outline-none"
      style={{
        background: text(0.05),
        border: `1px solid ${text(0.1)}`,
        color: text(0.85),
      }}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value} style={{ color: "#111" }}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
