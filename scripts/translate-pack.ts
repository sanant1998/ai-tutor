/* Translates the PROSE in a content pack, and nothing else.
 *
 *   node --import ./scripts/register-alias.mjs scripts/translate-pack.ts \
 *     content/cbse/class8/maths/ch01/t02-additive-inverse.json
 *
 *   ... --to en-IN     target language (default en-IN)
 *   ... --check        translate and verify, write nothing
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS NOT A FIND AND REPLACE, AND NOT A WHOLE-FILE PROMPT
 *
 * A content pack is curriculum. Its prose is Hinglish and needs translating;
 * everything around that prose must come out the other side byte for byte.
 *
 * Hand the whole JSON to a model and it will helpfully renumber a
 * misconception, round 0.6667, or decide a distractor maps to a different
 * belief. None of that fails loudly — it fails as a question whose stored
 * answer no longer matches its own stem, months later, on a student's screen.
 *
 * So this sends a flat list of strings and reassembles the file itself. Ids,
 * levels, marks, `correct`, `distractor_map`, option keys and every number are
 * never in the payload — they cannot change because they are never sent.
 *
 * ---------------------------------------------------------------------------
 * THE MATHEMATICS IS NEVER SENT EITHER, AND THAT TOOK TWO GOES
 *
 * The first version sent the LaTeX and checked it came back intact. It did
 * not. The model answers as JSON, and `\frac` inside a JSON string is an
 * escape — `\f` is a form feed. `$\frac{2}{3}$` came back as `$rac{2}{3}$`;
 * `\times` came back as a literal tab. Four of seven packs were corrupted on
 * the first run, and no amount of "copy it exactly" fixes it, because the
 * damage happens in transport after the model has done as it was told.
 *
 * So every `$...$` span is swapped for a placeholder before sending and put
 * back afterwards FROM THE ORIGINAL. The mathematics is unchanged by
 * construction.
 *
 * That leaves one failure mode: a model that ignores the placeholders and
 * writes the equation out itself from context. It cannot be corrected, but it
 * can be detected exactly — the input contains no dollar sign, so a dollar
 * sign in the output means invented mathematics. Those strings are asked for
 * again alone, and anything still wrong is LEFT IN HINGLISH and reported. A
 * pack that is mostly English with two untranslated solutions is usable and
 * honest. A pack with two corrupted equations is neither.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT STILL DOES NOT DO
 *
 * Judge whether the translated misconception is one a real Class 8 student
 * holds. That was true of the Hinglish original too — a human wrote it and a
 * human should read the diff — but it is worth saying plainly: this changes
 * the words a child is taught with, and the git diff is the review. */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateFile } from "@/lib/content/validate";
import type { ContentFile } from "@/lib/content/pack";

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
      /* Not there. */
    }
  }
}

const arg = (name: string, fallback = "") => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
};

/* Every field that is prose, and no field that is not.
 *
 * Written as explicit paths rather than "translate any string": the second one
 * sweeps up ids, LaTeX-only formula bodies and option keys, and the whole
 * point of this script is that those never leave the file. */
type Slot = { get: () => string; set: (value: string) => void; where: string };

function slotsOf(pack: ContentFile): Slot[] {
  const slots: Slot[] = [];
  const add = (where: string, get: () => string, set: (v: string) => void) => {
    const current = get();
    if (typeof current === "string" && current.trim()) slots.push({ get, set, where });
  };

  add("chapter.title", () => pack.chapter.title, (v) => (pack.chapter.title = v));
  add("topic.title", () => pack.topic.title, (v) => (pack.topic.title = v));

  pack.concepts.forEach((concept, ci) => {
    const at = `concepts[${ci}]`;

    add(`${at}.title`, () => concept.title, (v) => (concept.title = v));
    add(`${at}.statement`, () => concept.statement, (v) => (concept.statement = v));
    add(`${at}.hook`, () => concept.hook ?? "", (v) => (concept.hook = v));

    (concept.analogies ?? []).forEach((analogy, i) =>
      add(`${at}.analogies[${i}].text`, () => analogy.text, (v) => (analogy.text = v)),
    );

    /* `latex` is deliberately absent — a formula body is mathematics. Only the
       note beside it is prose. */
    (concept.formulas ?? []).forEach((formula, i) =>
      add(`${at}.formulas[${i}].note`, () => formula.note ?? "", (v) => (formula.note = v)),
    );

    (concept.misconceptions ?? []).forEach((m, i) => {
      const w = `${at}.misconceptions[${i}]`;
      add(`${w}.wrong_belief`, () => m.wrong_belief, (v) => (m.wrong_belief = v));
      add(`${w}.why_wrong`, () => m.why_wrong, (v) => (m.why_wrong = v));
      add(`${w}.correction`, () => m.correction, (v) => (m.correction = v));
      add(`${w}.probe`, () => m.probe, (v) => (m.probe = v));
    });

    (concept.worked_examples ?? []).forEach((example, i) => {
      const w = `${at}.worked_examples[${i}]`;
      add(`${w}.problem`, () => example.problem, (v) => (example.problem = v));
      example.steps.forEach((_, si) =>
        add(`${w}.steps[${si}]`, () => example.steps[si], (v) => (example.steps[si] = v)),
      );
      /* `answer` is a value, not a sentence. Left alone. */
    });
  });

  pack.questions.forEach((question, qi) => {
    const at = `questions[${qi}]`;

    add(`${at}.stem`, () => question.stem, (v) => (question.stem = v));
    add(`${at}.solution`, () => question.solution ?? "", (v) => (question.solution = v));

    /* Option TEXT is prose; option KEY is the answer. Only the first is sent. */
    (question.options ?? []).forEach((option, i) =>
      add(`${at}.options[${i}].text`, () => option.text, (v) => (option.text = v)),
    );
  });

  return slots;
}

/* Every $...$ span, sorted. The mathematics, as a multiset. */
function mathsOf(text: string): string[] {
  return (text.match(/\$[^$]*\$/g) ?? []).sort();
}

/* The placeholder has to survive translation intact, which rules out anything
   a model might localise, punctuate or space differently. Double angle
   brackets around a bare index are ASCII, meaningless in every language, and
   visibly not prose. */
const PLACEHOLDER = /<<M(\d+)>>/g;

function mask(text: string): { masked: string; spans: string[] } {
  const spans: string[] = [];

  const masked = text.replace(/\$[^$]*\$/g, (span) => {
    spans.push(span);
    return `<<M${spans.length - 1}>>`;
  });

  return { masked, spans };
}

function unmask(masked: string, spans: string[]): { text: string; missing: number[] } {
  const seen = new Set<number>();

  const text = masked.replace(PLACEHOLDER, (whole, index) => {
    const n = Number(index);
    if (!Number.isInteger(n) || n < 0 || n >= spans.length) return whole;
    seen.add(n);
    return spans[n];
  });

  const missing = spans.map((_, i) => i).filter((i) => !seen.has(i));
  return { text, missing };
}

const SYSTEM = `You translate Indian school curriculum material into the target language.

RULES, IN ORDER OF IMPORTANCE

1. Placeholders like <<M0>>, <<M1>> stand for mathematics that has been removed.
   Reproduce every one EXACTLY as written and keep every one that was in the
   source — same count, same spelling. Move them if the target language needs a
   different word order; never translate, renumber, split, merge or drop one.
2. NEVER write a dollar sign. There is no mathematics in what you are given,
   only placeholders. A dollar sign in your answer means you invented an
   equation, and the answer will be thrown away.
3. Never change a number, a name, a currency amount or a unit.
4. Keep the mathematical vocabulary a student meets in their exam in English —
   additive inverse, rational number, distributive law — because those are the
   words on their paper.
5. A misconception is a real error a real child makes, written in the child's
   own voice. Translate the BELIEF, not the words. It must still sound like a
   thirteen-year-old saying what they wrongly think.
6. Keep the register: warm, plain, spoken. Short sentences. Not academic.
7. Keep Indian context as it is — rupees, cricket, a shop, a bus. Do not
   relocate an example to another country.

You are given a numbered list of strings. Return the same count, in the same
order, translated. Return nothing else.`;

const SCHEMA = {
  type: "object",
  properties: {
    translations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          index: { type: "number" },
          text: { type: "string" },
        },
        required: ["index", "text"],
      },
    },
  },
  required: ["translations"],
} as const;

const TARGETS: Record<string, string> = {
  "en-IN": "Indian English — plain, warm, simple. No Hindi words at all.",
  hinglish: "Hinglish — simple English with the Hindi words a student actually uses, Latin script.",
  "hi-IN": "Everyday spoken Hindi in Devanagari, not textbook Hindi.",
};

type Translation = { index: number; text: string };

async function main() {
  loadEnv();

  const file = process.argv[2];
  const to = arg("to", "en-IN");
  const checkOnly = process.argv.includes("--check");

  if (!file || file.startsWith("--")) {
    console.error("Usage: translate-pack.ts <content/pack.json> [--to en-IN] [--check]");
    process.exit(1);
  }

  if (!TARGETS[to]) {
    console.error(`Unknown target "${to}". One of: ${Object.keys(TARGETS).join(", ")}`);
    process.exit(1);
  }

  const path = resolve(ROOT, file);
  const original = readFileSync(path, "utf8");
  const pack = JSON.parse(original) as ContentFile;

  const slots = slotsOf(pack);
  const before = slots.map((slot) => slot.get());
  const masked = before.map((text) => mask(text));

  /* Imported here, not at the top of the file. lib/ai/client.ts reads
     AI_API_KEY at module scope, which is correct inside Next — the framework
     loads .env before any module — and wrong in a script, where loadEnv()
     above is what puts it there. scripts/author-concept.ts does the same. */
  const { structured } = await import("@/lib/ai/client");

  const model = process.env.AI_MODEL_STRONG ?? process.env.AI_MODEL;
  console.log(`${file}\n  ${slots.length} strings - ${to} - ${model}`);

  const ask = async (items: { index: number; masked: string }[]) => {
    const body = items.map((item) => `${item.index}. ${item.masked}`).join("\n\n");

    const result = await structured<{ translations: Translation[] }>({
      system: SYSTEM,
      prompt: `TARGET LANGUAGE: ${TARGETS[to]}\n\nTranslate these ${items.length} strings:\n\n${body}`,
      schema: SCHEMA as unknown as Record<string, unknown>,
      toolName: "deliver_translations",
      toolDescription: "Return every string translated, in order.",
      maxTokens: 16000,
      model,
    });

    return new Map(result.translations.map((t) => [t.index, t.text]));
  };

  const wanted = masked.map((m, index) => ({ index, masked: m.masked }));
  const byIndex = await ask(wanted);

  /* Usable means: something came back, it has no dollar sign, and every
     placeholder it was given is still in it. */
  const usable = (index: number) => {
    const got = byIndex.get(index);
    if (typeof got !== "string" || !got.trim()) return false;
    if (got.includes("$")) return false;
    return unmask(got, masked[index].spans).missing.length === 0;
  };

  const suspect = wanted.filter(({ index }) => !usable(index));

  if (suspect.length > 0) {
    console.log(`  ${suspect.length} came back unusable - asking again, one at a time`);

    for (const item of suspect) {
      try {
        const retry = await ask([item]);
        const got = retry.get(item.index);
        if (typeof got === "string") byIndex.set(item.index, got);
      } catch {
        /* Leave whatever was there; the check below decides. */
      }

      if (!usable(item.index)) byIndex.delete(item.index);
    }
  }

  /* --- Reassemble, proving it as we go --------------------------------- */
  const problems: string[] = [];
  const untranslated: string[] = [];

  slots.forEach((slot, i) => {
    if (!byIndex.has(i)) {
      untranslated.push(slot.where);
      return;
    }

    /* Restored from the ORIGINAL spans, never from anything the model sent. */
    const restored = unmask(byIndex.get(i)!, masked[i].spans);

    /* Cannot fire given `usable`, and kept because the day it does is the day
       something upstream changed. */
    const was = mathsOf(before[i]);
    const now = mathsOf(restored.text);

    if (was.join(" ") !== now.join(" ")) {
      problems.push(`${slot.where}: the mathematics changed`);
      return;
    }

    slot.set(restored.text);
  });

  if (problems.length > 0) {
    console.error(`\n  ${problems.length} problem(s) - nothing written:\n`);
    for (const problem of problems) console.error(`    ${problem}`);
    process.exit(1);
  }

  /* Shape: same ids, same counts, same everything that is not prose. */
  if (shape(JSON.parse(original) as ContentFile) !== shape(pack)) {
    console.error("\n  The file's shape changed. Nothing written.");
    process.exit(1);
  }

  /* And the validator the build runs. */
  const issues = validateFile(pack).filter((issue) => issue.severity === "error");

  if (issues.length > 0) {
    console.error(`\n  ${issues.length} validation error(s) - nothing written:\n`);
    for (const issue of issues) console.error(`    ${issue.where}: ${issue.message}`);
    process.exit(1);
  }

  const done = slots.length - untranslated.length;

  /* Provenance records that the words are no longer the ones a human wrote. */
  pack.provenance.note =
    `${pack.provenance.note ? `${pack.provenance.note} ` : ""}` +
    `Prose translated to ${to} by scripts/translate-pack.ts using ${model} ` +
    `(${done} of ${slots.length} strings); LaTeX, answers and distractor maps ` +
    `unchanged by construction. Not read by a subject expert since.`;

  if (untranslated.length > 0) {
    console.log(`  ${untranslated.length} left in the original language:`);
    for (const where of untranslated) console.log(`      ${where}`);
  }

  if (checkOnly) {
    console.log(`  ok - ${done}/${slots.length} translated, maths and shape intact. Nothing written (--check).`);
    return;
  }

  writeFileSync(path, `${JSON.stringify(pack, null, 2)}\n`, "utf8");
  console.log(`  written - ${done}/${slots.length}.`);
}

/* A fingerprint of everything that is NOT prose. */
function shape(pack: ContentFile): string {
  return JSON.stringify({
    board: pack.board,
    classLevel: pack.classLevel,
    subjectId: pack.subjectId,
    chapter: { id: pack.chapter.id, no: pack.chapter.no, isFree: pack.chapter.isFree },
    topic: { id: pack.topic.id, no: pack.topic.no, prereq: pack.topic.prereqTopicIds },
    concepts: pack.concepts.map((c) => ({
      id: c.id,
      seq: c.seq,
      analogies: (c.analogies ?? []).map((a) => a.id),
      formulas: (c.formulas ?? []).map((f) => [f.id, f.latex]),
      misconceptions: (c.misconceptions ?? []).map((m) => m.id),
      examples: (c.worked_examples ?? []).map((w) => [w.id, w.answer, w.steps.length]),
    })),
    questions: pack.questions.map((q) => ({
      id: q.id,
      conceptId: q.conceptId,
      qtype: q.qtype,
      level: q.level,
      marks: q.marks,
      correct: q.correct,
      distractors: q.distractor_map,
      options: (q.options ?? []).map((o) => o.key),
    })),
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
