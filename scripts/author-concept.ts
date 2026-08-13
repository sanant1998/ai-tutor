/* Drafts a concept pack with a model, checks it, and files it for review.
 *
 *   node --import ./scripts/register-alias.mjs scripts/author-concept.ts \
 *     --chapter "Rational Numbers" \
 *     --topic "Additive Inverse" \
 *     --concept "Additive inverse" \
 *     --id c8-math-ch1-t2-c1 --topic-ref c8-math-ch1-t2
 *
 *   ... --out content/draft.json     write to a file instead of the queue
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS IS FOR, AND WHAT IT IS NOT
 *
 * Writing a concept pack properly takes 40-60 minutes. Most of that is not
 * writing — it is producing four misconceptions that real Class 8 students
 * actually hold, two worked examples whose arithmetic is right, and a hook set
 * in a world an Indian thirteen-year-old lives in.
 *
 * A model is genuinely good at the first draft of that and genuinely bad at
 * knowing whether the misconceptions are real. So this script gets a subject
 * expert to a red pen in five minutes instead of a blank page in forty. It
 * does not, and must not, produce publishable content: everything it writes
 * lands in content_drafts and a human publishes it or it never goes live.
 *
 * The arithmetic in every worked example is checked here, exactly, before a
 * reviewer sees it — catching that by eye is the slowest part of a review and
 * the easiest thing to get wrong. */

import { writeFileSync } from "node:fs";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import Anthropic from "@anthropic-ai/sdk";

import type { Concept } from "@/lib/content/pack";
import { auditEquations, evaluate, formatFraction } from "@/lib/math/verify";
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

const SYSTEM = `You are a CBSE curriculum author writing teaching material for Class 8 Mathematics, for a one-to-one tutoring app used by Indian school students.

You are writing a CONTENT PACK. It is not a lesson and not an explanation — it is the raw material a tutor will teach from, so every field has to stand on its own.

HARD REQUIREMENTS

hook
- One relatable, everyday Indian situation: money and udhaar, cricket, a lift, a bus, food, marks, a shop. Never a Western example, never an abstract one.
- Ends with a curiosity question. Never states the definition.

misconceptions — exactly 4
- These must be errors REAL Class 8 students make, not hypothetical ones. If you are inventing a plausible-sounding error rather than recalling a common one, you are doing this wrong.
- Each needs: wrong_belief (in the student's own voice), why_wrong (an explanation, not a restatement), correction (the one line worth remembering), probe (a question that surfaces exactly this error).
- Number them m1, m2, m3, m4.

worked_examples — exactly 2
- Numbered steps. Every step is a real step, not "now solve it".
- CHECK EVERY CALCULATION. A wrong sum here is worse than no example.

language
- Simple English with the Hindi words a student actually uses: matlab, socho, dekho, chalo, samajh. Not formal Hindi. Not academic English.
- All mathematics in LaTeX between $...$.

Return the pack by calling the tool. Write nothing else.`;

const SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    statement: { type: "string", description: "The crisp definition. One or two sentences." },
    hook: { type: "string" },
    analogies: {
      type: "array",
      items: {
        type: "object",
        properties: { id: { type: "string" }, text: { type: "string" } },
        required: ["id", "text"],
      },
    },
    formulas: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          latex: { type: "string" },
          note: { type: "string" },
        },
        required: ["id", "latex"],
      },
    },
    misconceptions: {
      type: "array",
      minItems: 4,
      maxItems: 4,
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          wrong_belief: { type: "string" },
          why_wrong: { type: "string" },
          correction: { type: "string" },
          probe: { type: "string" },
        },
        required: ["id", "wrong_belief", "why_wrong", "correction", "probe"],
      },
    },
    worked_examples: {
      type: "array",
      minItems: 2,
      maxItems: 2,
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          problem: { type: "string" },
          steps: { type: "array", items: { type: "string" } },
          answer: { type: "string" },
        },
        required: ["id", "problem", "steps", "answer"],
      },
    },
  },
  required: ["title", "statement", "hook", "misconceptions", "worked_examples"],
} as const;

async function main() {
  loadEnv();

  const chapter = arg("chapter");
  const topic = arg("topic");
  const conceptTitle = arg("concept");
  const conceptId = arg("id");
  const topicRef = arg("topic-ref");
  const out = arg("out");

  if (!chapter || !topic || !conceptTitle || !conceptId || !topicRef) {
    console.error(
      "Usage: author-concept.ts --chapter <c> --topic <t> --concept <name> --id <concept-id> --topic-ref <topic-id> [--out file.json]",
    );
    process.exit(1);
  }

  const key = process.env.AI_API_KEY ?? process.env.ANTHROPIC_API_KEY;
  if (!key) {
    console.error("Set AI_API_KEY.");
    process.exit(1);
  }

  /* The strong model, always. This is the one place in the product where the
     model's output becomes permanent, and saving a rupee on the draft costs a
     subject expert twenty minutes of rewriting. */
  const model = process.env.AI_MODEL_STRONG ?? process.env.AI_MODEL ?? "claude-sonnet-5";

  console.log(`Drafting "${conceptTitle}" with ${model}…\n`);

  const client = new Anthropic({
    apiKey: key,
    ...(process.env.AI_BASE_URL ? { baseURL: process.env.AI_BASE_URL } : {}),
  });

  const message = await client.messages.create({
    model,
    max_tokens: 4096,
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `CHAPTER: ${chapter}\nTOPIC: ${topic}\nCONCEPT: ${conceptTitle}\n\nWrite the content pack for this concept.`,
      },
    ],
    tools: [
      {
        name: "deliver_pack",
        description: "Return the finished content pack.",
        input_schema: SCHEMA as unknown as Anthropic.Tool.InputSchema,
      },
    ],
    tool_choice: { type: "tool", name: "deliver_pack" },
  });

  const block = message.content.find((part) => part.type === "tool_use");

  if (!block || block.type !== "tool_use") {
    console.error("The model did not return a pack.");
    process.exit(1);
  }

  const draft = block.input as Omit<Concept, "id" | "seq"> & { title: string };

  const concept: Concept & { topicRef: string } = {
    id: conceptId,
    seq: Number(arg("seq") ?? 1),
    title: draft.title ?? conceptTitle,
    statement: draft.statement,
    hook: draft.hook,
    analogies: draft.analogies ?? [],
    misconceptions: draft.misconceptions ?? [],
    worked_examples: draft.worked_examples ?? [],
    formulas: draft.formulas ?? [],
    topicRef,
  };

  /* --- Check it -------------------------------------------------------- */
  const issues = validateFile({
    board: "cbse",
    classLevel: 8,
    subjectId: "maths",
    provenance: { source: `llm draft (${model})`, verifiedOn: new Date().toISOString().slice(0, 10) },
    subject: { id: "draft", name: "Draft" },
    chapter: { id: "draft-ch", no: 1, title: chapter },
    topic: { id: topicRef, no: 1, title: topic },
    concepts: [concept],
    questions: [],
  }).filter((issue) => !issue.message.includes("No questions"));

  /* Exact arithmetic on every step of every worked example. This is the check
     worth having: it is the slowest thing for a human to do and the thing a
     model is most confidently wrong about. */
  const badMaths: string[] = [];

  for (const example of concept.worked_examples) {
    for (const step of [...example.steps, example.answer]) {
      for (const bad of auditEquations(step)) {
        badMaths.push(`${example.id}: "${bad.claim}" — actually ${bad.actual}`);
      }
    }

    /* And the stated answer against what the steps produce, where both parse. */
    const stated = evaluate(example.answer);
    const last = evaluate(example.steps[example.steps.length - 1] ?? "");

    if (stated && last && (stated.n !== last.n || stated.d !== last.d)) {
      badMaths.push(
        `${example.id}: answer ${formatFraction(stated)} does not match the last step ${formatFraction(last)}`,
      );
    }
  }

  const blocking = issues.filter((issue) => issue.severity === "error").length + badMaths.length;

  console.log(`${concept.misconceptions.length} misconceptions, ${concept.worked_examples.length} worked examples`);
  for (const issue of issues) console.log(`  ${issue.severity}  ${issue.where}: ${issue.message}`);
  for (const bad of badMaths) console.log(`  ERROR  arithmetic — ${bad}`);

  /* --- File it --------------------------------------------------------- */
  if (out) {
    writeFileSync(resolve(ROOT, out), JSON.stringify(concept, null, 2), "utf8");
    console.log(`\nWritten to ${out}.`);
  } else {
    const url = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

    console.log(`\nPOST this to ${url}/api/admin/content while signed in as an admin:\n`);
    console.log(
      JSON.stringify(
        {
          entityType: "concept",
          entityId: conceptId,
          generatedBy: `llm:${model}`,
          payload: concept,
        },
        null,
        2,
      ).slice(0, 400) + "\n  …",
    );
    console.log(
      "\nOr use --out to write a file and paste it into the console at /admin/content.",
    );
  }

  console.log(
    blocking > 0
      ? `\n${blocking} blocking problem${blocking === 1 ? "" : "s"}. Fix before review.`
      : "\nClean. Still needs a human to read the misconceptions — a model cannot tell whether a Class 8 student really believes them.",
  );

  /* Non-zero on blocking problems so this can sit in a pipeline. */
  if (blocking > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
