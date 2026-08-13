/* Turns the roadmap into a dated plan.

   Every topic gets one Learn session, then two spaced Review sessions at
   widening gaps. Sessions are packed day by day into the daily-hours budget,
   skipping the rest days chosen in onboarding. Reviews always jump the queue,
   because a review that slips is a topic forgotten. */

import type { OnboardingState } from "@/lib/onboarding";
import type { Topic } from "@/lib/study";

export const REVIEW_GAPS_DAYS = [3, 10] as const;
export const REVIEW_MINUTES = 25;

export type SessionKind = "learn" | "review";

export type PlannedSession = {
  id: string;
  topic: Topic;
  kind: SessionKind;
  /* yyyy-mm-dd */
  date: string;
  minutes: number;
};

export type PlannedDay = {
  date: string;
  sessions: PlannedSession[];
  minutes: number;
};

const DAY_MS = 86_400_000;
const WEEKDAY_IDS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

export function isoDate(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return `${copy.getFullYear()}-${String(copy.getMonth() + 1).padStart(2, "0")}-${String(copy.getDate()).padStart(2, "0")}`;
}

export function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * DAY_MS);
}

function isRestDay(date: Date, restDays: string[]) {
  return restDays.includes(WEEKDAY_IDS[date.getDay()]);
}

/* The whole plan, from today until every topic is learned and reviewed.
   Capped so a huge roadmap on a tiny daily budget cannot loop forever. */
export function buildSchedule(
  state: OnboardingState,
  roadmap: Topic[],
  now: Date,
  maxDays = 400,
): PlannedDay[] {
  const budget = Math.max(1, state.dailyHours) * 60;
  const queue = [...roadmap];

  /* date → reviews owed that day */
  const pendingReviews = new Map<string, PlannedSession[]>();
  const days: PlannedDay[] = [];

  let cursor = new Date(now);
  cursor.setHours(0, 0, 0, 0);

  for (let dayIndex = 0; dayIndex < maxDays; dayIndex += 1) {
    const date = isoDate(cursor);

    if (isRestDay(cursor, state.restDays)) {
      days.push({ date, sessions: [], minutes: 0 });
      cursor = addDays(cursor, 1);
      continue;
    }

    const sessions: PlannedSession[] = [];
    let used = 0;

    /* Reviews first — anything due today, plus anything that fell behind. */
    for (const [dueDate, reviews] of [...pendingReviews.entries()].sort()) {
      if (dueDate > date) continue;

      const remaining: PlannedSession[] = [];
      for (const review of reviews) {
        if (used + review.minutes <= budget) {
          sessions.push({ ...review, date });
          used += review.minutes;
        } else {
          remaining.push(review);
        }
      }

      if (remaining.length) pendingReviews.set(dueDate, remaining);
      else pendingReviews.delete(dueDate);
    }

    /* Then new ground. */
    while (queue.length > 0 && used + queue[0].minutes <= budget) {
      const topic = queue.shift()!;

      sessions.push({
        id: `${topic.id}:learn`,
        topic,
        kind: "learn",
        date,
        minutes: topic.minutes,
      });
      used += topic.minutes;

      REVIEW_GAPS_DAYS.forEach((gap, order) => {
        const due = isoDate(addDays(cursor, gap));
        const review: PlannedSession = {
          id: `${topic.id}:review${order}`,
          topic,
          kind: "review",
          date: due,
          minutes: REVIEW_MINUTES,
        };
        pendingReviews.set(due, [...(pendingReviews.get(due) ?? []), review]);
      });
    }

    days.push({ date, sessions, minutes: used });
    cursor = addDays(cursor, 1);

    if (queue.length === 0 && pendingReviews.size === 0) break;
  }

  return days;
}

/* A planned session dressed for display: clock times, the method it uses and
   the one-line reason it is happening now. The dashboard and the roadmap both
   read from here, so the two can never disagree about today. */
export type DisplaySession = PlannedSession & {
  start: string;
  end: string;
  method: string;
  why: string;
  /* 1 or 2 for reviews, undefined for a first pass. */
  pass?: number;
};

function clockLabel(date: Date) {
  return date
    .toLocaleTimeString("en-GB", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
    .toUpperCase();
}

export function dressDay(
  day: PlannedDay | undefined,
  now: Date,
  daysToExam: number | null,
): DisplaySession[] {
  if (!day) return [];

  const window =
    daysToExam === null ? "no exam date yet" : `${daysToExam}d until exam`;

  /* Start at the next clean five-minute slot, then run back to back with a
     five-minute breather between sessions. */
  let cursor = new Date(now);
  cursor.setSeconds(0, 0);
  cursor.setMinutes(Math.ceil(cursor.getMinutes() / 5) * 5);

  return day.sessions.map((session) => {
    const start = new Date(cursor);
    const end = new Date(cursor.getTime() + session.minutes * 60_000);
    cursor = new Date(end.getTime() + 5 * 60_000);

    const pass = session.kind === "review"
      ? Number(session.id.slice(-1)) + 1
      : undefined;

    return {
      ...session,
      start: clockLabel(start),
      end: clockLabel(end),
      method:
        session.kind === "review"
          ? "Spaced Repetition Review"
          : "Active Recall · Learn",
      why:
        session.kind === "review"
          ? `Spaced review (pass ${pass}). ${window} — active recall beats re-reading 3×.`
          : `New ground. ${window}. Learn → 5 self-test questions → mark.`,
      pass,
    };
  });
}

export function totalSessions(days: PlannedDay[]) {
  return days.reduce((total, day) => total + day.sessions.length, 0);
}

/* Days that actually carry work — what "days planned" counts. */
export function activeDays(days: PlannedDay[]) {
  return days.filter((day) => day.sessions.length > 0).length;
}

export function daySlice(days: PlannedDay[], from: Date, count: number) {
  const wanted = Array.from({ length: count }, (_, index) =>
    isoDate(addDays(from, index)),
  );

  return wanted.map(
    (date) =>
      days.find((day) => day.date === date) ?? { date, sessions: [], minutes: 0 },
  );
}

/* Monday-based week containing `date`. */
export function startOfWeek(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  const offset = (copy.getDay() + 6) % 7;
  return addDays(copy, -offset);
}

export function sessionsForSubject(days: PlannedDay[], subjectId: string) {
  return days.flatMap((day) =>
    day.sessions.filter((session) => session.topic.subjectId === subjectId),
  );
}

/* A fixed colour per subject, used by the calendar legend and chips. */
export const SUBJECT_COLOURS: Record<string, string> = {
  maths: "#3b82f6",
  biology: "#22c55e",
  chemistry: "#a855f7",
  physics: "#f97316",
  business: "#06b6d4",
  economics: "#eab308",
};

export function subjectColour(subjectId: string) {
  return SUBJECT_COLOURS[subjectId] ?? "#64748b";
}

export function formatDayLabel(iso: string, now: Date) {
  const today = isoDate(now);
  const tomorrow = isoDate(addDays(now, 1));

  if (iso === today) return "Today";
  if (iso === tomorrow) return "Tomorrow";

  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", {
    weekday: "long",
  });
}

export function formatShortDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}
