"use client";

import { persistOnboarding } from "@/lib/repository";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check } from "lucide-react";

import { GlassCard } from "@/components/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DEFAULT_ONBOARDING,
  EXAM_BOARDS,
  readOnboarding,
  CLASSES,
  classBand,
  coveredSubjects,
  type BoardId,
  type ExamBoard,
  type OnboardingState,
} from "@/lib/onboarding";
import {
  DEFAULT_THEME,
  THEMES,
  acc,
  applyTheme,
  readTheme,
  text,
  type ThemeId,
} from "@/lib/theme";

export function StepOne() {
  const router = useRouter();
  const [state, setState] = useState<OnboardingState>(DEFAULT_ONBOARDING);
  const [theme, setTheme] = useState<ThemeId>(DEFAULT_THEME);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setState(readOnboarding());
    setTheme(readTheme());
    setMounted(true);
  }, []);

  const update = (patch: Partial<OnboardingState>) => {
    const next = { ...state, ...patch };
    setState(next);
    persistOnboarding(next);
  };

  const chooseTheme = (id: ThemeId) => {
    applyTheme(id);
    setTheme(id);
  };

  const selectedBoard = EXAM_BOARDS.find((board) => board.id === state.boardId);
  const ready = Boolean(selectedBoard && state.classLevel);

  const onContinue = () => {
    if (!ready) return;
    persistOnboarding(state);
    router.push("/onboarding/2");
  };

  /* Changing board invalidates the subject picks made against the old one. */
  const chooseBoard = (boardId: string) => {
    update(
      boardId === state.boardId
        ? { boardId }
        : { boardId, classLevel: null, subjectIds: [], unitIds: [] },
    );
  };

  return (
    <div className="space-y-12">
      <GlassCard className="p-6 sm:p-7">
        <Label htmlFor="display-name" className="normal-case tracking-normal">
          <span
            className="font-display block text-[17px] font-extrabold tracking-[-0.01em]"
            style={{ color: text() }}
          >
            What should we call you?
          </span>
        </Label>
        <p className="mt-1.5 text-[13.5px]" style={{ color: text(0.55) }}>
          We&apos;ll use this name when your tutor talks to you.
        </p>
        <Input
          id="display-name"
          className="mt-4"
          autoComplete="given-name"
          placeholder="Ram"
          value={state.name}
          onChange={(event) => update({ name: event.target.value })}
        />
      </GlassCard>

      <section aria-labelledby="theme-label">
        <p
          id="theme-label"
          className="text-[11px] font-bold uppercase tracking-[0.2em]"
          style={{ color: text(0.5) }}
        >
          Pick a theme
        </p>

        <div
          role="radiogroup"
          aria-labelledby="theme-label"
          className="mt-4 flex flex-wrap gap-2.5"
        >
          {THEMES.map((option) => {
            const active = mounted && option.id === theme;
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => chooseTheme(option.id)}
                className="glass w-[104px] rounded-2xl p-2.5 text-left transition-all hover:-translate-y-0.5"
                style={{
                  borderColor: active ? text(0.75) : undefined,
                  boxShadow: active ? `0 0 0 1px ${text(0.4)}` : undefined,
                }}
              >
                <span className="flex gap-1" aria-hidden="true">
                  {option.chips.map((chip, index) => (
                    <span
                      key={index}
                      className="h-5 flex-1 rounded-[3px]"
                      style={{
                        background: chip,
                        border: `1px solid ${text(0.14)}`,
                      }}
                    />
                  ))}
                </span>

                <span className="mt-2 flex items-center justify-between gap-1">
                  <span
                    className="truncate text-[12px] font-bold"
                    style={{ color: text(active ? 1 : 0.75) }}
                  >
                    {option.label}
                  </span>
                  {active && (
                    <Check
                      className="h-3.5 w-3.5 shrink-0"
                      style={{ color: acc() }}
                    />
                  )}
                </span>
              </button>
            );
          })}
        </div>

        <p className="mt-3 text-[12.5px]" style={{ color: text(0.45) }}>
          You can change this anytime in Settings.
        </p>
      </section>

      <section aria-labelledby="board-heading">
        <h1
          id="board-heading"
          className="font-display text-[2.2rem] font-extrabold leading-[1.05] tracking-[-0.035em] sm:text-[2.9rem]"
          style={{ color: text() }}
        >
          Which exam board?
        </h1>
        <p className="mt-3 text-[15px]" style={{ color: text(0.6) }}>
          We tailor every question, mark scheme and tip to your board.
        </p>

        <div
          role="radiogroup"
          aria-labelledby="board-heading"
          className="mt-7 grid gap-3.5 sm:grid-cols-2"
        >
          {EXAM_BOARDS.map((board) => (
            <BoardCard
              key={board.id}
              board={board}
              selected={mounted && state.boardId === board.id}
              onSelect={() => chooseBoard(board.id)}
            />
          ))}
        </div>

        {selectedBoard && (
          <>
            <h2
              id="class-heading"
              className="font-display mt-10 text-[1.6rem] font-extrabold tracking-[-0.025em]"
              style={{ color: text() }}
            >
              Which class are you in?
            </h2>
            <p className="mt-2 text-[15px]" style={{ color: text(0.6) }}>
              Your chapters, plan and questions all come from this year&apos;s
              syllabus.
            </p>

            <div
              role="radiogroup"
              aria-labelledby="class-heading"
              className="mt-5 flex flex-wrap gap-2.5"
            >
              {CLASSES.map((level) => {
                /* A class with no sourced chapter list yet is shown, but
                   plainly marked — hiding it would look like the board is
                   unsupported, and inventing chapters is what this rebuild
                   exists to stop. */
                const readyCount = coveredSubjects(
                  selectedBoard.id as BoardId,
                  level,
                ).length;
                const active = mounted && state.classLevel === level;

                return (
                  <button
                    key={level}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    disabled={readyCount === 0}
                    onClick={() =>
                      update({ classLevel: level, subjectIds: [], unitIds: [] })
                    }
                    className="flex h-[64px] w-[64px] flex-col items-center justify-center rounded-2xl transition-transform disabled:cursor-not-allowed"
                    title={
                      readyCount === 0
                        ? "Chapters for this class are not loaded yet"
                        : `${readyCount} subject${readyCount === 1 ? "" : "s"} ready`
                    }
                    style={{
                      background: active ? acc(0.16) : text(0.04),
                      border: `1px solid ${active ? acc(0.45) : text(0.1)}`,
                      color: readyCount === 0 ? text(0.28) : text(active ? 1 : 0.75),
                      opacity: readyCount === 0 ? 0.55 : 1,
                    }}
                  >
                    <span className="font-display text-[1.25rem] font-extrabold leading-none">
                      {level}
                    </span>
                    <span
                      className="mt-1 font-mono text-[9px] uppercase tracking-[0.1em]"
                      style={{ color: readyCount === 0 ? text(0.3) : acc() }}
                    >
                      {readyCount === 0 ? "soon" : `${readyCount} ready`}
                    </span>
                  </button>
                );
              })}
            </div>

            {state.classLevel && classBand(state.classLevel) === "primary" && (
              <p
                className="mt-4 rounded-xl p-3.5 text-[13.5px] leading-[1.55]"
                style={{
                  background: acc(0.08),
                  border: `1px solid ${acc(0.22)}`,
                  color: text(0.7),
                }}
              >
                For Class {state.classLevel} this works best with a parent —
                the plan and reminders are written for whoever is sitting with
                the child.
              </p>
            )}
          </>
        )}

        <div className="mt-8">
          <Button size="lg" onClick={onContinue} disabled={!ready}>
            {!selectedBoard
              ? "Pick a board to continue"
              : !state.classLevel
                ? "Pick your class to continue"
                : `Continue · ${selectedBoard.name} Class ${state.classLevel}`}
            <ArrowRight className="h-[18px] w-[18px]" />
          </Button>
        </div>
      </section>
    </div>
  );
}

function BoardCard({
  board,
  selected,
  onSelect,
}: {
  board: ExamBoard;
  selected: boolean;
  onSelect: () => void;
}) {
  if (board.comingSoon) {
    return (
      <div className="glass relative rounded-2xl p-5 opacity-60">
        <div className="flex items-start justify-between gap-3">
          <p
            className="font-display text-[1.05rem] font-extrabold tracking-[-0.01em]"
            style={{ color: text(0.7) }}
          >
            {board.name}
          </p>
          <span
            className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em]"
            style={{ background: text(0.08), color: text(0.5) }}
          >
            Coming soon
          </span>
        </div>
        <p className="mt-3 text-[13.5px]" style={{ color: text(0.45) }}>
          {board.detail}
        </p>
      </div>
    );
  }

  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className="glass relative rounded-2xl p-5 text-left transition-all hover:-translate-y-0.5 hover:border-[var(--line-strong)]"
      style={
        selected
          ? { borderColor: acc(0.8), background: acc(0.08) }
          : undefined
      }
    >
      <div className="flex items-start justify-between gap-3">
        <p
          className="font-display text-[1.05rem] font-extrabold tracking-[-0.01em]"
          style={{ color: text() }}
        >
          {board.name}
        </p>

        <span
          aria-hidden="true"
          className="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px]"
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

      <p className="mt-3 text-[13.5px]" style={{ color: text(0.62) }}>
        {board.detail}
      </p>
      <p
        className="mt-2 font-mono text-[12px] leading-relaxed"
        style={{ color: text(0.42) }}
      >
        Spec codes: {board.specCodes}
      </p>
    </button>
  );
}
