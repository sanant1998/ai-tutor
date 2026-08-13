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
  THEMES_ENABLED,
  readTheme,
  text,
  type ThemeId,
} from "@/lib/theme";

/* What the child's school has already answered, if a school bought their seat.
   Null for a direct signup — the parent who found the app — who still answers
   every question, because for them nobody else knows. */
type SchoolDefaults = {
  name: string | null;
  board: string | null;
  classLevel: number | null;
  sectionName: string | null;
};

export function StepOne() {
  const router = useRouter();
  const [state, setState] = useState<OnboardingState>(DEFAULT_ONBOARDING);
  const [theme, setTheme] = useState<ThemeId>(DEFAULT_THEME);
  const [mounted, setMounted] = useState(false);
  const [school, setSchool] = useState<SchoolDefaults | null>(null);

  useEffect(() => {
    setState(readOnboarding());
    setTheme(readTheme());
    setMounted(true);
  }, []);

  /* Separate from the read above, and deliberately not awaited before the form
     renders: the questions this replaces are the third and fourth things on
     the page, and blocking the name field on a network call to save two taps
     is the wrong trade. If it arrives, it takes over. */
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch("/api/onboarding/school");
        if (!response.ok) return;

        const payload = (await response.json()) as { school: SchoolDefaults | null };
        if (cancelled || !payload.school?.board) return;

        setSchool(payload.school);

        /* The school's answer overwrites whatever is in local storage. A child
           who half-completed this on their own before being enrolled would
           otherwise keep the class they picked. */
        setState((current) => {
          const next = {
            ...current,
            boardId: payload.school!.board as BoardId,
            classLevel: (payload.school!.classLevel ?? current.classLevel) as
              | OnboardingState["classLevel"],
          };
          persistOnboarding(next);
          return next;
        });
      } catch {
        /* Offline, or the migration has not run. The full form is the
           fallback and it is the correct form for most people. */
      }
    })();

    return () => {
      cancelled = true;
    };
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

      {/* Hidden while themes are off — see lib/theme.ts. Asking a
          thirteen-year-old to choose a look that will not apply is the
          worst version of a paused feature. */}
      {THEMES_ENABLED && (
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
      )}

      {/* --- The school already answered this ------------------------------
          Shown, not asked. A child who picks the wrong board here gets a
          roadmap for a syllabus their class is not on, and the first person
          able to notice is a teacher looking at a heatmap that says the child
          has done nothing. */}
      {school && (
        <section aria-labelledby="school-heading">
          <h1
            id="school-heading"
            className="font-display text-[2.2rem] font-extrabold leading-[1.05] tracking-[-0.035em] sm:text-[2.9rem]"
            style={{ color: text() }}
          >
            {school.name ? `${school.name} ne` : "Your school has"} sab set kar diya hai
          </h1>
          <p className="mt-3 text-[15px]" style={{ color: text(0.6) }}>
            Your board and class come from your school, so there is nothing to choose here.
          </p>

          <GlassCard className="mt-6 p-5">
            <dl className="grid gap-3 sm:grid-cols-3">
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: text(0.45) }}>
                  Board
                </dt>
                <dd className="mt-1 text-[15px] font-bold" style={{ color: text() }}>
                  {selectedBoard?.name ?? school.board?.toUpperCase()}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: text(0.45) }}>
                  Class
                </dt>
                <dd className="mt-1 text-[15px] font-bold" style={{ color: text() }}>
                  {state.classLevel ? `Class ${state.classLevel}` : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: text(0.45) }}>
                  Section
                </dt>
                <dd className="mt-1 text-[15px] font-bold" style={{ color: text() }}>
                  {school.sectionName ?? "—"}
                </dd>
              </div>
            </dl>
          </GlassCard>

          <p className="mt-3 text-[12.5px]" style={{ color: text(0.45) }}>
            Looks wrong? Ask the school office to correct it — changing it here would put your
            class record out of step.
          </p>
        </section>
      )}

      {!school && (
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
      </section>
      )}

      {/* Outside both branches. It used to live inside the board section, and
          moving that section behind `!school` would have left a school student
          on a page with no way forward. */}
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
