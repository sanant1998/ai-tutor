"use client";

import { useCallback, useEffect, useState } from "react";

import { DEFAULT_ONBOARDING, type OnboardingState } from "@/lib/onboarding";
import {
  claimLocal,
  loadExams,
  loadOnboarding,
  loadProgress,
  persistExams,
  persistOnboarding,
  persistProgress,
} from "@/lib/repository";
import {
  DEFAULT_PROGRESS,
  readExams,
  readProgress,
  loadState,
  type ExamEntry,
  type Progress,
} from "@/lib/study";

/* One hook every app view uses to read and write the student's data.

   It paints from the local copy on mount so there is no loading flash, then
   reconciles with the server row if they are signed in. Writes go through the
   repository, which handles both stores. Views never touch either directly —
   that is what keeps the Supabase swap to a single file. */
export function useAppData() {
  const [state, setState] = useState<OnboardingState>(DEFAULT_ONBOARDING);
  const [progress, setProgress] = useState<Progress>(DEFAULT_PROGRESS);
  const [exams, setExams] = useState<ExamEntry[]>([]);
  const [now, setNow] = useState<Date | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let live = true;

    setState(loadState());
    setProgress(readProgress());
    setExams(readExams());
    /* `now` stays null until mount so the server and client never disagree
       about the time. */
    setNow(new Date());
    setReady(true);

    /* The local cache belongs to one account. If the signed-in user is not the
       one it was written for — a shared phone, an expired session, a second
       account on the same browser — it is wiped, and what was just painted
       from it has to go with it.
     *
     * Painting first and correcting a moment later, rather than waiting for
     * the auth round trip, is deliberate: the common case is the same student
     * as last time, and a loading flash on every app open is a real cost paid
     * every day to avoid a rare one. The wipe below closes the rare one. */
    void claimLocal().then((wiped) => {
      if (!live) return;

      if (wiped) {
        setState(DEFAULT_ONBOARDING);
        setProgress(DEFAULT_PROGRESS);
        setExams([]);
      }

      /* Started only after ownership is settled, so a server load cannot land
         on top of a wipe and restore the previous student's row. */
      void loadOnboarding().then((next) => live && setState(next));
      void loadProgress().then((next) => live && setProgress(next));
      void loadExams().then((next) => live && setExams(next));
    });

    return () => {
      live = false;
    };
  }, []);

  const updateState = useCallback((next: OnboardingState) => {
    setState(next);
    void persistOnboarding(next);
  }, []);

  const patchState = useCallback(
    (patch: Partial<OnboardingState>) => {
      setState((current) => {
        const next = { ...current, ...patch };
        void persistOnboarding(next);
        return next;
      });
    },
    [],
  );

  const updateProgress = useCallback((next: Progress) => {
    setProgress(next);
    void persistProgress(next);
  }, []);

  const updateExams = useCallback((next: ExamEntry[]) => {
    const sorted = [...next].sort((a, b) => a.date.localeCompare(b.date));
    setExams(sorted);
    void persistExams(sorted);
  }, []);

  return {
    state,
    progress,
    exams,
    now,
    ready,
    updateState,
    patchState,
    updateProgress,
    updateExams,
  };
}
