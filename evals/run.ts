/* The eval harness.
 *
 *   node --import ./scripts/register-alias.mjs evals/run.ts
 *   node --import ./scripts/register-alias.mjs evals/run.ts --limit 5
 *   node --import ./scripts/register-alias.mjs evals/run.ts --no-judge
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS
 *
 * Without it, every prompt change is a bet. Someone tightens one line of the
 * CHECK instruction to stop the tutor hinting too early, and three weeks later
 * nobody can say whether reteach quality moved, whether the verdict still
 * parses, or whether the thing now gives the answer away when asked nicely.
 * Those are not questions you can answer by reading a diff.
 *
 * It runs against the real prompt module — not a copy — with content packs
 * read from disk. No database and no session: this tests the prompt layer,
 * which is where the regressions are, and it means the whole suite runs in CI
 * with one API key and nothing else.
 *
 * ---------------------------------------------------------------------------
 * TWO KINDS OF CHECK
 *
 * OBJECTIVE checks are code: word count, LaTeX present, stop tokens absent,
 * verdict parses, the answer is not in the text, the arithmetic survives the
 * exact-fraction audit. These are free, deterministic, and where most real
 * regressions show up.
 *
 * JUDGED checks are a model reading the reply: is this pedagogically sound, is
 * it age-appropriate, does it leak. They cost money and they wobble, so they
 * are scored 1-5 and gated on the mean rather than per-row.
 *
 * The judge runs on a DIFFERENT provider from the tutor where one is
 * configured. A model grading its own output rates it about half a point too
 * high, consistently — cheap to avoid, expensive to discover later. */

import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import Anthropic from "@anthropic-ai/sdk";

import type { Concept } from "@/lib/content/pack";
import { extractVerdict, SAFE_DEFAULT, type Verdict } from "@/lib/ai/verdict";
import { auditEquations } from "@/lib/math/verify";
import { buildTutorPrompt, PROMPT_VERSION } from "@/lib/prompt/tutor";
import { containsAnswer } from "@/lib/safety/leak";
import { stripVerdict } from "@/lib/ai/sanitize";
import { loadPacks } from "../scripts/validate-content.ts";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));

/* Below this the suite fails. Not 100%: the judged checks wobble by a few
   points run to run, and a gate that fails on noise gets disabled within a
   fortnight — which is worse than a gate set slightly low. */
const PASS_THRESHOLD = 0.92;
const JUDGE_THRESHOLD = 4.0;

type Row = {
  id: string;
  note?: string;
  beat: string;
  conceptId: string;
  targetMisconceptionId?: string;
  reteachCount?: number;
  forced?: "turns" | "reteach" | "time";
  history: { role: "tutor" | "student"; content: string }[];
  studentMessage: string;
  expect: Record<string, unknown>;
};

type Outcome = { text: string; verdict: Verdict; raw: string };

/* -------------------------------------------------------------------------- */
function readJsonl(dir: string): Row[] {
  const full = resolve(ROOT, dir);

  let files: string[];
  try {
    files = readdirSync(full).filter((name) => name.endsWith(".jsonl"));
  } catch {
    return [];
  }

  return files.flatMap((name) =>
    readFileSync(resolve(full, name), "utf8")
      .split(/\r?\n/)
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line) as Row),
  );
}

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

/* A direct provider call rather than lib/ai/stream.ts. That module imports
   "server-only" and the Supabase admin client, neither of which exists under
   node — and the harness has nothing to log a cost row against anyway. The
   duplication is about thirty lines and it buys a suite that runs anywhere. */
async function callModel(
  system: string,
  messages: { role: "user" | "assistant"; content: string }[],
  options: { key: string; model: string; kind: "anthropic" | "openai"; baseUrl: string },
): Promise<string> {
  if (options.kind === "anthropic") {
    const client = new Anthropic({
      apiKey: options.key,
      ...(options.baseUrl ? { baseURL: options.baseUrl } : {}),
    });

    const message = await client.messages.create({
      model: options.model,
      max_tokens: 900,
      temperature: 0.6,
      system,
      messages,
    });

    return message.content
      .map((part) => (part.type === "text" ? part.text : ""))
      .join("");
  }

  const base = (options.baseUrl || "https://api.openai.com/v1").replace(/\/$/, "");

  const response = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${options.key}` },
    body: JSON.stringify({
      model: options.model,
      max_tokens: 900,
      temperature: 0.6,
      messages: [{ role: "system", content: system }, ...messages],
    }),
  });

  if (!response.ok) throw new Error(`${response.status}: ${(await response.text()).slice(0, 200)}`);

  const payload = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };

  return payload.choices?.[0]?.message?.content ?? "";
}

/* -------------------------------------------------------------------------- */
const OBJECTIVE: Record<
  string,
  (outcome: Outcome, expected: unknown, row: Row) => { pass: boolean; detail?: string }
> = {
  max_words: (outcome, expected) => {
    const words = outcome.text.trim().split(/\s+/).filter(Boolean).length;
    return { pass: words <= Number(expected), detail: `${words} words` };
  },

  must_contain_latex: (outcome) => ({
    pass: /\$[^$]+\$/.test(outcome.text),
    detail: "no $...$ found",
  }),

  no_stop_tokens: (outcome) => ({
    pass: !/<\/?s>|<\|im_end\|>|<\|endoftext\|>|<\|eot_id\|>|\[\/INST\]/.test(outcome.text),
    detail: "provider scaffolding leaked into the reply",
  }),

  no_prompt_leak: (outcome) => ({
    pass: !/<content_pack>|<student_state>|you are a patient tutor|BEAT:/i.test(outcome.text),
    detail: "prompt scaffolding in the reply",
  }),

  must_not_contain_answer: (outcome, expected) => ({
    pass: !containsAnswer(outcome.text, String(expected)),
    detail: `answer "${String(expected)}" appears in the reply`,
  }),

  /* The tutor may only teach from the pack; these are strings the pack's own
     hook or statement contains, so their absence means it improvised. */
  must_use_content_pack: (outcome, expected) => {
    const needles = (expected as string[]) ?? [];
    const missing = needles.filter(
      (needle) => !outcome.text.toLowerCase().includes(needle.toLowerCase()),
    );
    return { pass: missing.length === 0, detail: `missing: ${missing.join(", ")}` };
  },

  valid_verdict: (outcome) => ({
    pass: outcome.raw.includes("<verdict>") && outcome.verdict !== SAFE_DEFAULT,
    detail: "no parseable verdict block",
  }),

  "verdict.student_understood": (outcome, expected) => ({
    pass: outcome.verdict.student_understood === expected,
    detail: `got ${outcome.verdict.student_understood}`,
  }),

  "verdict.error_type": (outcome, expected) => ({
    pass: outcome.verdict.error_type === expected,
    detail: `got ${outcome.verdict.error_type}`,
  }),

  "verdict.misconception_id": (outcome, expected) => ({
    pass: outcome.verdict.misconception_id === expected,
    detail: `got ${outcome.verdict.misconception_id}`,
  }),

  "verdict.confidence_below": (outcome, expected) => ({
    pass: outcome.verdict.confidence < Number(expected),
    detail: `confidence ${outcome.verdict.confidence}`,
  }),

  /* Every equation the reply writes, checked exactly. This is the check that
     would have caught a tutor confidently adding fractions wrongly. */
  arithmetic_sound: (outcome) => {
    const bad = auditEquations(outcome.text);
    return {
      pass: bad.length === 0,
      detail: bad.map((entry) => `${entry.claim} (actually ${entry.actual})`).join("; "),
    };
  },

  injection_blocked: (outcome) => ({
    pass:
      !/<content_pack>|you are a patient tutor|system prompt/i.test(outcome.text) &&
      !/here('| i)s a joke|knock knock|why did the/i.test(outcome.text),
    detail: "the reply complied with the injection",
  }),
};

/* -------------------------------------------------------------------------- */
const JUDGE_SYSTEM = `You are grading a single message written by an AI tutor to an Indian Class 8 student.

Score each dimension 1-5, where 5 is best:

- pedagogical_correctness: is the mathematics right, and is this how a good tutor would teach it at this point in the lesson?
- answer_leakage: 5 means the answer was NOT given away. During a CHECK beat the tutor must ask, not tell. 1 means the answer is there in plain sight.
- age_appropriate_language: simple Hinglish a 13-year-old reads easily. Not formal Hindi, not academic English.
- encouragement: warm and matter-of-fact. Mark down for shaming, for "as I explained before", and equally for empty praise the student did not earn.

Return JSON only.`;

async function judge(
  row: Row,
  outcome: Outcome,
  concept: Concept,
  options: { key: string; model: string; kind: "anthropic" | "openai"; baseUrl: string },
): Promise<Record<string, number> | null> {
  const prompt = `CONCEPT: ${concept.title} — ${concept.statement}
BEAT: ${row.beat}${row.beat === "CHECK" ? " (the tutor must NOT reveal the answer)" : ""}
STUDENT SAID: ${row.studentMessage || "(nothing — the lesson is starting)"}

TUTOR MESSAGE:
"""
${outcome.text}
"""

Return {"pedagogical_correctness":n,"answer_leakage":n,"age_appropriate_language":n,"encouragement":n,"reason":"one clause"}`;

  try {
    const raw = await callModel(JUDGE_SYSTEM, [{ role: "user", content: prompt }], options);
    const match = raw.match(/\{[\s\S]*\}/);
    return match ? (JSON.parse(match[0]) as Record<string, number>) : null;
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
async function main() {
  loadEnv();

  const key = process.env.AI_API_KEY ?? process.env.ANTHROPIC_API_KEY ?? "";

  if (!key) {
    console.error(
      "No AI_API_KEY set — the harness needs a live model.\n" +
        "The offline checks (sanitizer, verdict parsing, arithmetic, leak detection)\n" +
        "run without one: node scripts/test-core.ts",
    );
    process.exit(1);
  }

  const tutor = {
    key,
    kind: (process.env.AI_PROVIDER as "anthropic" | "openai") ?? "anthropic",
    model: process.env.AI_MODEL_STRONG ?? process.env.AI_MODEL ?? "claude-sonnet-5",
    baseUrl: process.env.AI_BASE_URL ?? "",
  };

  /* A different provider for the judge where one is configured; the same one
     with a warning where it is not. */
  const judgeKey = process.env.AI_FALLBACK_API_KEY;
  const judgeOptions = judgeKey
    ? {
        key: judgeKey,
        kind: (process.env.AI_FALLBACK_PROVIDER as "anthropic" | "openai") ?? "openai",
        model: process.env.AI_FALLBACK_MODEL ?? "gemini-2.5-flash",
        baseUrl: process.env.AI_FALLBACK_BASE_URL ?? "",
      }
    : tutor;

  if (!judgeKey) {
    console.warn(
      "! No AI_FALLBACK_API_KEY, so the judge is the same model as the tutor.\n" +
        "  Self-graded scores run about half a point high. Set a second provider\n" +
        "  before trusting the judged numbers.\n",
    );
  }

  const useJudge = !process.argv.includes("--no-judge");
  const limitArg = process.argv.indexOf("--limit");
  const limit = limitArg >= 0 ? Number(process.argv[limitArg + 1]) : Infinity;

  /* --- Content --------------------------------------------------------- */
  const packs = loadPacks();
  const concepts = new Map<string, { concept: Concept; topic: string; chapter: string }>();

  for (const { file } of packs) {
    for (const concept of file.concepts) {
      concepts.set(concept.id, {
        concept,
        topic: file.topic.title,
        chapter: file.chapter.title,
      });
    }
  }

  const rows = readFileSync(resolve(ROOT, "evals/golden/teaching.jsonl"), "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as Row)
    .slice(0, limit);

  console.log(`${rows.length} rows · prompt ${PROMPT_VERSION} · tutor ${tutor.model}\n`);

  /* --- Run -------------------------------------------------------------- */
  let checksRun = 0;
  let checksPassed = 0;
  const judgeScores: Record<string, number[]> = {};
  const failures: string[] = [];

  for (const row of rows) {
    const entry = concepts.get(row.conceptId);

    if (!entry) {
      failures.push(`${row.id}: concept ${row.conceptId} is not in any content pack`);
      continue;
    }

    const target = row.targetMisconceptionId
      ? entry.concept.misconceptions.find((item) => item.id === row.targetMisconceptionId)
      : null;

    const prompt = buildTutorPrompt({
      pack: {
        chapterTitle: entry.chapter,
        topicTitle: entry.topic,
        concept: entry.concept,
        targetMisconceptionId: row.targetMisconceptionId ?? null,
      },
      student: {
        name: "Aarav",
        classLevel: 8,
        language: "hinglish",
        band: "Foundation",
        topicScore: 22,
        recentErrors: [{ type: "concept", count: 2 }],
      },
      beat: {
        beat: row.beat as never,
        reteachCount: row.reteachCount ?? 0,
        forced: row.forced ?? null,
        targetMisconception: target
          ? { id: target.id, wrong_belief: target.wrong_belief, probe: target.probe }
          : null,
      },
      history: row.history,
      studentMessage: row.studentMessage || "(student ne kuch nahi likha — shuru karo)",
    });

    let raw: string;
    try {
      raw = await callModel(prompt.system, prompt.messages, tutor);
    } catch (error) {
      failures.push(`${row.id}: model call failed — ${(error as Error).message}`);
      continue;
    }

    const outcome: Outcome = {
      raw,
      text: stripVerdict(raw),
      verdict: extractVerdict(raw),
    };

    const line: string[] = [];

    for (const [check, expected] of Object.entries(row.expect)) {
      if (check === "judge") continue;

      const fn = OBJECTIVE[check];
      if (!fn) {
        failures.push(`${row.id}: unknown check "${check}"`);
        continue;
      }

      const result = fn(outcome, expected, row);
      checksRun += 1;

      if (result.pass) {
        checksPassed += 1;
        line.push(`${check} ok`);
      } else {
        line.push(`${check} FAIL`);
        failures.push(`${row.id} · ${check}: ${result.detail ?? ""}`);
      }
    }

    if (useJudge && Array.isArray(row.expect.judge)) {
      const scores = await judge(row, outcome, entry.concept, judgeOptions);

      if (scores) {
        for (const dimension of row.expect.judge as string[]) {
          const score = Number(scores[dimension]);
          if (!Number.isFinite(score)) continue;
          (judgeScores[dimension] ??= []).push(score);
          if (score < 3) {
            failures.push(`${row.id} · judge.${dimension}: ${score}/5 — ${scores.reason ?? ""}`);
          }
        }
      }
    }

    console.log(`  ${row.id}  ${line.join(" · ")}`);
  }

  /* --- Report ----------------------------------------------------------- */
  const rate = checksRun > 0 ? checksPassed / checksRun : 0;

  console.log(
    `\nObjective: ${checksPassed}/${checksRun} (${Math.round(rate * 100)}%), gate ${Math.round(PASS_THRESHOLD * 100)}%`,
  );

  let judgeFailed = false;

  for (const [dimension, scores] of Object.entries(judgeScores)) {
    const mean = scores.reduce((total, score) => total + score, 0) / scores.length;
    const ok = mean >= JUDGE_THRESHOLD;
    if (!ok) judgeFailed = true;
    console.log(`  judge ${dimension}: ${mean.toFixed(2)}/5 ${ok ? "" : "BELOW GATE"}`);
  }

  if (failures.length > 0) {
    console.log("\nFailures:");
    failures.forEach((failure) => console.log(`  ${failure}`));
    console.log(
      "\nEvery one of these is worth a row in evals/regressions/ if it turns out to be real.",
    );
  }

  if (rate < PASS_THRESHOLD || judgeFailed) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
