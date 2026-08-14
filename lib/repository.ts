/* The seam between the app and where its data lives.

   Signed in with Supabase configured → rows in Postgres.
   Otherwise → localStorage, so the whole app still works offline and in a
   preview deploy with no keys.

   Every page calls these functions rather than touching either store
   directly, so switching one out never means editing a component. */

import { ownershipFor } from "@/lib/localOwner";
import {
  ONBOARDING_STORAGE_KEY,
  countryOfBoard,
  readOnboarding,
  saveOnboarding,
  type OnboardingState,
} from "@/lib/onboarding";
import {
  DEFAULT_PROGRESS,
  EXAMS_STORAGE_KEY,
  PROGRESS_STORAGE_KEY,
  TOUR_STORAGE_KEY,
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
   Whose local copy is this?

   The local cache is the app's offline story, and on a shared family phone it
   is also a leak: one student's name, streak, exam dates and answers sitting
   in localStorage for whoever opens the browser next. Shared devices are the
   norm in this market, so the cache needs an owner.

   The marker below records which account the local keys belong to. Ownership
   is claimed at the two moments it can change — signing in and signing out —
   and re-checked on every app load as a backstop for the case where a session
   ended without either (an expired cookie, a cleared session, a second tab).

   Device preferences — theme, accessibility — are deliberately NOT cleared.
   They belong to the phone, not to the account, and wiping them would make
   large-text mode something a student has to set again after every sign-out.
   --------------------------------------------------------------------------- */
const LOCAL_OWNER_KEY = "mmr-owner";

/* Everything that is ABOUT a student rather than about this device. */
function studentLocalKeys(): string[] {
  return [
    ONBOARDING_STORAGE_KEY,
    PROGRESS_STORAGE_KEY,
    EXAMS_STORAGE_KEY,
    TOUR_STORAGE_KEY,
    TICKETS_STORAGE_KEY,
  ];
}

export function clearStudentLocal() {
  if (typeof window === "undefined") return;

  for (const key of [...studentLocalKeys(), LOCAL_OWNER_KEY]) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* Private browsing, or storage disabled. Nothing to clear. */
    }
  }
}

function readOwner(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(LOCAL_OWNER_KEY);
  } catch {
    return null;
  }
}

function writeOwner(userId: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (userId) window.localStorage.setItem(LOCAL_OWNER_KEY, userId);
    else window.localStorage.removeItem(LOCAL_OWNER_KEY);
  } catch {
    /* Same as above. */
  }
}

/* Claims the local cache for one account, wiping it first if it belonged to
   somebody else. Returns true when a wipe happened, so the caller can drop the
   state it has already painted from.

   The decision itself is in lib/localOwner.ts, with no storage behind it, so
   the four branches can be unit tested rather than reasoned about. */
export async function claimLocalFor(userId: string | null): Promise<boolean> {
  if (typeof window === "undefined") return false;

  const next = userId ?? null;

  const action = ownershipFor({
    owner: readOwner(),
    next,
    empty: studentLocalKeys().every((key) => {
      try {
        return window.localStorage.getItem(key) === null;
      } catch {
        return true;
      }
    }),
  });

  if (action === "keep") return false;

  if (action === "wipe") clearStudentLocal();

  writeOwner(next);
  return action === "wipe";
}

/* The app-load backstop. */
export async function claimLocal(): Promise<boolean> {
  return claimLocalFor(await currentUserId());
}

/* Ending a session properly.
 *
 * The old "Sign out" was a link to the landing page: it navigated, and left
 * the Supabase cookie and every local key exactly where they were. One tap on
 * any in-app link put the previous student straight back into their account.
 *
 * Three things have to happen, in this order: revoke the session so the
 * cookie stops being a credential, clear the local cache so nothing about the
 * student survives on the device, and only then leave. */
export async function signOut(): Promise<void> {
  if (isSupabaseConfigured) {
    try {
      /* Local scope: this device's session only. A student signing out of the
         family phone should not be signed out of their own tablet. */
      await createClient().auth.signOut({ scope: "local" });
    } catch {
      /* Offline. The local wipe below still has to happen — leaving the cache
         behind because the network was down is the worse failure. */
    }
  }

  clearStudentLocal();
}

/* ---------------------------------------------------------------------------
   Onboarding
   --------------------------------------------------------------------------- */
export async function loadOnboarding(): Promise<OnboardingState> {
  const local = readOnboarding();
  const userId = await currentUserId();
  if (!userId) return local;

  try {
    const supabase = createClient();

    /* The name comes from `profiles`, not from the local copy.
     *
     * Reading it locally made the name the one field that never crossed
     * devices — and on a shared phone it made it the previous student's. It
     * is on the server already; `onboarding` simply does not hold it. */
    const [{ data }, { data: profile }] = await Promise.all([
      supabase.from("onboarding").select("*").eq("user_id", userId).maybeSingle(),
      supabase
        .from("profiles")
        .select("first_name, last_name")
        .eq("id", userId)
        .maybeSingle(),
    ]);

    if (!data) {
      /* No onboarding row yet, but a profile can still name them. */
      return profile
        ? { ...local, name: profile.first_name ?? "", lastName: profile.last_name ?? "" }
        : local;
    }

    const remote: OnboardingState = {
      name: profile?.first_name ?? "",
      lastName: profile?.last_name ?? "",
      /* Derived from the stored board rather than stored alongside it. A board
         belongs to exactly one country, so a `country` column would be a
         second copy of the same fact and the only thing it could ever add is a
         disagreement. Falls back to the local answer while the board is still
         unchosen — that is the only moment the two can differ. */
      countryId: data.board_id ? countryOfBoard(data.board_id) : local.countryId,
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

/* Clears the named local keys, plus everything the student cache owns. Server
   rows are left alone — deleting an account is a separate, deliberate action.

   Used by Settings' "clear data on this device". Sign-out goes through
   `signOut` above instead, which also revokes the session. */
export function clearLocal(keys: string[]) {
  keys.forEach((key) => {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* Nothing to clear. */
    }
  });

  clearStudentLocal();
}
