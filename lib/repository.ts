/* The seam between the app and where its data lives.

   Signed in with Supabase configured → rows in Postgres.
   Otherwise → localStorage, so the whole app still works offline and in a
   preview deploy with no keys.

   Every page calls these functions rather than touching either store
   directly, so switching one out never means editing a component. */

import {
  ONBOARDING_STORAGE_KEY,
  readOnboarding,
  saveOnboarding,
  type OnboardingState,
} from "@/lib/onboarding";
import {
  DEFAULT_PROGRESS,
  readExams,
  readProgress,
  saveExams,
  saveProgress,
  type ExamEntry,
  type ExamKind,
  type Progress,
} from "@/lib/study";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";

async function currentUserId(): Promise<string | null> {
  if (!isSupabaseConfigured) return null;

  try {
    const { data } = await createClient().auth.getUser();
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

/* ---------------------------------------------------------------------------
   Onboarding
   --------------------------------------------------------------------------- */
export async function loadOnboarding(): Promise<OnboardingState> {
  const local = readOnboarding();
  const userId = await currentUserId();
  if (!userId) return local;

  try {
    const { data } = await createClient()
      .from("onboarding")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (!data) return local;

    const remote: OnboardingState = {
      name: local.name,
      lastName: local.lastName,
      boardId: data.board_id ?? null,
      classLevel: (data.class_level ?? null) as OnboardingState["classLevel"],
      subjectIds: data.subject_ids ?? [],
      unitIds: data.unit_ids ?? [],
      deadline: data.deadline ?? "",
      restDays: data.rest_days ?? [],
      dailyHours: data.daily_hours ?? 2,
      targetGrades: data.target_grades ?? {},
      predictedGrades: data.predicted_grades ?? {},
    };

    /* Keep the local copy warm so the next paint is instant. */
    saveOnboarding(remote);
    return remote;
  } catch {
    return local;
  }
}

export async function persistOnboarding(state: OnboardingState) {
  saveOnboarding(state);

  const userId = await currentUserId();
  if (!userId) return;

  try {
    await createClient().from("onboarding").upsert({
      user_id: userId,
      board_id: state.boardId,
      class_level: state.classLevel,
      subject_ids: state.subjectIds,
      unit_ids: state.unitIds,
      deadline: state.deadline || null,
      rest_days: state.restDays,
      daily_hours: state.dailyHours,
      target_grades: state.targetGrades,
      predicted_grades: state.predictedGrades,
      updated_at: new Date().toISOString(),
    });
  } catch {
    /* Offline or RLS not set up — the local copy is still authoritative. */
  }
}

/* ---------------------------------------------------------------------------
   Profile
   --------------------------------------------------------------------------- */
export async function persistProfile(firstName: string, lastName: string) {
  const userId = await currentUserId();
  if (!userId) return;

  try {
    await createClient().from("profiles").upsert({
      id: userId,
      first_name: firstName,
      last_name: lastName,
      updated_at: new Date().toISOString(),
    });
  } catch {
    /* Same as above. */
  }
}

export async function loadProfile(): Promise<{ first: string; last: string } | null> {
  const userId = await currentUserId();
  if (!userId) return null;

  try {
    const { data } = await createClient()
      .from("profiles")
      .select("first_name, last_name")
      .eq("id", userId)
      .maybeSingle();

    return data ? { first: data.first_name ?? "", last: data.last_name ?? "" } : null;
  } catch {
    return null;
  }
}

/* ---------------------------------------------------------------------------
   Progress
   --------------------------------------------------------------------------- */
export async function loadProgress(): Promise<Progress> {
  const local = readProgress();
  const userId = await currentUserId();
  if (!userId) return local;

  try {
    const supabase = createClient();

    const [{ data: row }, { data: log }] = await Promise.all([
      supabase.from("progress").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("study_log").select("day, minutes").eq("user_id", userId),
    ]);

    if (!row) return local;

    const remote: Progress = {
      ...DEFAULT_PROGRESS,
      done: row.done_topic_ids ?? [],
      doneSessions: row.done_session_ids ?? [],
      skipped: row.skipped_topic_ids ?? [],
      lastActiveDate: row.last_active_date ?? null,
      streak: row.streak ?? 0,
      log: (log ?? []).map((entry) => ({
        date: entry.day as string,
        minutes: entry.minutes as number,
      })),
      /* Answers and mock scores stay local until their tables exist. */
      answers: local.answers,
      mockScores: local.mockScores,
    };

    saveProgress(remote);
    return remote;
  } catch {
    return local;
  }
}

export async function persistProgress(progress: Progress) {
  saveProgress(progress);

  const userId = await currentUserId();
  if (!userId) return;

  try {
    const supabase = createClient();

    await supabase.from("progress").upsert({
      user_id: userId,
      done_topic_ids: progress.done,
      done_session_ids: progress.doneSessions,
      skipped_topic_ids: progress.skipped,
      last_active_date: progress.lastActiveDate,
      streak: progress.streak,
      updated_at: new Date().toISOString(),
    });

    if (progress.log.length) {
      await supabase.from("study_log").upsert(
        progress.log.map((entry) => ({
          user_id: userId,
          day: entry.date,
          minutes: entry.minutes,
        })),
      );
    }
  } catch {
    /* Local copy stands. */
  }
}

/* ---------------------------------------------------------------------------
   Exams
   --------------------------------------------------------------------------- */
export async function loadExams(): Promise<ExamEntry[]> {
  const local = readExams();
  const userId = await currentUserId();
  if (!userId) return local;

  try {
    const { data } = await createClient()
      .from("exams")
      .select("*")
      .eq("user_id", userId)
      .order("exam_date");

    if (!data) return local;

    const remote: ExamEntry[] = data.map((row) => ({
      id: row.id as string,
      kind: (row.kind as ExamKind) ?? "board",
      subjectId: row.subject_id as string,
      unitId: (row.unit_id as string) ?? "",
      date: row.exam_date as string,
    }));

    saveExams(remote);
    return remote;
  } catch {
    return local;
  }
}

export async function persistExams(exams: ExamEntry[]) {
  saveExams(exams);

  const userId = await currentUserId();
  if (!userId) return;

  try {
    const supabase = createClient();

    /* Replace the set rather than diffing it — the list is small and this
       keeps deletions honest. */
    await supabase.from("exams").delete().eq("user_id", userId);

    if (exams.length) {
      await supabase.from("exams").insert(
        exams.map((exam) => ({
          id: exam.id,
          user_id: userId,
          kind: exam.kind,
          subject_id: exam.subjectId,
          unit_id: exam.unitId,
          exam_date: exam.date,
        })),
      );
    }
  } catch {
    /* Local copy stands. */
  }
}

/* ---------------------------------------------------------------------------
   Feedback tickets
   --------------------------------------------------------------------------- */
export const TICKETS_STORAGE_KEY = "mmr-tickets";

export type TicketMessage = { from: "you" | "team"; body: string; at: string };

export type Ticket = {
  id: string;
  kind: string;
  subject: string;
  createdAt: string;
  messages: TicketMessage[];
};

function readTicketsLocal(): Ticket[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(TICKETS_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Ticket[]) : [];
  } catch {
    return [];
  }
}

function saveTicketsLocal(tickets: Ticket[]) {
  try {
    window.localStorage.setItem(TICKETS_STORAGE_KEY, JSON.stringify(tickets));
  } catch {
    /* Private browsing: tickets do not persist. */
  }
}

export async function loadTickets(): Promise<Ticket[]> {
  const local = readTicketsLocal();
  const userId = await currentUserId();
  if (!userId) return local;

  try {
    const supabase = createClient();

    const [{ data: rows }, { data: messages }] = await Promise.all([
      supabase
        .from("tickets")
        .select("id, kind, subject, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false }),
      supabase
        .from("ticket_messages")
        .select("ticket_id, author, body, created_at")
        .eq("user_id", userId)
        .order("created_at"),
    ]);

    if (!rows) return local;

    const byTicket = new Map<string, TicketMessage[]>();
    for (const message of messages ?? []) {
      const list = byTicket.get(message.ticket_id as string) ?? [];
      list.push({
        from: (message.author as "you" | "team") ?? "you",
        body: message.body as string,
        at: message.created_at as string,
      });
      byTicket.set(message.ticket_id as string, list);
    }

    const remote: Ticket[] = rows.map((row) => ({
      id: row.id as string,
      kind: row.kind as string,
      subject: row.subject as string,
      createdAt: row.created_at as string,
      messages: byTicket.get(row.id as string) ?? [],
    }));

    saveTicketsLocal(remote);
    return remote;
  } catch {
    return local;
  }
}

/* Opens a ticket with its first message. Returns the id actually stored, which
   is the server's uuid when signed in and a local id otherwise — the caller
   needs it to select the new ticket. */
export async function createTicket(
  kind: string,
  subject: string,
  body: string,
): Promise<Ticket> {
  const at = new Date().toISOString();
  const ticket: Ticket = {
    id: `local-${at}`,
    kind,
    subject,
    createdAt: at,
    messages: [{ from: "you", body, at }],
  };

  const userId = await currentUserId();

  if (userId) {
    try {
      const supabase = createClient();

      const { data: row } = await supabase
        .from("tickets")
        .insert({ user_id: userId, kind, subject })
        .select("id, created_at")
        .single();

      if (row) {
        ticket.id = row.id as string;
        ticket.createdAt = row.created_at as string;

        await supabase.from("ticket_messages").insert({
          ticket_id: ticket.id,
          user_id: userId,
          author: "you",
          body,
        });
      }
    } catch {
      /* Falls through to the local copy below. */
    }
  }

  saveTicketsLocal([ticket, ...readTicketsLocal()]);
  return ticket;
}

export async function appendTicketMessage(ticketId: string, body: string) {
  const at = new Date().toISOString();

  saveTicketsLocal(
    readTicketsLocal().map((ticket) =>
      ticket.id === ticketId
        ? { ...ticket, messages: [...ticket.messages, { from: "you" as const, body, at }] }
        : ticket,
    ),
  );

  const userId = await currentUserId();
  /* A local-only ticket has no server row to attach the message to. */
  if (!userId || ticketId.startsWith("local-")) return;

  try {
    await createClient().from("ticket_messages").insert({
      ticket_id: ticketId,
      user_id: userId,
      author: "you",
      body,
    });
  } catch {
    /* Local copy stands. */
  }
}

/* Clears every local key. Server rows are left alone — deleting an account is
   a separate, deliberate action. */
export function clearLocal(keys: string[]) {
  [...keys, ONBOARDING_STORAGE_KEY].forEach((key) => {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* Nothing to clear. */
    }
  });
}
