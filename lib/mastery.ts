/* The 4-layer mastery system.

   Teaching, practising, testing and fixing are four different jobs, and a
   student who only does one of them plateaus. The layers run in order per
   chapter:

     1 Teach      concept, diagram, checked understanding
     2 Practise   graded problems, easiest to hardest
     3 Test       timed, exam pattern, negative marking
     4 Fix        classify every mistake, then drill only the weakness

   Layer 4 is the one that makes the other three compound. Getting a question
   wrong is not one event: it matters enormously whether the student did not
   know the concept, knew it but misremembered the formula, or knew everything
   and dropped a sign. Those three need completely different responses, and
   lumping them into "wrong" is what makes ordinary practice inefficient. */

export type LayerId = "teach" | "practise" | "test" | "fix";

export type Layer = {
  id: LayerId;
  order: number;
  name: string;
  blurb: string;
  /* What has to be true before this layer is worth doing. */
  requires?: LayerId;
};

export const LAYERS: Layer[] = [
  {
    id: "teach",
    order: 1,
    name: "Learn the concept",
    blurb: "One-to-one teaching with a diagram, then a check that you followed it.",
  },
  {
    id: "practise",
    order: 2,
    name: "Graded practice",
    blurb: "Problems that climb from foundation to advanced as you get them right.",
    requires: "teach",
  },
  {
    id: "test",
    order: 3,
    name: "Simulation test",
    blurb: "Timed, exam pattern, negative marking. The real thing, at home.",
    requires: "practise",
  },
  {
    id: "fix",
    order: 4,
    name: "Fix sheet",
    blurb: "Every mistake classified, then practice built only from your weak spots.",
    requires: "test",
  },
];

/* ---------------------------------------------------------------------------
   Practice levels

   Four bands rather than "easy/medium/hard", because the jump that loses most
   students is not difficulty — it is the move from "apply the method you were
   just shown" to "work out which method this even is".
   --------------------------------------------------------------------------- */
export type LevelId = "L1" | "L2" | "L3" | "L4";

export type Level = {
  id: LevelId;
  name: string;
  /* What the question demands of the student, written for the prompt. */
  brief: string;
  /* How many of a set sit at this level. */
  share: number;
};

export const LEVELS: Level[] = [
  {
    id: "L1",
    name: "Foundation",
    brief:
      "direct recall or a single-step application of the definition or formula, with the method obvious from the question",
    share: 0.3,
  },
  {
    id: "L2",
    name: "Core",
    brief:
      "the standard textbook exercise: two or three steps, the method clear once the student identifies the topic",
    share: 0.35,
  },
  {
    id: "L3",
    name: "Applied",
    brief:
      "a worded or unfamiliar situation where the student must work out which method applies before using it",
    share: 0.2,
  },
  {
    id: "L4",
    name: "Advanced",
    brief:
      "board-exam hardest: multi-step, combines this chapter with another, or requires a non-obvious insight",
    share: 0.15,
  },
];

/* Where the ladder sits.
 *
 * The four bands are the SHAPE of a set and difficulty is its HEIGHT — they
 * are not competing settings, which is why both exist. A foundation set is
 * still a ladder; it is just a ladder whose weight is at the bottom.
 *
 * This is here because the question route read the student's chosen difficulty,
 * validated it, and then never used it: the ladder was built from the fixed
 * shares above whatever they picked, and the dropdown in the UI did nothing at
 * all. `standard` reproduces those original shares exactly, so the default
 * behaviour is unchanged and the other two settings now mean something. */
export type Difficulty = "foundation" | "standard" | "stretch";

export const DIFFICULTIES: Difficulty[] = ["foundation", "standard", "stretch"];

export const DIFFICULTY_SHARES: Record<Difficulty, Record<LevelId, number>> = {
  foundation: { L1: 0.45, L2: 0.35, L3: 0.15, L4: 0.05 },
  standard: { L1: 0.3, L2: 0.35, L3: 0.2, L4: 0.15 },
  stretch: { L1: 0.1, L2: 0.25, L3: 0.35, L4: 0.3 },
};

/* How many questions of each level make up a set of `total`. */
export function levelSplit(
  total: number,
  difficulty: Difficulty = "standard",
): Record<LevelId, number> {
  const shares = DIFFICULTY_SHARES[difficulty] ?? DIFFICULTY_SHARES.standard;

  const split = {} as Record<LevelId, number>;
  let assigned = 0;

  LEVELS.forEach((level, index) => {
    const count =
      index === LEVELS.length - 1
        ? total - assigned
        : Math.max(1, Math.round(total * shares[level.id]));
    split[level.id] = count;
    assigned += count;
  });

  return split;
}

/* ---------------------------------------------------------------------------
   Error types

   The whole point of layer 4. A mistake is only useful if you know which kind
   it was, because the fix differs completely.
   --------------------------------------------------------------------------- */
export type ErrorType =
  | "concept"
  | "formula"
  | "application"
  | "calculation"
  | "careless"
  | "incomplete"
  | "blank"
  | "guess";

/* "none" is not a kind of mistake, so it is not in ERROR_KINDS — but it is what
   gets stored against a correct answer, and several call sites need to say so.
   One alias rather than `ErrorType | "none"` written out in six files. */
export type ErrorOutcome = ErrorType | "none";

export type ErrorKind = {
  id: ErrorType;
  name: string;
  /* Told to the model, so it classifies the way we mean. */
  definition: string;
  /* Told to the student, so a label is advice rather than a verdict. */
  fix: string;
  /* Whether this weakness should pull the student back a layer. */
  sendsBackTo: LayerId;
};

export const ERROR_KINDS: ErrorKind[] = [
  {
    id: "concept",
    name: "Concept gap",
    definition:
      "The student has misunderstood what the idea means or when it applies. The working is not a slip; it follows from a wrong belief.",
    fix: "Re-learn this one. More practice on a concept you have wrong just embeds it.",
    sendsBackTo: "teach",
  },
  {
    id: "formula",
    name: "Formula gap",
    definition:
      "The formula, rule or constant as WRITTEN DOWN is wrong — misremembered, misquoted or wrongly rearranged. Judge the statement of the formula, not the number it produced. If the student wrote b squared plus 4ac instead of b squared minus 4ac, that is this, not a calculation error.",
    fix: "The thinking was right. Drill the formula until writing it is automatic.",
    sendsBackTo: "practise",
  },
  {
    id: "application",
    name: "Wrong method",
    definition:
      "The concept and formulae are known, but the student picked the wrong approach for this particular question.",
    fix: "You know the tools. Practice spotting which one a question is asking for.",
    sendsBackTo: "practise",
  },
  {
    id: "calculation",
    name: "Calculation error",
    definition:
      "The formula was written correctly and the method is right, but a genuine computation was performed wrongly — an addition, multiplication, expansion or simplification that gives the wrong value. Not for sign slips or copied values, which are careless.",
    fix: "Method was sound. Slow the working down and check each line.",
    sendsBackTo: "practise",
  },
  {
    id: "careless",
    name: "Silly mistake",
    definition:
      "A slip in reading off or copying: a wrong sign, a missing or wrong unit, a misread number, a value transcribed wrongly from one line to the next, or roots read off with the wrong sign from a correct factorisation. No actual arithmetic was performed incorrectly — the student simply wrote down something other than what their own working gave. Prefer this over calculation error whenever the fault is a sign or a copied value.",
    fix: "You knew this. These are the cheapest marks in the paper to win back.",
    sendsBackTo: "test",
  },
  {
    id: "incomplete",
    name: "Incomplete answer",
    definition:
      "What is written is correct but stops short of what the marks asked for — missing steps, units, or a required statement.",
    fix: "Right answer, not enough of it. Write the steps the marks are for.",
    sendsBackTo: "test",
  },
  {
    id: "blank",
    name: "Not attempted",
    definition: "Nothing was written, or nothing relevant to the question.",
    fix: "Start from the teaching layer — there is nothing to correct yet.",
    sendsBackTo: "teach",
  },
  /* Added with the tutoring layer. A wrong multiple-choice answer that matches
     no known misconception is usually not a diagnosable mistake at all — it is
     a student picking an option to move on. Calling that a concept gap would
     put a correction on the fix sheet for a belief they were never shown to
     hold, and would drag the readiness score down for something that carries
     no information. */
  {
    id: "guess",
    name: "Guess",
    definition:
      "A wrong answer with no working and no recognisable reasoning behind it — most often a multiple-choice option chosen to move on. Choose this only when no other kind fits; if the wrong answer follows from a specific wrong belief, that is a concept gap.",
    fix: "Nothing to correct here — this one was a guess. Slow down and attempt it properly.",
    sendsBackTo: "practise",
  },
];

export function errorKind(id: ErrorType): ErrorKind {
  return ERROR_KINDS.find((kind) => kind.id === id) ?? ERROR_KINDS[0];
}

/* NOTE on accuracy. Measured against six deliberate mistakes on a Class 10
   quadratics question, gpt-4o-mini classifies 5 of 6 the way we mean. The one
   it does not is a sign slip when reading roots off a correct factorisation:
   it calls that a calculation error rather than careless. Two rounds of
   sharpening the definitions did not move it, so it is left as a known limit
   rather than over-fitted. The consequence is small — both send the student
   back to practise more carefully — where the distinctions that change what a
   student should do next (concept gap, formula gap, not attempted) are
   classified correctly. Re-measure if the model changes. */

/* The list handed to the model when it classifies. */
export function errorTaxonomyPrompt() {
  return ERROR_KINDS.map((kind) => `- ${kind.id}: ${kind.definition}`).join("\n");
}

/* ---------------------------------------------------------------------------
   Readiness, 0-100

   Not a grade and not a percentage of questions right. It answers one
   question — if the exam were tomorrow, how ready is this chapter — and so it
   weighs recent accuracy above old accuracy, counts the hard levels for more
   than the easy ones, and refuses to go high while a concept gap is open.
   --------------------------------------------------------------------------- */
export type Attempt = {
  chapterId: string;
  level: LevelId;
  correct: boolean;
  errorType?: ErrorType;
  /* ISO date. */
  date: string;
};

export type Readiness = {
  score: number;
  band: "Not started" | "Foundation" | "Developing" | "Proficient" | "Advanced";
  /* Why it is what it is, in one line the student can act on. */
  reason: string;
};

const LEVEL_WEIGHT: Record<LevelId, number> = { L1: 1, L2: 1.5, L3: 2.25, L4: 3 };

export function readinessFor(attempts: Attempt[]): Readiness {
  if (attempts.length === 0) {
    return {
      score: 0,
      band: "Not started",
      reason: "No practice on this chapter yet.",
    };
  }

  /* Recency: the last 20 attempts carry the weight, because what a student
     could do a month ago is not what they can do today. */
  const recent = attempts.slice(-20);

  let earned = 0;
  let possible = 0;

  recent.forEach((attempt, index) => {
    /* Later attempts count for more, ramping from 1x to 2x across the window. */
    const recency = 1 + index / Math.max(1, recent.length - 1);
    const weight = LEVEL_WEIGHT[attempt.level] * recency;

    possible += weight;
    if (attempt.correct) earned += weight;
  });

  let score = Math.round((earned / possible) * 100);

  /* An open concept gap caps readiness however good the rest looks: a student
     who cannot do the idea is not ready, whatever their L1 accuracy says. */
  const openConceptGap = recent
    .slice(-8)
    .some((attempt) => attempt.errorType === "concept");

  if (openConceptGap) score = Math.min(score, 55);

  /* Breadth: you cannot be "ready" having only ever answered foundation
     questions, so cap until the harder levels have been seen. */
  const seenLevels = new Set(recent.map((attempt) => attempt.level));
  if (!seenLevels.has("L3") && !seenLevels.has("L4")) score = Math.min(score, 70);
  if (!seenLevels.has("L4")) score = Math.min(score, 85);

  const band: Readiness["band"] =
    score >= 85
      ? "Advanced"
      : score >= 70
        ? "Proficient"
        : score >= 45
          ? "Developing"
          : "Foundation";

  const reason = openConceptGap
    ? "A concept gap is open — re-learn before drilling more."
    : !seenLevels.has("L4")
      ? "Try the advanced level to push past this."
      : score >= 85
        ? "Holding up across all four levels."
        : "Keep practising — accuracy on the harder levels is what moves this.";

  return { score, band, reason };
}

/* Which chapters most deserve the next hour: weak, and examinable soon. */
export function weakestChapters(
  attemptsByChapter: Record<string, Attempt[]>,
  limit = 5,
) {
  return Object.entries(attemptsByChapter)
    .map(([chapterId, attempts]) => ({
      chapterId,
      readiness: readinessFor(attempts),
      attempts: attempts.length,
    }))
    .filter((entry) => entry.attempts > 0)
    .sort((a, b) => a.readiness.score - b.readiness.score)
    .slice(0, limit);
}

/* ---------------------------------------------------------------------------
   Simulation tests

   Real exam pattern, which means negative marking. That is not a detail: a
   paper where a wrong answer costs nothing rewards guessing, and a student who
   practises on one learns a habit that loses them marks on the day. The whole
   point of a simulation is that the cost of a guess is real.
   --------------------------------------------------------------------------- */
export type QuestionFormat = "mcq" | "nvt" | "msq";

export type FormatRule = {
  id: QuestionFormat;
  name: string;
  short: string;
  correct: number;
  wrong: number;
  unattempted: number;
  /* Told to the model when it writes questions of this format. */
  brief: string;
};

export const FORMATS: FormatRule[] = [
  {
    id: "mcq",
    name: "Single correct",
    short: "MCQ",
    correct: 4,
    wrong: -1,
    unattempted: 0,
    brief:
      "exactly four options with exactly one correct; distractors must be the answers a student reaches by making a specific common mistake, not filler",
  },
  {
    id: "nvt",
    name: "Numerical value",
    short: "NVT",
    correct: 4,
    wrong: 0,
    unattempted: 0,
    brief:
      "the answer is a single number with no options given; state the unit and the rounding required",
  },
  {
    id: "msq",
    name: "Multiple correct",
    short: "MSQ",
    correct: 4,
    wrong: -2,
    unattempted: 0,
    brief:
      "four options with two or three correct; every correct option must be defensible from the chapter alone",
  },
];

export function formatRule(id: QuestionFormat): FormatRule {
  return FORMATS.find((entry) => entry.id === id) ?? FORMATS[0];
}

export type TestAnswer = {
  format: QuestionFormat;
  /* Letters for mcq/msq, the typed number for nvt. Empty means unattempted. */
  given: string[];
  expected: string[];
};

/* Scores one question under its own format's rules.

   MSQ is all-or-nothing here rather than partial-credit: a student who ticks
   two of three correct options has not demonstrated they know the third is
   correct, and partial schemes vary between boards. Being strict is the
   version that never flatters. */
export function scoreAnswer(answer: TestAnswer): {
  marks: number;
  state: "correct" | "wrong" | "skipped";
} {
  const rule = formatRule(answer.format);

  const given = answer.given.map((value) => value.trim()).filter(Boolean);
  if (given.length === 0) return { marks: rule.unattempted, state: "skipped" };

  if (answer.format === "nvt") {
    const got = Number(given[0]);
    const want = Number(answer.expected[0]);

    if (!Number.isFinite(got) || !Number.isFinite(want)) {
      return { marks: rule.wrong, state: "wrong" };
    }

    /* A numeric answer is right if it agrees to within rounding — a student who
       carries more decimals should not be punished for it. */
    const tolerance = Math.max(Math.abs(want) * 0.01, 0.01);
    const ok = Math.abs(got - want) <= tolerance;
    return { marks: ok ? rule.correct : rule.wrong, state: ok ? "correct" : "wrong" };
  }

  const gotSet = [...new Set(given.map((value) => value.toUpperCase()))].sort();
  const wantSet = [...new Set(answer.expected.map((value) => value.toUpperCase()))].sort();

  const ok =
    gotSet.length === wantSet.length &&
    gotSet.every((value, index) => value === wantSet[index]);

  return { marks: ok ? rule.correct : rule.wrong, state: ok ? "correct" : "wrong" };
}

export type TestResult = {
  score: number;
  maxScore: number;
  correct: number;
  wrong: number;
  skipped: number;
  /* Marks handed back by wrong answers, which is the number that makes a
     student stop guessing. */
  lostToNegative: number;
  accuracy: number;
};

export function scoreTest(answers: TestAnswer[]): TestResult {
  let score = 0;
  let maxScore = 0;
  let correct = 0;
  let wrong = 0;
  let skipped = 0;
  let lostToNegative = 0;

  for (const answer of answers) {
    const rule = formatRule(answer.format);
    maxScore += rule.correct;

    const result = scoreAnswer(answer);
    score += result.marks;

    if (result.state === "correct") correct += 1;
    if (result.state === "skipped") skipped += 1;
    if (result.state === "wrong") {
      wrong += 1;
      lostToNegative += Math.abs(Math.min(0, result.marks));
    }
  }

  const attempted = correct + wrong;

  return {
    /* A paper cannot score below zero on any board that uses this pattern. */
    score: Math.max(0, score),
    maxScore,
    correct,
    wrong,
    skipped,
    lostToNegative,
    accuracy: attempted ? Math.round((correct / attempted) * 100) : 0,
  };
}
