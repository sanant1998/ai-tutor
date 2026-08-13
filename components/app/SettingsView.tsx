"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  Check,
  Lock,
  Palette,
  Pencil,
  RotateCcw,
  Save,
  Languages,
  Sliders,
  User,
} from "lucide-react";

import { LanguagePicker } from "@/components/app/LanguagePicker";
import { Panel } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  A11Y_STORAGE_KEY,
  A11Y_TOGGLES,
  DEFAULT_A11Y,
  applyA11y,
  readA11y,
  type A11yState,
} from "@/lib/a11y";
import { ONBOARDING_STORAGE_KEY } from "@/lib/onboarding";
import { persistProfile } from "@/lib/repository";
import { useAppData } from "@/lib/useAppData";
import {
  EXAMS_STORAGE_KEY,
  PROGRESS_STORAGE_KEY,
  TOUR_STORAGE_KEY,
  chosenSubjects,
  chosenUnits,
} from "@/lib/study";
import {
  DEFAULT_THEME,
  THEMES,
  acc,
  applyTheme,
  onacc,
  readTheme,
  text,
  type ThemeId,
} from "@/lib/theme";

export function SettingsView() {
  const { state, exams, patchState, updateExams } = useAppData();
  const [a11y, setA11y] = useState<A11yState>(DEFAULT_A11Y);
  const [theme, setTheme] = useState<ThemeId>(DEFAULT_THEME);
  const [mounted, setMounted] = useState(false);
  const [saved, setSaved] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  useEffect(() => {
    setA11y(readA11y());
    setTheme(readTheme());
    setMounted(true);
  }, []);

  const update = patchState;

  const saveProfile = () => {
    void persistProfile(state.name, state.lastName);
    setSaved(true);
  };

  const commitA11y = (next: A11yState) => {
    setA11y(next);
    applyA11y(next);
    try {
      window.localStorage.setItem(A11Y_STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* Private browsing: the choice does not persist. */
    }
  };

  const setUnitDate = (subjectId: string, unitId: string, date: string) => {
    const id = `board-${subjectId}-${unitId}`;
    const rest = exams.filter((exam) => exam.id !== id);
    const next = date
      ? [...rest, { id, kind: "board" as const, subjectId, unitId, date }]
      : rest;

    updateExams(next.sort((a, b) => a.date.localeCompare(b.date)));
  };

  const resetEverything = () => {
    [
      ONBOARDING_STORAGE_KEY,
      PROGRESS_STORAGE_KEY,
      EXAMS_STORAGE_KEY,
      TOUR_STORAGE_KEY,
    ].forEach((key) => {
      try {
        window.localStorage.removeItem(key);
      } catch {
        /* Nothing to clear. */
      }
    });
    window.location.href = "/onboarding";
  };

  const subjects = chosenSubjects(state);

  return (
    <div>
      <p
        className="font-mono text-[11.5px] font-bold uppercase tracking-[0.16em]"
        style={{ color: acc() }}
      >
        Settings
      </p>
      <h1
        className="font-display mt-3 text-[2rem] font-extrabold leading-[1.05] tracking-[-0.035em] sm:text-[2.4rem]"
        style={{ color: text() }}
      >
        Tune your setup.
      </h1>
      <p className="mt-2 text-[15px]" style={{ color: text(0.6) }}>
        Profile, exams, study preferences, and account.
      </p>

      <div className="mt-7 max-w-3xl space-y-5">
        {/* The tutor teaches in whichever of three languages the student picks,
            and the picker used to live only on /tutor. A student who reaches
            this screen looking for it should find it, and Settings is where
            everyone looks first. Both mount the same component and write the
            same column. */}
        <Card icon={<Languages className="h-[18px] w-[18px]" />} title="Teaching language">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[14px]" style={{ color: text(0.65) }}>
              Tutor kis bhasha me padhaye. Agle session se lagoo hoga — beech
              me badalne se baat-cheet ka sira toot jaata hai.
            </p>
            <LanguagePicker align="left" />
          </div>
        </Card>

        <Card icon={<User className="h-[18px] w-[18px]" />} title="Profile">
          <div className="grid gap-4 sm:grid-cols-2">
            <Labelled label="First name" htmlFor="first-name">
              <Input
                id="first-name"
                value={state.name}
                onChange={(event) => {
                  setSaved(false);
                  update({ name: event.target.value });
                }}
              />
            </Labelled>
            <Labelled label="Last name" htmlFor="last-name">
              <Input
                id="last-name"
                value={state.lastName}
                onChange={(event) => {
                  setSaved(false);
                  update({ lastName: event.target.value });
                }}
              />
            </Labelled>
          </div>

          <div className="mt-5 flex items-center justify-end gap-3">
            {saved && (
              <span className="text-[13px]" style={{ color: acc() }}>
                Saved
              </span>
            )}
            <Button size="sm" onClick={saveProfile}>
              <Save className="h-4 w-4" />
              Save profile
            </Button>
          </div>
        </Card>

        <Card icon={<Lock className="h-[18px] w-[18px]" />} title="Subscription">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-[15px] font-bold" style={{ color: text() }}>
                Starter plan
              </p>
              <p className="mt-1 text-[13.5px]" style={{ color: text(0.55) }}>
                You do not have an active paid subscription.
              </p>
            </div>
            <Button asChild variant="glass" size="sm">
              <Link href="/pricing">View plans</Link>
            </Button>
          </div>
        </Card>

        <Card
          icon={<CalendarDays className="h-[18px] w-[18px]" />}
          title="Exam setup"
        >
          {subjects.length === 0 ? (
            <p className="text-[14px]" style={{ color: text(0.55) }}>
              No subjects picked yet.{" "}
              <Link href="/onboarding" style={{ color: acc() }}>
                Run onboarding
              </Link>{" "}
              to set them up.
            </p>
          ) : (
            <div className="space-y-6">
              {subjects.map((subject) => (
                <div key={subject.id}>
                  <p
                    className="flex items-center gap-2 text-[14.5px] font-bold"
                    style={{ color: text() }}
                  >
                    <span aria-hidden="true">{subject.glyph}</span>
                    {subject.name}
                  </p>

                  <ul className="mt-3 space-y-px overflow-hidden rounded-xl">
                    {chosenUnits(state, subject.id).map((unit) => {
                      const id = `board-${subject.id}-${unit.id}`;
                      const exam = exams.find((entry) => entry.id === id);
                      const isEditing = editing === id;

                      return (
                        <li
                          key={unit.id}
                          className="flex flex-wrap items-center gap-3 px-4 py-3"
                          style={{
                            background: text(0.03),
                            borderLeft: `2px solid ${acc(0.5)}`,
                          }}
                        >
                          <span
                            className="w-8 shrink-0 font-mono text-[11.5px] font-bold"
                            style={{ color: acc() }}
                          >
                            {unit.code}
                          </span>

                          <span
                            className="min-w-0 flex-1 truncate text-[14.5px]"
                            style={{ color: text(0.9) }}
                          >
                            {unit.name}
                          </span>

                          {isEditing ? (
                            <input
                              type="date"
                              autoFocus
                              defaultValue={exam?.date ?? ""}
                              onBlur={(event) => {
                                setUnitDate(subject.id, unit.id, event.target.value);
                                setEditing(null);
                              }}
                              className="h-9 rounded-lg px-2 text-[13px] outline-none"
                              style={{
                                background: text(0.05),
                                border: `1px solid ${acc(0.4)}`,
                                color: text(0.9),
                              }}
                            />
                          ) : (
                            <span
                              className="font-mono text-[12px]"
                              style={{ color: exam ? text(0.6) : text(0.35) }}
                            >
                              {exam
                                ? new Date(`${exam.date}T00:00:00`).toLocaleDateString(
                                    "en-GB",
                                    { day: "2-digit", month: "short", year: "numeric" },
                                  )
                                : "No date"}
                            </span>
                          )}

                          <button
                            type="button"
                            onClick={() => setEditing(isEditing ? null : id)}
                            aria-label={`Edit ${unit.name} exam date`}
                            style={{ color: acc() }}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card icon={<Palette className="h-[18px] w-[18px]" />} title="Theme">
          <div className="flex flex-wrap gap-2">
            {THEMES.map((option) => {
              const active = mounted && option.id === theme;
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    applyTheme(option.id);
                    setTheme(option.id);
                  }}
                  className="w-[96px] rounded-xl p-2 text-left transition-transform hover:-translate-y-0.5"
                  style={{
                    background: text(0.04),
                    border: `1px solid ${active ? text(0.7) : text(0.1)}`,
                  }}
                >
                  <span className="flex gap-1" aria-hidden="true">
                    {option.chips.map((chip, index) => (
                      <span
                        key={index}
                        className="h-4 flex-1 rounded-[3px]"
                        style={{ background: chip, border: `1px solid ${text(0.12)}` }}
                      />
                    ))}
                  </span>
                  <span className="mt-2 flex items-center justify-between gap-1">
                    <span
                      className="truncate text-[11.5px] font-bold"
                      style={{ color: text(active ? 1 : 0.7) }}
                    >
                      {option.label}
                    </span>
                    {active && (
                      <Check className="h-3 w-3 shrink-0" style={{ color: acc() }} />
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </Card>

        <Card
          icon={<Sliders className="h-[18px] w-[18px]" />}
          title="Study preferences"
        >
          <Labelled label={`Daily study hours — ${state.dailyHours}h`} htmlFor="hours">
            <input
              id="hours"
              type="range"
              min={1}
              max={6}
              step={1}
              value={state.dailyHours}
              onChange={(event) => update({ dailyHours: Number(event.target.value) })}
              className="h-1.5 w-full cursor-pointer appearance-none rounded-full outline-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-[var(--acc)] [&::-webkit-slider-thumb]:bg-[var(--bg)]"
              style={{
                background: `linear-gradient(90deg, ${acc()} ${((state.dailyHours - 1) / 5) * 100}%, ${text(0.12)} ${((state.dailyHours - 1) / 5) * 100}%)`,
              }}
            />
          </Labelled>

          <div className="mt-6 space-y-1">
            {A11Y_TOGGLES.map((toggle) => {
              const on = mounted && a11y[toggle.key];
              return (
                <button
                  key={toggle.key}
                  type="button"
                  role="switch"
                  aria-checked={on}
                  onClick={() =>
                    commitA11y({ ...a11y, [toggle.key]: !a11y[toggle.key] })
                  }
                  className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left"
                >
                  <span
                    aria-hidden="true"
                    className="relative h-5 w-9 shrink-0 rounded-full transition-colors"
                    style={{ background: on ? acc() : text(0.18) }}
                  >
                    <span
                      className="absolute top-0.5 h-4 w-4 rounded-full transition-all"
                      style={{
                        background: on ? onacc() : text(0.7),
                        left: on ? "18px" : "2px",
                      }}
                    />
                  </span>
                  <span
                    className="text-[13.5px] font-semibold"
                    style={{ color: text(0.8) }}
                  >
                    {toggle.label}
                  </span>
                </button>
              );
            })}
          </div>
        </Card>

        <Card icon={<RotateCcw className="h-[18px] w-[18px]" />} title="Account">
          <p className="text-[13.5px] leading-[1.6]" style={{ color: text(0.55) }}>
            Clears your answers, progress, exam dates and the tour flag on this
            device, then restarts onboarding. Your account and its saved rows
            are left alone — deleting those is a separate, deliberate step.
          </p>
          <Button variant="glass" size="sm" className="mt-4" onClick={resetEverything}>
            <RotateCcw className="h-4 w-4" />
            Reset everything
          </Button>
        </Card>
      </div>
    </div>
  );
}

function Card({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Panel className="p-5 sm:p-6">
      <div className="flex items-center gap-3">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
          style={{ background: acc(0.14), color: acc() }}
        >
          {icon}
        </span>
        <h2
          className="font-display text-[1.15rem] font-extrabold tracking-[-0.015em]"
          style={{ color: text() }}
        >
          {title}
        </h2>
      </div>

      <div className="mt-5">{children}</div>
    </Panel>
  );
}

function Labelled({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="block text-[13.5px] font-semibold"
        style={{ color: text(0.7) }}
      >
        {label}
      </label>
      <div className="mt-2">{children}</div>
    </div>
  );
}
