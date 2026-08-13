/* Drafts a whole topic pack — the concept AND its questions.
 *
 *   npm run author:pack -- \
 *     --chapter-no 2 --chapter "Linear Equations in One Variable" \
 *     --topic-no 3 --topic "Variable on Both Sides" \
 *     --concept "Solving with the variable on both sides"
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS NEXT TO author-concept.ts
 *
 * That script drafts a concept: the statement, the hook, four misconceptions,
 * two worked examples. It is the harder half and it is done well.
 *
 * What it does not draft is questions, and a pack without them is not
 * teachable — the validator says so (six per concept, at least one L1 and one
 * L3 or L4) and so does the tutor, whose CHECK beat has nothing to ask. Worse,
 * the misconceptions arrive with nothing pointing at them: every draft warned
 * "no question distractor maps to this misconception, so it can only ever be
 * found by asking a model", which is the exact cost the distractor map exists
 * to avoid. A mapped distractor is free, instant and right every time.
 *
 * So this runs that script for the concept, then asks for questions built
 * against the misconceptions it actually produced, and assembles the file.
 *
 * ---------------------------------------------------------------------------
 * IT WRITES TO drafts/, NOT content/
 *
 * `npm run content:seed` pushes everything under content/ into the database.
 * If this wrote there, a model would have a path to the live curriculum with
 * no human in it — the one thing docs/authoring.md and author-concept.ts both
 * refuse. Moving a reviewed file from drafts/ to content/ is that human, and
 * it is deliberately a manual act.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT CHECKS BEFORE A REVIEWER SEES IT
 *
 * The mechanical things a reviewer should never have to spend attention on:
 * every distractor maps to a misconception that exists, every misconception
 * has at least one distractor, the correct key is among the options, no two
 * options are identical, and the level spread satisfies the validator. What it
 * cannot check is whether a Class 8 student really holds these beliefs, which
 * is the whole job of the review. */

import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { Concept, ContentFile } from "@/lib/content/pack";
import { checkMarkedAnswer } from "@/lib/math/verify";
import { validateFile } from "@/lib/content/validate";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));

function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    try {
      for (const line of readFileSync(resolve(ROOT, file), "utf8").split(/\r?\n/)) {
        const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
        if (match && !process.env[match[1]]) {
          process.env[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
        }
      }
    } catch {
      /* Not present. */
    }
  }
}

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

/* Which Class 8 maths textbook a pack belongs to.
 *
 * There are two, and that is not a transitional accident: NCERT replaced the
 * sixteen-chapter Mathematics book with Ganita Prakash for 2026-27, every
 * chapter title is new, and schools are mid-switch. lib/syllabus.ts already
 * plans against the new book while everything in content/ is written against
 * the old one.
 *
 * The ids have to say which. Chapter ids were derived from the number alone —
 * c8-math-ch1 — so the new chapter 1 ("A Square and A Cube") and the old
 * chapter 1 ("Rational Numbers") both wanted the same primary key, and the
 * seeder upserts on id: one title would have silently replaced the other, with
 * both books' topics hanging off the survivor. lib/content/validate.ts refuses
 * that now, and this is the flag that avoids it in the first place.
 *
 * `legacy` is the default so every invocation written before this flag existed
 * still produces byte-identical ids. */
const BOOKS = {
  legacy: {
    name: "NCERT Mathematics Class 8",
    idPrefix: "c8-math",
    dir: "ch",
  },
  gp: {
    name: "NCERT Ganita Prakash Class 8",
    idPrefix: "c8-math-gp",
    dir: "gp-ch",
  },
} as const;

type BookId = keyof typeof BOOKS;

const QUESTION_SYSTEM = `You are a CBSE curriculum author writing PRACTICE QUESTIONS for Class 8 Mathematics, for a one-to-one tutoring app used by Indian school students.

You are given a concept and the misconceptions its author identified. Your questions exist to CATCH those misconceptions.

The rules, in order of how much they matter:

1. EVERY WRONG OPTION IS A MISCONCEPTION, NOT A RANDOM NUMBER.
   distractor_map must contain EXACTLY the three wrong option keys, each mapped to the id of the misconception that produces it. Not two of them. Not the correct key — never the correct key.
   A wrong option nobody would pick teaches nothing and wastes a question: a student who chooses it is told "that is not right" instead of being told what they believe.
   If you cannot think of a misconception that produces a fourth option, change the option until you can.

2. EVERY MISCONCEPTION MUST BE CAUGHT BY AT LEAST ONE QUESTION.
   Across the set, every id in the list must appear in some distractor_map.

3. THE ARITHMETIC MUST BE RIGHT.
   Both in the correct answer and in the wrong ones: a distractor is only useful if it is exactly what that mistake produces.

3a. EXACTLY ONE OPTION MAY BE DEFENSIBLE.
   Before you finish a question, check every wrong option against the stem and confirm it is actually wrong. "Which of these is a perfect square?" offering both 16 and 25 has no answer, and this is the single most common fault in this job — it comes from picking four plausible numbers without re-reading what was asked.
   It hides best in options that reach the same verdict by different reasoning. "Can $9^2$ be a perfect cube?" offering both "No, it's not possible" and "No, only certain perfect squares can be perfect cubes" has two correct options, however much you meant the second one.
   The same applies to solution: it must argue for the option in correct. A solution that reasons its way to a different option than the one marked means one of the two is wrong, and both go out to a student.

3b. READ YOUR OWN QUANTIFIER.
   "CAN a number ending in 4 be a perfect square?" is settled by one example — 64 — so the answer is yes. "Is EVERY number ending in 4 a perfect square?" is a different question with a different answer. Decide which one you are asking, then answer that one.

4. WRITE EXACTLY THE NUMBER OF QUESTIONS ASKED FOR.

5. LEVELS.
   L1 is recall or one step. L2 is two steps. L3 applies the idea in an unfamiliar shape. L4 stretches. Include at least one L1 and at least one L3.

6. LANGUAGE.
   Plain English, the way a good teacher speaks it aloud in an Indian classroom. No Hindi or Hinglish words — the corpus is English throughout. Mathematics in LaTeX between $...$. Names and contexts stay Indian even though the language does not: rupees, autos, cricket, tiffin, not dollars and cookies.

7. SOLUTIONS.
   One or two lines, showing the step that matters. Not a restatement of the answer.`;

const QUESTION_SCHEMA = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      minItems: 1,
      maxItems: 4,
      items: {
        type: "object",
        properties: {
          qtype: { type: "string", enum: ["mcq"] },
          level: { type: "string", enum: ["L1", "L2", "L3", "L4"] },
          stem: { type: "string" },
          options: {
            type: "array",
            minItems: 4,
            maxItems: 4,
            items: {
              type: "object",
              properties: {
                key: { type: "string", enum: ["A", "B", "C", "D"] },
                text: { type: "string" },
              },
              required: ["key", "text"],
            },
          },
          correct: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 1 },
          distractor_map: { type: "object", additionalProperties: { type: "string" } },
          solution: { type: "string" },
        },
        required: ["qtype", "level", "stem", "options", "correct", "distractor_map", "solution"],
      },
    },
  },
  required: ["questions"],
};

type DraftQuestion = {
  qtype: "mcq";
  level: "L1" | "L2" | "L3" | "L4";
  stem: string;
  options: { key: string; text: string }[];
  correct: string[];
  distractor_map: Record<string, string>;
  solution: string;
};

/* LaTeX delimiters, normalised.
 *
 * The corpus uses $...$ and components/app/Maths.tsx renders on that. A model
 * asked for LaTeX returns \( ... \) about a third of the time, and those
 * render as literal backslashes and brackets on the student's screen — a
 * formatting quirk that looks like a broken app.
 *
 * Converted rather than rejected: it is mechanical, unambiguous, and failing a
 * whole draft over a delimiter would send a reviewer back to the model for
 * something a regex fixes exactly. */
function normaliseMath<T>(value: T): T {
  if (typeof value === "string") {
    return value
      .replace(/\\\(/g, "$")
      .replace(/\\\)/g, "$")
      .replace(/\\\[/g, "$$")
      .replace(/\\\]/g, "$$") as unknown as T;
  }

  if (Array.isArray(value)) return value.map((item) => normaliseMath(item)) as unknown as T;

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        normaliseMath(item),
      ]),
    ) as T;
  }

  return value;
}


/* The mechanical review, done before a human opens the file. Returns the
   problems a reviewer would otherwise have to find by reading four options
   against four misconceptions, eight times. */
function inspect(
  questions: DraftQuestion[],
  misconceptionIds: string[],
): { blocking: string[]; soft: string[]; unchecked: number[] } {
  const problems: string[] = [];
  const soft: string[] = [];
  const caught = new Set<string>();

  questions.forEach((question, index) => {
    const where = `q${index + 1}`;
    const keys = question.options.map((option) => option.key);

    for (const key of question.correct) {
      if (!keys.includes(key)) problems.push(`${where}: correct answer ${key} is not an option.`);
    }

    /* The schema says minItems 1, maxItems 1 and the model still returns two
       from time to time — a tool-call schema is a strong hint, not a
       constraint. Caught here rather than only in validateFile at the end,
       because here the repair round can still be told about it; there, the
       draft is already written and a person has to go fix it by hand. */
    if (question.qtype === "mcq" && question.correct.length !== 1) {
      problems.push(
        `${where}: ${question.correct.length} correct options on an mcq. Exactly one, or make it an msq.`,
      );
    }

    const texts = question.options.map((option) => option.text.trim());
    if (new Set(texts).size !== texts.length) {
      problems.push(`${where}: two options are identical, so one of them cannot be chosen.`);
    }

    for (const [key, misconceptionId] of Object.entries(question.distractor_map)) {
      if (!keys.includes(key)) {
        problems.push(`${where}: distractor_map names option ${key}, which does not exist.`);
      }

      if (question.correct.includes(key)) {
        problems.push(`${where}: option ${key} is both the correct answer and a distractor.`);
      }

      if (!misconceptionIds.includes(misconceptionId)) {
        problems.push(`${where}: maps to ${misconceptionId}, which is not a misconception here.`);
      }

      caught.add(misconceptionId);
    }

    /* The validator warns about this and it is the whole reason the map
       exists, so it is checked here where a repair pass can still fix it. */
    const unmapped = keys.filter(
      (key) => !question.correct.includes(key) && !(key in question.distractor_map),
    );

    if (unmapped.length > 0) {
      soft.push(
        `${where}: wrong option${unmapped.length > 1 ? "s" : ""} ${unmapped.join(", ")} map to no misconception.`,
      );
    }
  });

  /* Warned about, not blocked. lib/content/validate.ts treats this as a
     warning too, and a stricter rule here would mean nearly every draft
     "fails" for something a reviewer is going to read anyway — which teaches
     people to ignore the exit code. The reviewer is told; the pack still
     lands. */
  for (const id of misconceptionIds) {
    if (!caught.has(id)) {
      soft.push(`${id} is caught by no question — it can only be found by asking a model.`);
    }
  }

  /* Six is the validator's floor — below it the CHECK beat starts repeating
     itself inside one sitting. */
  if (questions.length < 6) {
    problems.push(`${questions.length} questions; 6 is the floor.`);
  }

  const unchecked: number[] = [];

  for (const [index, question] of questions.entries()) {
    const verdict = checkMarkedAnswer(question);

    if (verdict === "wrong") {
      problems.push(
        `q${index + 1}: the marked answer does not satisfy the equation in the stem.`,
      );
    }

    if (verdict === "unverifiable") unchecked.push(index);

    const text = JSON.stringify([question.stem, question.options, question.solution]);

    if (text.includes("\\(") || text.includes("\\[")) {
      problems.push(
        `q${index + 1}: LaTeX in \\( \\) form, which renders as literal brackets. Use $...$.`,
      );
    }
  }

  const levels = new Set(questions.map((question) => question.level));
  if (!levels.has("L1")) problems.push("No L1 question — nothing to open a check with.");
  if (!levels.has("L3") && !levels.has("L4")) problems.push("Nothing above L2.");

  return { blocking: problems, soft, unchecked };
}

/* --------------------------------------------------------------------------
   The second reader
   -------------------------------------------------------------------------- */

/* checkMarkedAnswer substitutes a value back into an equation, which is exact
 * and free — and applies to almost nothing outside the algebra chapters. On
 * the first Ganita Prakash chapter ("A Square and A Cube") it could check 0 of
 * 9 questions, so `inspect` printed "Clean" over a set in which:
 *
 *   - one asked "which of these is a perfect square?" and offered both 16 and
 *     25, marking only 16
 *   - one marked "Yes" while its own solution line argued "no"
 *   - one asked "CAN a number ending in 4 be a perfect square?" and marked
 *     "No, not necessarily", which answers "must it".
 *
 * Three of nine. That is the same rate the substitution check was written for,
 * on the questions it happens not to cover — so the coverage gap is not a
 * detail, it is most of the chapters.
 *
 * So: answer the question cold. The solver is shown the stem and the options
 * and NOT which one is marked, so it cannot agree out of politeness. Where it
 * disagrees, or where it finds a second option that is also correct, a person
 * is told exactly where to look.
 *
 * It is a reader, not a judge. A model can be wrong about a question the
 * author got right, so nothing here blocks — every finding is a "check" line
 * with the solver's own reason attached, which is what makes it worth reading
 * rather than clicking past. */
const SOLVER_SYSTEM = `You are checking a multiple-choice question for a Class 8 Mathematics textbook.

You are given a question and its options. You are NOT told which option the author marked correct — decide it yourself, from the mathematics.

WORK BEFORE YOU ANSWER

Fill "working" first, with one line per option, in order. On each line do the arithmetic out loud and then say verdict=correct or verdict=wrong. Do not assert; compute. "64 = 8 x 8, so it is a perfect square, verdict=wrong for a question asking which is NOT one."

Only after every option has a line, fill the rest:
- answer: the key of the one option your working found correct. Use the KEY (A, B, C, D), never the value.
- also_correct: the keys of any OTHER options your working also marked correct. Usually empty. This is the field that matters most: a second defensible option makes the question unanswerable, and it is the easiest fault for an author to miss.
- unanswerable: true if the question cannot be answered as written — it asks one thing and the options answer another, no option is correct, or the wording is genuinely ambiguous.
- reason: one short line, quoting the arithmetic that decided it.

WHERE A SECOND CORRECT OPTION HIDES

Options that reach the SAME verdict by different reasoning are the ones to look at hardest. A question asking whether $9^2$ can be a perfect cube offered both "No, it's not possible" and "No, only certain perfect squares can be perfect cubes" — the author meant the second, and the first is not wrong. Judge each option on whether it is true of THIS number, not on whether it sounds like the sentence the author was reaching for.

THREE MISTAKES TO AVOID, ALL SEEN IN THIS JOB

Square and cube are different operations. The cube root of 1728 is 12; its square root is not. Name which one the question asked before you compute.

Answer the question that is written. "CAN a number ending in 4 be a perfect square?" is settled by one example — 64 — so the answer is yes. "Is EVERY number ending in 4 a perfect square?" is a different question with a different answer. Read the quantifier.`;

const SOLVER_SCHEMA = {
  type: "object",
  properties: {
    working: {
      type: "array",
      items: { type: "string" },
      description: "One line per option, in order: the arithmetic, then verdict=correct or verdict=wrong.",
    },
    answer: { type: "string" },
    also_correct: { type: "array", items: { type: "string" } },
    unanswerable: { type: "boolean" },
    reason: { type: "string" },
  },
  required: ["working", "answer", "also_correct", "unanswerable", "reason"],
};

type SolverVerdict = {
  working: string[];
  answer: string;
  also_correct: string[];
  unanswerable: boolean;
  reason: string;
};

/* The option a reply refers to, whether it named the key or the value.
   Returns null when it matches neither, which is the only case worth
   bothering a reviewer with. */
function asKey(question: DraftQuestion, reply: string): string | null {
  const said = reply.trim();
  if (said === "") return null;

  const byKey = question.options.find(
    (option) => option.key.toLowerCase() === said.toLowerCase(),
  );
  if (byKey) return byKey.key;

  /* Loose on purpose: "$5$" and "5" and " 5 " are the same answer, and the
     difference is LaTeX, not mathematics. */
  const bare = (text: string) => text.replace(/[$\s]/g, "").toLowerCase();

  const byText = question.options.find((option) => bare(option.text) === bare(said));
  return byText ? byText.key : null;
}

async function secondReader(
  questions: DraftQuestion[],
  /* Indices worth spending a call on — the ones substitution could not
     check. Re-checking the rest would cost money to be told something an
     exact method already settled. */
  indices: number[],
): Promise<string[]> {
  if (indices.length === 0) return [];

  const { structured } = await import("../lib/ai/client.ts");

  const ask = async (index: number): Promise<string | null> => {
    const question = questions[index];
    const where = `q${index + 1}`;

    const body = [
      `QUESTION: ${question.stem}`,
      "",
      "OPTIONS:",
      ...question.options.map((option) => `${option.key}) ${option.text}`),
    ].join("\n");

    let verdict: SolverVerdict;

    try {
      verdict = (await structured({
        system: SOLVER_SYSTEM,
        prompt: body,
        schema: SOLVER_SCHEMA as unknown as Record<string, unknown>,
        toolName: "report_answer",
        toolDescription: "Report the answer you reached and anything wrong with the question.",
        /* Room for a working line per option before the verdict. Too small and
           the reply is truncated mid-working, which reads as a refusal. */
        maxTokens: 1500,
      })) as SolverVerdict;
    } catch (error) {
      /* A failed call is not a failed question. Say so rather than letting a
         network blip read as a clean check. */
      return `${where}: could not be second-read (${(error as Error).message}).`;
    }

    const marked = question.correct[0];

    if (verdict.unanswerable) {
      return `${where}: second reader says it cannot be answered as written — ${verdict.reason}`;
    }

    /* The fault that made this whole function worth writing. */
    const alsoCorrect = (verdict.also_correct ?? [])
      .map((key) => asKey(question, key))
      .filter((key): key is string => key !== null && key !== marked);

    if (alsoCorrect.length > 0) {
      return `${where}: option${alsoCorrect.length > 1 ? "s" : ""} ${alsoCorrect.join(", ")} may also be correct alongside ${marked} — ${verdict.reason}`;
    }

    const answered = asKey(question, verdict.answer);

    /* Asked for a key, answered with the value: "5" where the options are A-D
       and B is 5. It is right and it looks like a disagreement, and a check
       that cries wolf is a check people stop reading — the first run of this
       raised one true wrong answer and one of these, which is already a bad
       enough ratio to fix. asKey resolves it against the option text; only a
       reply that matches no option at all is reported, and reported as what it
       is rather than as a disagreement. */
    if (answered === null) {
      return `${where}: second reader replied "${verdict.answer}", which is not one of the options — read this one yourself.`;
    }

    if (answered !== marked) {
      return `${where}: marked ${marked}, second reader answered ${answered} — ${verdict.reason}`;
    }

    return null;
  };

  /* All at once. Nine small independent calls that each wait on a network
     round trip; sequentially this step alone would take longer than the
     drafting it checks. */
  const found = await Promise.all(indices.map(ask));
  return found.filter((line): line is string => line !== null);
}

async function main() {
  loadEnv();

  const chapterNo = Number(arg("chapter-no"));
  const chapterTitle = arg("chapter");
  const topicNo = Number(arg("topic-no"));
  const topicTitle = arg("topic");
  const conceptArg = arg("concept");

  const bookArg = arg("book") ?? "legacy";

  if (!chapterNo || !chapterTitle || !topicNo || !topicTitle) {
    console.error(
      "Usage: author-pack.ts --chapter-no 2 --chapter <title> --topic-no 3 --topic <title> " +
        "[--concept <name>] [--book legacy|gp]",
    );
    process.exit(1);
  }

  if (!(bookArg in BOOKS)) {
    console.error(`--book must be one of: ${Object.keys(BOOKS).join(", ")}. Got "${bookArg}".`);
    process.exit(1);
  }

  const book = BOOKS[bookArg as BookId];

  /* Named after the guard, so the title is known to exist by here. */
  const conceptTitle = conceptArg ?? topicTitle;

  if (!process.env.AI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
    console.error("Set AI_API_KEY.");
    process.exit(1);
  }

  /* Ids follow the shape already in content/: c8-math-ch2-t3-c1. They are
     permanent — questions and every recorded mistake point at them — so they
     are derived from the numbers rather than from the titles, which get
     rewritten in review. */
  const chapterId = `${book.idPrefix}-ch${chapterNo}`;
  const topicRef = `${chapterId}-t${topicNo}`;
  const conceptId = `${topicRef}-c1`;

  const slug = topicTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const conceptPath = resolve(ROOT, `drafts/.concept-${topicRef}.json`);
  mkdirSync(dirname(conceptPath), { recursive: true });

  /* The concept comes from the existing script rather than from a copy of its
     prompt here. It audits the arithmetic in the worked examples, and two
     drafters that disagree about what a concept looks like is how the corpus
     stops being one corpus. */
  console.log(`\n[1/2] Concept — "${conceptTitle}"`);

  const concept = spawnSync(
    process.execPath,
    [
      "--no-warnings",
      "--import",
      "./scripts/register-alias.mjs",
      "scripts/author-concept.ts",
      "--chapter",
      chapterTitle,
      "--topic",
      topicTitle,
      "--concept",
      conceptTitle,
      "--id",
      conceptId,
      "--topic-ref",
      topicRef,
      "--out",
      conceptPath,
    ],
    { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );

  if (concept.status !== 0) {
    console.error(concept.stdout ?? "");
    console.error(concept.stderr ?? "");
    process.exit(1);
  }

  /* The same shape author-concept.ts writes, so the assembly below cannot
     drift from what that script produces. */
  const drafted = JSON.parse(readFileSync(conceptPath, "utf8")) as Omit<
    Concept,
    "id" | "seq"
  > & { title: string };

  const ids = drafted.misconceptions.map((misconception) => misconception.id);
  console.log(`      ${ids.length} misconceptions: ${ids.join(", ")}`);

  /* --- The half that was missing ---------------------------------------- */
  console.log(`\n[2/2] Questions — built against those misconceptions`);

  const { structured } = await import("../lib/ai/client.ts");

  const brief = drafted.misconceptions
    .map((misconception) => `${misconception.id}: ${misconception.wrong_belief}`)
    .join("\n");

  /* Three small calls, not one big one.
     Asking for all eight at once produced seven questions, then eight, then
     one — same prompt, same model, three runs. A long structured response is
     where compliance goes to die, and a batch that comes back short is
     indistinguishable from one that came back wrong.

     The split also does the coverage work the repair round kept failing at:
     each batch is handed specific misconceptions to catch, so every id has a
     call whose job was to catch it. */
  const half = Math.ceil(ids.length / 2);

  const batches = [
    { count: 3, levels: "L1 and L2", catching: ids.slice(0, half) },
    { count: 3, levels: "L2 and L3", catching: ids.slice(half) },
    { count: 2, levels: "L3, and one L4", catching: ids },
  ];

  const collected: DraftQuestion[] = [];

  for (const [index, batch] of batches.entries()) {
    const catching = drafted.misconceptions
      .filter((misconception) => batch.catching.includes(misconception.id))
      .map((misconception) => `${misconception.id}: ${misconception.wrong_belief}`)
      .join("\n");

    const batchResult = (await structured({
      system: QUESTION_SYSTEM,
      prompt: `CHAPTER: ${chapterTitle}\nTOPIC: ${topicTitle}\nCONCEPT: ${conceptTitle}\n\nSTATEMENT:\n${drafted.statement}\n\nALL MISCONCEPTIONS IN THIS CONCEPT:\n${brief}\n\nWrite exactly ${batch.count} questions at ${batch.levels}.\nThese are the ones this batch must catch:\n${catching}`,
      schema: QUESTION_SCHEMA as unknown as Record<string, unknown>,
      toolName: "deliver_questions",
      toolDescription: "Return this batch of questions.",
      maxTokens: 4096,
    })) as { questions: DraftQuestion[] };

    collected.push(...normaliseMath(batchResult.questions ?? []));
    console.log(`      batch ${index + 1}/3 — ${batchResult.questions?.length ?? 0} questions`);
  }

  const result = { questions: collected };

  let questions = result.questions;
  let found = inspect(questions, ids);
  let problems = [...found.blocking, ...found.soft];

  /* One repair round, and only one.
     Nearly every first draft misses the same two things — a distractor left
     unmapped, or the correct key listed as one — and both are mechanical
     enough that naming them fixes them. A second round would be a model
     arguing with a checklist, which is where cost goes and quality does not.
     If it is still wrong after this, it needs a person, and the exit code says
     so. */
  if (problems.length > 0) {
    console.log(`      ${problems.length} problem${problems.length > 1 ? "s" : ""}, asking once for a fix…`);

    try {
      const repaired = (await structured({
        system: QUESTION_SYSTEM,
        prompt: `CHAPTER: ${chapterTitle}
TOPIC: ${topicTitle}
CONCEPT: ${conceptTitle}

MISCONCEPTIONS TO CATCH:
${brief}

YOUR PREVIOUS SET HAD THESE PROBLEMS:
${problems.map((problem) => `- ${problem}`).join("\n")}

Here it is:
${JSON.stringify(questions, null, 1)}

Return the whole set again with those problems fixed and nothing else changed.`,
        schema: QUESTION_SCHEMA as unknown as Record<string, unknown>,
        toolName: "deliver_questions",
        toolDescription: "Return the corrected question set.",
        maxTokens: 8192,
      })) as { questions: DraftQuestion[] };

      const afterFound = inspect(repaired.questions, ids);
      const after = [...afterFound.blocking, ...afterFound.soft];

      /* Kept only if it is actually better — fewer blocking problems first,
         then fewer overall. A repair that trades one problem for another is
         not a repair. */
      const better =
        afterFound.blocking.length < found.blocking.length ||
        (afterFound.blocking.length === found.blocking.length && after.length < problems.length);

      if (better) {
        questions = repaired.questions;
        found = afterFound;
        problems = after;
        console.log(`      down to ${problems.length}`);
      }
    } catch (error) {
      console.log(`      repair failed: ${(error as Error).message}`);
    }
  }

  /* After the repair, because there is no point second-reading a set that is
     about to be replaced. */
  let doubts: string[] = [];

  if (found.unchecked.length > 0) {
    console.log(
      `\n[3/3] Second read — ${found.unchecked.length} question${found.unchecked.length > 1 ? "s" : ""} substitution could not check`,
    );

    doubts = await secondReader(questions, found.unchecked);

    console.log(
      doubts.length === 0
        ? "      the second reader agreed with all of them"
        : `      ${doubts.length} to look at`,
    );
  }

  const pack: ContentFile = {
    board: "cbse",
    classLevel: 8,
    subjectId: "maths",
    provenance: {
      source: `${book.name}, Chapter ${chapterNo} "${chapterTitle}" — ${topicTitle}.`,
      verifiedOn: new Date().toISOString().slice(0, 10),
      /* Said in the file itself, because a pack that reads well is exactly the
         one somebody will assume was written by a person. */
      note: "DRAFTED BY A MODEL AND NOT YET REVIEWED. The misconceptions are plausible, not observed — a model cannot tell whether a Class 8 student really holds them, and that judgement is the whole value of this pack. Read them against your own teaching before moving this file into content/.",
    },
    subject: { id: "cbse-8-maths", name: "Mathematics", language: "en-IN" },
    chapter: {
      id: chapterId,
      no: chapterNo,
      title: chapterTitle,
      ncertRef: `${book.name}, Chapter ${chapterNo}`,
      estMinutes: 240,
      isFree: false,
    },
    topic: {
      id: topicRef,
      no: topicNo,
      title: topicTitle,
      prereqTopicIds: topicNo > 1 ? [`${chapterId}-t${topicNo - 1}`] : [],
    },
    concepts: [
      {
        id: conceptId,
        seq: 1,
        title: drafted.title,
        statement: drafted.statement,
        hook: drafted.hook,
        analogies: drafted.analogies,
        formulas: drafted.formulas,
        misconceptions: drafted.misconceptions,
        worked_examples: drafted.worked_examples,
      },
    ],
    questions: questions.map((question, index) => ({
      id: `${topicRef}-q${index + 1}`,
      conceptId,
      qtype: question.qtype,
      level: question.level,
      stem: question.stem,
      options: question.options,
      correct: question.correct,
      distractor_map: question.distractor_map,
      solution: question.solution,
    })) as ContentFile["questions"],
  };

  const out = resolve(
    ROOT,
    `drafts/cbse/class8/maths/${book.dir}${String(chapterNo).padStart(2, "0")}` +
      `/t${String(topicNo).padStart(2, "0")}-${slug}.json`,
  );
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(pack, null, 2)}\n`, "utf8");

  const issues = validateFile(pack);
  const errors = issues.filter((issue) => issue.severity === "error");

  console.log(`\n${pack.questions.length} questions, ${ids.length} misconceptions`);

  for (const problem of found.blocking) console.log(`  BLOCK  ${problem}`);
  for (const problem of found.soft) console.log(`  check  ${problem}`);
  for (const doubt of doubts) console.log(`  2nd    ${doubt}`);
  for (const issue of issues) {
    console.log(`  ${issue.severity === "error" ? "ERROR" : "warn "}  ${issue.where}: ${issue.message}`);
  }

  console.log(`\nWritten to ${out.replace(ROOT, ".")}`);

  if (errors.length > 0 || found.blocking.length > 0) {
    console.log("\nNot clean. Fix or redraft before review.");
    process.exit(1);
  }

  /* A second reader who disagrees about which option is correct is not a
   * style note, and this script printed "Clean" over one. The draft in
   * question asked which number ending in 4 is NOT a perfect square, offered
   * 4, 14, 64, 144, marked 64 — and said in its own solution line that 14 is
   * the one. Every mechanical check passed, because every mechanical check
   * was about structure.
   *
   * Separate from BLOCK because the reader can be wrong too and the two
   * deserve different reading. Same exit code, because both mean the same
   * thing: not ready. */
  if (doubts.length > 0) {
    console.log(
      `\nNot clean: the second reader disagreed on ${doubts.length} question${doubts.length > 1 ? "s" : ""}.`,
    );
    console.log("Settle those by hand — it is right often enough to be worth the minute.");
    process.exit(1);
  }

  console.log(
    "\nClean, and still a draft. A human reads the misconceptions, then moves the\nfile into content/ and runs npm run content:seed. Nothing here is live.",
  );
}

await main();
