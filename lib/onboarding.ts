/* The answers onboarding collects, and the catalogue it offers.

   The syllabus itself lives in lib/syllabus.ts — board, class, subject and
   chapter, every entry sourced. This file is the layer the rest of the app
   talks to: it holds the student's answers and turns a board + class into the
   subjects and chapters they can pick.

   A note on names. What the app calls a "unit" everywhere else is a textbook
   CHAPTER here. The old international model had Units 1-6 with paper codes;
   Indian boards have numbered chapters. The `Unit` shape is kept so the
   schedule engine, roadmap and dashboard did not all have to be rewritten for
   a rename, but every value in it comes from a chapter. */

export const ONBOARDING_STORAGE_KEY = "mmr-onboarding";

export const ONBOARDING_TOTAL_STEPS = 5;

import { readStoredCountry } from "@/lib/country";
import {
  BOARDS,
  DEFAULT_COUNTRY,
  chaptersFor,
  countryOfBoard,
  isCovered,
  subjectsFor,
  type BoardId,
  type ClassLevel,
  type CountryId,
  type Subject,
} from "@/lib/syllabus";

export {
  BOARDS,
  CLASSES,
  COUNTRIES,
  DEFAULT_COUNTRY,
  boardsFor,
  classBand,
  classLabel,
  classShortLabel,
  classesFor,
  countryOfBoard,
  coveredSubjects,
  isCovered,
  type BoardId,
  type ClassLevel,
  type Country,
  type CountryId,
} from "@/lib/syllabus";

/* --------------------------------------------------------------------------
   Boards

   Named EXAM_BOARDS because that is what the whole app calls them. The list is
   now the three Indian boards; the international ones were removed rather than
   hidden, because carrying two incompatible syllabus shapes put an if-else in
   every view that touched a unit.
   -------------------------------------------------------------------------- */
export type ExamBoard = {
  id: string;
  country: CountryId;
  name: string;
  detail: string;
  /* Shown in monospace under the name. */
  specCodes: string;
  comingSoon?: boolean;
};

export const EXAM_BOARDS: ExamBoard[] = BOARDS.map((board) => ({
  id: board.id,
  country: board.country,
  name: board.name,
  detail: board.detail,
  specCodes: board.basis,
}));

/* What a picker should offer once a country has been chosen. EXAM_BOARDS is
   every board in both countries and is the right list only for looking one up
   by id — showing all of it would put CBSE in front of a student in Ohio. */
export function examBoardsFor(country: CountryId): ExamBoard[] {
  return EXAM_BOARDS.filter((board) => board.country === country);
}

/* --------------------------------------------------------------------------
   Subjects

   Which subjects exist depends on the class: a Class 3 student has EVS and no
   Science, a Class 9 student the reverse. SUBJECTS is the full catalogue;
   `subjectsForClass` is what a picker should actually show.
   -------------------------------------------------------------------------- */
export { SUBJECTS, subjectsFor as subjectsForClass } from "@/lib/syllabus";
export type { Subject };

/* --------------------------------------------------------------------------
   Chapters, in the shape the app already knows as a unit
   -------------------------------------------------------------------------- */
export type Unit = {
  id: string;
  /* "Ch 5" — what the roadmap prints beside the name. */
  code: string;
  name: string;
  /* Minutes of study this chapter is planned at. */
  studyMinutes: number;
  /* Kept for the schedule, which budgets in hours. */
  studyHours: number;
};

function toUnit(chapter: { id: string; number: number; name: string; minutes: number }): Unit {
  return {
    id: chapter.id,
    code: `Ch ${chapter.number}`,
    name: chapter.name,
    studyMinutes: chapter.minutes,
    /* One chapter is planned as roughly one sitting plus its two reviews. */
    studyHours: Math.max(1, Math.round(chapter.minutes / 60)),
  };
}

/* Every chapter of one subject, for this student's board and class. */
export function unitsFor(
  boardId: string | null,
  classLevel: ClassLevel | null,
  subjectId: string,
): Unit[] {
  if (!boardId || !classLevel) return [];
  return chaptersFor(boardId as BoardId, classLevel, subjectId).map(toUnit);
}

/* --------------------------------------------------------------------------
   The answers
   -------------------------------------------------------------------------- */
export const WEEKDAYS = [
  { id: "sun", label: "Sun" },
  { id: "mon", label: "Mon" },
  { id: "tue", label: "Tue" },
  { id: "wed", label: "Wed" },
  { id: "thu", label: "Thu" },
  { id: "fri", label: "Fri" },
  { id: "sat", label: "Sat" },
] as const;

/* Indian boards report percentages and CGPA rather than letter grades. */
export const GRADES = ["95%+", "90%", "80%", "70%", "60%", "50%", "Pass"] as const;

export type OnboardingState = {
  /* `name` is the first name — it is what the app greets you by. */
  name: string;
  lastName: string;
  /* Answered before the board, because it decides which boards exist. Never
     null: India is the default, so a student who never sees the toggle gets
     exactly the app that existed before it. */
  countryId: CountryId;
  boardId: string | null;
  /* Which class they are in. Everything else depends on it. */
  classLevel: ClassLevel | null;
  subjectIds: string[];
  /* Chapter ids, namespaced by subject so numbers cannot collide. */
  unitIds: string[];
  deadline: string;
  restDays: string[];
  dailyHours: number;
  /* subjectId → target */
  targetGrades: Record<string, string>;
  predictedGrades: Record<string, string>;
};

export const DEFAULT_ONBOARDING: OnboardingState = {
  name: "",
  lastName: "",
  countryId: DEFAULT_COUNTRY,
  boardId: null,
  classLevel: null,
  subjectIds: [],
  unitIds: [],
  deadline: "",
  restDays: [],
  dailyHours: 2,
  targetGrades: {},
  predictedGrades: {},
};

export function unitKey(subjectId: string, unitId: string) {
  return `${subjectId}:${unitId}`;
}

/* Subjects this student can actually be given a plan for: taught in their
   class, and backed by a sourced chapter list for their board. */
export function availableSubjects(state: OnboardingState): Subject[] {
  if (!state.boardId || !state.classLevel) return [];
  return subjectsFor(state.classLevel, countryOfBoard(state.boardId)).filter((subject) =>
    isCovered(state.boardId as BoardId, state.classLevel as ClassLevel, subject.id),
  );
}

/* Subjects taught in the class but with no chapter list yet — shown greyed
   out, so the picker is honest about what is not ready instead of hiding it. */
export function pendingSubjects(state: OnboardingState): Subject[] {
  if (!state.boardId || !state.classLevel) return [];
  return subjectsFor(state.classLevel, countryOfBoard(state.boardId)).filter(
    (subject) =>
      !isCovered(state.boardId as BoardId, state.classLevel as ClassLevel, subject.id),
  );
}

/* Total study hours across every ticked chapter — what step four quotes. */
export function totalStudyHours(state: OnboardingState) {
  return state.unitIds.reduce((total, key) => {
    const [subjectId, unitId] = key.split(":");
    const unit = unitsFor(state.boardId, state.classLevel, subjectId).find(
      (item) => item.id === unitId,
    );
    return total + (unit?.studyHours ?? 0);
  }, 0);
}

export function readOnboarding(): OnboardingState {
  if (typeof window === "undefined") return DEFAULT_ONBOARDING;

  /* What the visitor tapped on the marketing site before they had an account.
     Only ever a starting value: everything below can overrule it, and a chosen
     board always does. */
  const fromLanding = readStoredCountry();

  try {
    const raw = window.localStorage.getItem(ONBOARDING_STORAGE_KEY);
    if (!raw) {
      return fromLanding
        ? { ...DEFAULT_ONBOARDING, countryId: fromLanding }
        : DEFAULT_ONBOARDING;
    }

    const stored = JSON.parse(raw) as Partial<OnboardingState> & {
      boardId?: string | null;
    };

    /* A saved answer set from the international build names a board that no
       longer exists and chapter ids that mean nothing here. Start those
       students again rather than building a plan on ids we cannot resolve. */
    const known = EXAM_BOARDS.some((board) => board.id === stored.boardId);
    if (stored.boardId && !known) return DEFAULT_ONBOARDING;

    /* Three answers, most authoritative first.
     *
     * A chosen board settles it — a board belongs to exactly one country, so
     * deriving it here is what stops a stored board and a stored country from
     * ever contradicting each other. Failing that, an answer given in
     * onboarding itself. Failing that, the tap on the marketing site.
     *
     * Answers saved before the toggle existed have no countryId at all, and
     * every one of them is Indian — the board they already chose says so, and
     * the first branch handles them without a migration. */
    const countryId = stored.boardId
      ? countryOfBoard(stored.boardId)
      : (stored.countryId ?? fromLanding ?? DEFAULT_COUNTRY);

    return { ...DEFAULT_ONBOARDING, ...stored, countryId };
  } catch {
    return DEFAULT_ONBOARDING;
  }
}

export function saveOnboarding(state: OnboardingState) {
  try {
    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* Private browsing: the answers simply do not persist between reloads. */
  }
}
