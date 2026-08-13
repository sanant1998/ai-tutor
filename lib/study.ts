/* Derives everything the app shows from the answers onboarding collected.

   There is no backend yet, so this is the single source of truth: the same
   inputs always produce the same roadmap, and progress is kept in
   localStorage. When Supabase is wired, replace `readProgress`/`saveProgress`
   and keep the derivation below. */

import {
  EXAM_BOARDS,
  SUBJECTS,
  unitsFor,
  readOnboarding,
  type OnboardingState,
  type Subject,
  type Unit,
} from "@/lib/onboarding";

export const PROGRESS_STORAGE_KEY = "mmr-progress";
export const EXAMS_STORAGE_KEY = "mmr-exams";
export const TOUR_STORAGE_KEY = "mmr-tour-seen";

export type Topic = {
  id: string;
  name: string;
  minutes: number;
  subjectId: string;
  subjectName: string;
  subjectGlyph: string;
  unitId: string;
  unitCode: string;
  unitName: string;
  /* Position across the whole roadmap, which is what unlocks in order. */
  index: number;
};

/* Anything with a date attached, not only the board exam — a term test moves
   the urgency clock just as much. */
export const EXAM_KINDS = [
  { id: "board", label: "Board exam" },
  { id: "mock", label: "Mock" },
  { id: "term", label: "Term test" },
  { id: "school", label: "School test" },
] as const;

export type ExamKind = (typeof EXAM_KINDS)[number]["id"];

export type ExamEntry = {
  id: string;
  kind: ExamKind;
  subjectId: string;
  unitId: string;
  /* ISO date, yyyy-mm-dd. */
  date: string;
};

export function examKindLabel(kind: ExamKind) {
  return EXAM_KINDS.find((entry) => entry.id === kind)?.label ?? "Exam";
}

export type StudyLogEntry = {
  /* yyyy-mm-dd */
  date: string;
  minutes: number;
};

export type Progress = {
  /* Topic ids the student has learned at least once — the mastery signal. */
  done: string[];
  /* Scheduled session ids completed: one learn pass and two reviews per topic
     each count separately, so finishing a topic does not silently tick off
     reviews that have not happened. */
  doneSessions: string[];
  /* Session ids skipped today, cleared each day. */
  skipped: string[];
  /* yyyy-mm-dd of the last day a session was completed. */
  lastActiveDate: string | null;
  streak: number;
  /* Minutes studied per day — what the daily-minutes chart plots. */
  log: StudyLogEntry[];
  /* Rolling record of answered practice questions, newest last. */
  answers: { date: string; correct: boolean }[];
  /* Mock papers sat, as percentages. */
  mockScores: { date: string; percent: number }[];
};

export const DEFAULT_PROGRESS: Progress = {
  done: [],
  doneSessions: [],
  skipped: [],
  lastActiveDate: null,
  streak: 0,
  log: [],
  answers: [],
  mockScores: [],
};

/* Minutes studied on a given day. */
export function minutesOn(progress: Progress, date: string) {
  return progress.log
    .filter((entry) => entry.date === date)
    .reduce((total, entry) => total + entry.minutes, 0);
}

export function totalMinutes(progress: Progress, sinceDays?: number, now?: Date) {
  if (!sinceDays || !now) {
    return progress.log.reduce((total, entry) => total + entry.minutes, 0);
  }

  const cutoff = todayKey(new Date(now.getTime() - sinceDays * 86_400_000));
  return progress.log
    .filter((entry) => entry.date >= cutoff)
    .reduce((total, entry) => total + entry.minutes, 0);
}

/* ---------------------------------------------------------------------------
   Storage
   --------------------------------------------------------------------------- */
function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? ({ ...fallback, ...JSON.parse(raw) } as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Private browsing: progress simply does not persist. */
  }
}

export const readProgress = () => read<Progress>(PROGRESS_STORAGE_KEY, DEFAULT_PROGRESS);
export const saveProgress = (value: Progress) => write(PROGRESS_STORAGE_KEY, value);

export function readExams(): ExamEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(EXAMS_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ExamEntry[]) : [];
  } catch {
    return [];
  }
}

export const saveExams = (value: ExamEntry[]) => write(EXAMS_STORAGE_KEY, value);

/* ---------------------------------------------------------------------------
   Derivation
   --------------------------------------------------------------------------- */
export function chosenSubjects(state: OnboardingState): Subject[] {
  return SUBJECTS.filter((subject) => state.subjectIds.includes(subject.id));
}

export function chosenUnits(state: OnboardingState, subjectId: string): Unit[] {
  const all = unitsFor(state.boardId, state.classLevel, subjectId);
  return all.filter((unit) => state.unitIds.includes(`${subjectId}:${unit.id}`));
}

/* The full ordered roadmap: every chosen chapter, interleaved so a student
   never spends a whole week inside one subject.

   One chapter is one topic. The old build had a second layer of invented
   sub-topics underneath each unit; those were written to look plausible rather
   than read off a syllabus, so they are gone. A chapter is what the textbook
   actually divides the subject into and what the student is examined on. */
export function buildRoadmap(state: OnboardingState): Topic[] {
  const perSubject = chosenSubjects(state).map((subject) =>
    chosenUnits(state, subject.id).map((chapter) => ({
      id: `${subject.id}:${chapter.id}`,
      name: chapter.name,
      minutes: chapter.studyMinutes,
      subjectId: subject.id,
      subjectName: subject.name,
      subjectGlyph: subject.glyph,
      unitId: chapter.id,
      unitCode: chapter.code,
      unitName: chapter.name,
      index: 0,
    })),
  );

  /* Round-robin across subjects so the order alternates. */
  const interleaved: Topic[] = [];
  const longest = Math.max(0, ...perSubject.map((list) => list.length));

  for (let position = 0; position < longest; position += 1) {
    for (const list of perSubject) {
      const topic = list[position];
      if (topic) interleaved.push(topic);
    }
  }

  return interleaved.map((topic, index) => ({ ...topic, index }));
}

export type Session = {
  topic: Topic;
  /* Minutes budgeted, which may be shorter than the topic if the day is full. */
  minutes: number;
  method: string;
  why: string;
  start: string;
  end: string;
  state: "done" | "skipped" | "todo";
};

const METHODS = [
  "Active Recall · Learn",
  "Interleaved Practice",
  "Retrieval · Mixed recall",
] as const;

function clockLabel(date: Date) {
  return date
    .toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true })
    .toUpperCase();
}

/* Today's sessions: the next unfinished topics, packed into the daily hours
   the student asked for, starting from the next clean five-minute slot. */
export function buildToday(
  state: OnboardingState,
  roadmap: Topic[],
  progress: Progress,
  now: Date,
  daysToExam: number | null,
): Session[] {
  const budget = Math.max(1, state.dailyHours) * 60;

  const queue = roadmap.filter((topic) => !progress.done.includes(topic.id));
  const sessions: Session[] = [];

  let used = 0;
  let cursor = new Date(now);
  cursor.setSeconds(0, 0);
  cursor.setMinutes(Math.ceil(cursor.getMinutes() / 5) * 5);

  for (const [position, topic] of queue.entries()) {
    if (used >= budget) break;

    const minutes = Math.min(topic.minutes, budget - used);
    if (minutes < 15) break;

    const start = new Date(cursor);
    const end = new Date(cursor.getTime() + minutes * 60_000);

    sessions.push({
      topic,
      minutes,
      method: METHODS[position % METHODS.length],
      why: whyNow(topic, progress, daysToExam),
      start: clockLabel(start),
      end: clockLabel(end),
      state: progress.skipped.includes(topic.id) ? "skipped" : "todo",
    });

    used += minutes;
    /* Five-minute breather between sessions. */
    cursor = new Date(end.getTime() + 5 * 60_000);
  }

  return sessions;
}

function whyNow(topic: Topic, progress: Progress, daysToExam: number | null) {
  const seen = progress.done.includes(topic.id);
  const window = daysToExam === null ? "no exam date yet" : `${daysToExam}d to exam`;

  if (seen) {
    return `Due for recall. ${window}. Retrieve → 5 self-test questions → mark.`;
  }
  return `New ground. ${window}. Learn → 5 self-test questions → mark.`;
}

/* ---------------------------------------------------------------------------
   Exams and urgency
   --------------------------------------------------------------------------- */
export function daysUntil(iso: string, now: Date) {
  const target = new Date(`${iso}T00:00:00`);
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - start.getTime()) / 86_400_000);
}

export function nextExam(exams: ExamEntry[], now: Date) {
  return exams
    .filter((exam) => daysUntil(exam.date, now) >= 0)
    .sort((a, b) => a.date.localeCompare(b.date))[0];
}

/* 0 when there is no date or the exam is far off; 100 the day before.
   Deliberately non-linear — the last fortnight should feel different. */
export function urgencyScore(daysToExam: number | null, coverage: number) {
  if (daysToExam === null) return 0;

  const timePressure = Math.max(0, Math.min(1, 1 - daysToExam / 120));
  const gap = 1 - coverage;

  return Math.round(Math.min(100, timePressure * 70 + gap * timePressure * 60));
}

export function coverageOf(roadmap: Topic[], progress: Progress) {
  if (roadmap.length === 0) return 0;
  return progress.done.length / roadmap.length;
}

/* ---------------------------------------------------------------------------
   Convenience
   --------------------------------------------------------------------------- */
export function boardName(state: OnboardingState) {
  return EXAM_BOARDS.find((board) => board.id === state.boardId)?.name ?? "";
}

export function greeting(now: Date) {
  const hour = now.getHours();
  if (hour < 12) return "Morning";
  if (hour < 17) return "Afternoon";
  return "Evening";
}

export function todayKey(now: Date) {
  return now.toISOString().slice(0, 10);
}

/* Marks one scheduled session complete, logs the time and rolls the streak.

   A topic appears three times in the plan — one learn pass and two spaced
   reviews — so completion is tracked per session id. `done` still holds topic
   ids, because that is the mastery signal the Progress page reports on: the
   first pass of a topic marks it learned, and its reviews are then counted
   separately as they actually happen. */
export function completeSession(
  progress: Progress,
  sessionId: string,
  topicId: string,
  now: Date,
  minutes = 0,
): Progress {
  if (progress.doneSessions.includes(sessionId)) return progress;

  const key = todayKey(now);
  const yesterday = todayKey(new Date(now.getTime() - 86_400_000));

  const streak =
    progress.lastActiveDate === key
      ? progress.streak
      : progress.lastActiveDate === yesterday
        ? progress.streak + 1
        : 1;

  const existing = progress.log.find((entry) => entry.date === key);
  const log = existing
    ? progress.log.map((entry) =>
        entry.date === key
          ? { ...entry, minutes: entry.minutes + minutes }
          : entry,
      )
    : [...progress.log, { date: key, minutes }];

  return {
    ...progress,
    doneSessions: [...progress.doneSessions, sessionId],
    done: progress.done.includes(topicId)
      ? progress.done
      : [...progress.done, topicId],
    skipped: progress.skipped.filter((id) => id !== sessionId),
    lastActiveDate: key,
    streak,
    log,
  };
}

export function loadState(): OnboardingState {
  return readOnboarding();
}

/* Planned study hours across every unit the student ticked. */
export function totalStudyHoursForState(state: OnboardingState) {
  return state.subjectIds.reduce((total, subjectId) => {
    return (
      total +
      chosenUnits(state, subjectId).reduce(
        (subtotal, unit) => subtotal + unit.studyHours,
        0,
      )
    );
  }, 0);
}
