/* The shape of a content pack.

   One file per topic, under content/<board>/class<n>/<subject>/ch<nn>/. The
   file is the source of truth; scripts/seed-content.ts pushes it into Postgres
   and scripts/validate-content.ts refuses to let a broken one through.

   Deliberately plain types and no schema library. These objects are written by
   a human in an editor, checked by a script before they reach the database, and
   read back by the server from tables whose columns already constrain them —
   so a runtime validator earns its place (validate.ts) and a second type system
   does not.

   No "server-only" marker: the file is imported by the seed script, which runs
   under plain node, as well as by the app. */

export type Misconception = {
  /* Stable within its concept: 'm1', 'm2'. A question's distractor_map points
     at these, and error_events stores the id, so renumbering an existing one
     silently rewrites history. Append; never renumber. */
  id: string;
  /* What the student believes, in their words. */
  wrong_belief: string;
  /* Why that belief is wrong. The tutor uses this to correct, so it must be an
     explanation and not a restatement. */
  why_wrong: string;
  /* The one line worth remembering afterwards. */
  correction: string;
  /* A question that surfaces this specific error. This is what the CHECK beat
     asks — the tutor never has to invent a diagnostic. */
  probe: string;
};

export type Analogy = { id: string; text: string };

export type Formula = { id: string; latex: string; note?: string };

export type WorkedExample = {
  id: string;
  problem: string;
  steps: string[];
  answer: string;
};

export type Concept = {
  id: string;
  seq: number;
  title: string;
  /* The crisp definition. One or two sentences. */
  statement: string;
  /* A real-life opener. The HOOK beat delivers this rather than writing one,
     because a tutor inventing openers produces a different lesson every time
     and none of them can be improved. */
  hook?: string;
  analogies: Analogy[];
  misconceptions: Misconception[];
  worked_examples: WorkedExample[];
  formulas: Formula[];
};

export type QType = "mcq" | "msq" | "nvt" | "subjective";
export type QLevel = "L1" | "L2" | "L3" | "L4";

export type Option = { key: string; text: string };

/* What counts as right, per type:
     mcq / msq   string[] of option keys
     nvt         { value, tol, exact? }
     subjective  { rubric: string[] } — the points a marker looks for */
export type Correct =
  | string[]
  | { value: number; tol: number; exact?: string }
  | { rubric: string[] };

export type BankQuestion = {
  id: string;
  conceptId?: string;
  qtype: QType;
  level: QLevel;
  stem: string;
  options?: Option[];
  correct: Correct;
  solution: string;
  /* Wrong option key → misconception id on this question's concept.
     Every wrong option should appear here. A blank entry is a marking call the
     server has to pay a model for. */
  distractor_map?: Record<string, string>;
  marks?: number;
  negative_marks?: number;
  source?: string;
};

export type ContentFile = {
  /* Which organisation owns this pack.
   *
   * Absent or null means the shared base curriculum, written by the platform
   * team and visible to everyone. Set means an institute wrote it and only
   * its own members see it.
   *
   * Deliberately NOT usually in the file. The seed script takes --org, so one
   * folder of packs can be pushed into any org without editing every JSON —
   * and a pack in content/ with an org id baked in is a pack that gets copied
   * to the wrong customer. */
  orgId?: string | null;
  board: string;
  classLevel: number;
  subjectId: string;
  /* Where these concepts came from and when. Same rule as lib/syllabus.ts: a
     pack without provenance is a pack nobody can check. */
  provenance: { source: string; verifiedOn: string; note?: string };
  subject: { id: string; name: string; language?: string };
  chapter: {
    id: string;
    no: number;
    title: string;
    ncertRef?: string;
    estMinutes?: number;
    isFree?: boolean;
  };
  topic: {
    id: string;
    no: number;
    title: string;
    prereqTopicIds?: string[];
  };
  concepts: Concept[];
  questions: BankQuestion[];
};

/* --------------------------------------------------------------------------
   Helpers shared by the seed script, the validator and the server
   -------------------------------------------------------------------------- */

export function misconceptionsOf(concept: Concept) {
  return concept.misconceptions ?? [];
}

export function findMisconception(concept: Concept, id: string | null) {
  if (!id) return null;
  return concept.misconceptions.find((entry) => entry.id === id) ?? null;
}

/* Which options on a multiple-choice question are wrong. Used by the validator
   to check the distractor map covers all of them, and by nothing else — the
   server never sends this to a browser. */
export function wrongOptionKeys(question: BankQuestion): string[] {
  if (!question.options) return [];
  const correct = new Set(Array.isArray(question.correct) ? question.correct : []);
  return question.options
    .map((option) => option.key)
    .filter((key) => !correct.has(key));
}
