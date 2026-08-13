/* The teaching loop, as a state machine the server owns.

   ---------------------------------------------------------------------------
   THE RULE THIS FILE EXISTS TO ENFORCE

   The model never decides what happens next. It reports what it saw — did the
   student follow, what kind of mistake was it — and the transition is computed
   here, from that report plus counters the model cannot see or influence.

   Left to decide for itself, a model is agreeable. It moves on when the
   student says "haan" without understanding, it re-explains eleven times
   because the student keeps asking, and it never says "we have done enough of
   this, let us come back to it". Every one of those is a session that ends
   with a student who has learned nothing and an account that has spent real
   money.

     START → HOOK → TEACH → CHECK ──got it──→ next concept, or SUMMARY → DONE
                      ▲        │
                      │     missed it
                      │        ▼
                      └──── RETEACH  (a different strategy each time)
                                │
                        after two reteaches
                                ▼
                          DOWNSHIFT — L1 scaffold, full worked example,
                          then move on regardless

   ---------------------------------------------------------------------------
   WHY THE LOOP ALWAYS TERMINATES

   Keeping a stuck student stuck is the worst thing this product can do. It is
   also the easiest failure to write by accident, because "keep trying until
   they get it" sounds like good teaching.

   It is not. A thirteen-year-old on their third failed attempt at the same
   check has stopped learning and started deciding they are bad at maths, and
   no fourth explanation fixes that. The right move is to show the full worked
   solution, mark the concept as needing another day, and move on — the spaced
   repetition schedule brings it back when it can land.

   So there are three independent ceilings, and any one of them ends the
   concept: turns, reteaches, and minutes. */

import type { Verdict } from "@/lib/ai/verdict";

export type Beat = "HOOK" | "TEACH" | "CHECK" | "RETEACH" | "SUMMARY" | "DONE";

export const BEATS: Beat[] = ["HOOK", "TEACH", "CHECK", "RETEACH", "SUMMARY", "DONE"];

export type SessionState = {
  currentBeat: Beat;
  turnsUsed: number;
  reteachCount: number;
  /* Whether another concept remains in this topic after the current one. */
  hasNextConcept: boolean;
  startedAt: string;
};

/* --------------------------------------------------------------------------
   Ceilings

   Enforced in code, never in the prompt. "Do not spend more than twelve turns
   on this" in a system prompt is a suggestion; a counter in Postgres is a
   limit. The distinction is the entire reason this file exists.
   -------------------------------------------------------------------------- */
export const LIMITS = {
  /* Twelve turns is roughly six exchanges — enough for a hook, a teach, a
     check, two reteaches and a summary, with room for a tangent. */
  maxTurnsPerConcept: 12,
  /* Two reteaches, three explanations total, then the worked example. */
  maxReteach: 2,
  /* A break nudge, not a lock. Attention is gone well before this, and a
     session that runs past it is a student re-reading the same line. */
  sessionMinutes: 25,
  /* Below this, a claim that the student understood is not acted on. A model
     that is unsure is usually being polite. */
  understoodConfidence: 0.6,
  /* Mastery a prerequisite topic needs before the next one unlocks. */
  unlockScore: 60,
};

export type Transition = {
  beat: Beat;
  /* Move to the next concept in the topic before the next turn. */
  advanceConcept: boolean;
  /* Reset the reteach counter — a new concept starts with a clean slate. */
  resetReteach: boolean;
  /* Increment the reteach counter. */
  countReteach: boolean;
  /* The tutor stops asking and shows the full solution. */
  downshift: boolean;
  /* Set when a ceiling ended the concept rather than the student getting it.
     Surfaced to the student as "let us come back to this", and to the mastery
     update as "taught but not confirmed". */
  forced: null | "turns" | "reteach" | "time";
};

const STAY: Omit<Transition, "beat"> = {
  advanceConcept: false,
  resetReteach: false,
  countReteach: false,
  downshift: false,
  forced: null,
};

export function nextBeat(state: SessionState, verdict: Verdict): Transition {
  /* --- Ceilings first ---------------------------------------------------
     Checked before the verdict is even read, because a limit that only
     applies when the model agrees it should is not a limit. */
  if (state.currentBeat !== "SUMMARY" && state.currentBeat !== "DONE") {
    if (state.turnsUsed >= LIMITS.maxTurnsPerConcept) {
      return { ...STAY, beat: "SUMMARY", forced: "turns" };
    }

    if (minutesElapsed(state) >= LIMITS.sessionMinutes) {
      return { ...STAY, beat: "SUMMARY", forced: "time" };
    }
  }

  switch (state.currentBeat) {
    /* The hook is one message and is never repeated. Its job is to make the
       next five minutes worth sitting through, and a second attempt at that
       is just delay. */
    case "HOOK":
      return { ...STAY, beat: "TEACH" };

    /* Teaching is always followed by a check. A concept explained and not
       checked is a concept the student has watched, not learned — and the
       whole diagnostic layer downstream has nothing to work with. */
    case "TEACH":
      return { ...STAY, beat: "CHECK" };

    case "CHECK": {
      const understood =
        verdict.student_understood && verdict.confidence >= LIMITS.understoodConfidence;

      if (understood) {
        return state.hasNextConcept
          ? { ...STAY, beat: "TEACH", advanceConcept: true, resetReteach: true }
          : { ...STAY, beat: "SUMMARY" };
      }

      /* Out of reteaches: show the worked example and move on. Note this is a
         RETEACH beat, not a jump to SUMMARY — the student still gets the full
         solution, they just do not get asked again. */
      if (state.reteachCount >= LIMITS.maxReteach) {
        return {
          ...STAY,
          beat: "RETEACH",
          countReteach: true,
          downshift: true,
          forced: "reteach",
        };
      }

      return { ...STAY, beat: "RETEACH", countReteach: true };
    }

    case "RETEACH": {
      /* After the downshift the concept ends whatever the student says. They
         have seen the full solution; asking again produces a fourth wrong
         answer and nothing else. */
      if (state.reteachCount > LIMITS.maxReteach) {
        return state.hasNextConcept
          ? { ...STAY, beat: "TEACH", advanceConcept: true, resetReteach: true, forced: "reteach" }
          : { ...STAY, beat: "SUMMARY", forced: "reteach" };
      }

      return { ...STAY, beat: "CHECK" };
    }

    case "SUMMARY":
      return { ...STAY, beat: "DONE" };

    case "DONE":
      return { ...STAY, beat: "DONE" };
  }
}

export function minutesElapsed(state: Pick<SessionState, "startedAt">) {
  return (Date.now() - new Date(state.startedAt).getTime()) / 60000;
}

/* --------------------------------------------------------------------------
   Reteach strategy

   The one place this differs from every "AI tutor" that re-sends the same
   explanation with a friendlier preamble. A student who did not follow an
   explanation will not follow it the second time either — what has to change
   is the ROUTE to the idea, not its wording.

   So the strategy is selected by attempt number and passed into the prompt:
   a different analogy, then something concrete and visual, then the full
   worked solution with nothing left to work out. It is a small change and it
   is most of the difference between a session that recovers and one that ends
   in "main ye nahi kar sakta".
   -------------------------------------------------------------------------- */
export type ReteachStrategy = "alternate_analogy" | "concrete_visual" | "worked_example";

export function reteachStrategy(reteachCount: number): ReteachStrategy {
  if (reteachCount <= 1) return "alternate_analogy";
  if (reteachCount === 2) return "concrete_visual";
  return "worked_example";
}

export const RETEACH_BRIEF: Record<ReteachStrategy, string> = {
  alternate_analogy:
    "Wahi explanation dobara mat do — wo kaam nahi kiya. CONTENT PACK me se ek ALAG analogy uthao aur usse concept dobara banao. Chhota rakho, phir ek aasan sa sawal poochho.",
  concrete_visual:
    "Ab abstract chhodo. Ek theek-theek gin-ne layak cheez lo — paise, tukde, number line pe kadam — aur uspe concept dikhao. Numbers chhote rakho. Ant me ek chhota sawal.",
  worked_example:
    "Ab poochhna band. CONTENT PACK ka worked example uthao aur poora, step by step, hal karke dikhao — ek bhi step student pe mat chhodo. Ant me ek line: ye concept dobara aayega, tab tak aage badhte hain. Koi sawal mat poochho.",
};

/* --------------------------------------------------------------------------
   Unlock gating
   -------------------------------------------------------------------------- */
export function topicUnlocked(
  prereqTopicIds: string[],
  scoreByTopic: Record<string, number>,
): { unlocked: boolean; blockedBy: string[] } {
  const blockedBy = prereqTopicIds.filter(
    (id) => (scoreByTopic[id] ?? 0) < LIMITS.unlockScore,
  );

  return { unlocked: blockedBy.length === 0, blockedBy };
}
