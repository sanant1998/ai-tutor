/* Writes a set of original exam questions for one topic.

   The questions are stored against the student before they are returned, so
   marking can look each one up by id instead of trusting question text from
   the browser. */

import { NextResponse } from "next/server";

import { structured } from "@/lib/ai/client";
import { BOARD_CONTEXT, HOUSE_STYLE } from "@/lib/ai/style";
import { LEVELS, levelSplit, type LevelId } from "@/lib/mastery";
import { aiFailure, fail, readScope, requireStudent } from "@/lib/ai/route";
import { consume, release } from "@/lib/ai/quota";
import { scopeLine } from "@/lib/ai/scope";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
/* Generation takes a while on a ten-question set. */
export const maxDuration = 120;

const KINDS = ["short", "long", "mcq", "calculation"] as const;
const DIFFICULTIES = ["foundation", "standard", "stretch"] as const;

type Kind = (typeof KINDS)[number];
type Difficulty = (typeof DIFFICULTIES)[number];

const KIND_BRIEF: Record<Kind, string> = {
  short: "short-answer questions worth 1–3 marks each",
  long: "extended-response questions worth 4–6 marks each",
  mcq: "multiple-choice questions worth 1 mark each, with exactly four options",
  calculation: "calculation questions worth 2–5 marks each that require working",
};

const DIFFICULTY_BRIEF: Record<Difficulty, string> = {
  foundation: "grade C/D level — testing recall and single-step application",
  standard: "grade B/A level — typical of the middle of a real paper",
  stretch: "grade A* level — multi-step, synoptic, the hardest on the paper",
};

const SYSTEM = `You are an experienced teacher writing practice questions for a revision app.

Rules:
- Write ORIGINAL questions. Never reproduce a real past paper question verbatim.
- Match the question style, mark allocation and language of the stated board.
- Stay strictly inside the stated chapter. Do not drift into other chapters.
- Mark totals must be realistic for the question asked.
- For multiple choice, give exactly four options, with exactly one correct, and
  make the distractors reflect common student errors rather than nonsense.
- Do not include answers, mark schemes or hints in the question text.

${BOARD_CONTEXT}

${HOUSE_STYLE}`;

const SCHEMA = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          prompt: {
            type: "string",
            description: "The question as it would appear on the paper.",
          },
          marks: { type: "integer", minimum: 1, maximum: 12 },
          level: {
            type: "string",
            enum: ["L1", "L2", "L3", "L4"],
            description: "Which band this question sits in.",
          },
          options: {
            type: "array",
            items: { type: "string" },
            description: "Exactly four options for multiple choice; omit otherwise.",
          },
        },
        required: ["prompt", "marks", "level"],
      },
    },
  },
  required: ["questions"],
} as const;

type Generated = {
  questions: { prompt: string; marks: number; level: LevelId; options?: string[] }[];
};

export async function POST(request: Request) {
  const user = await requireStudent();
  if (!user.ok) return user.response;

  const scoped = await readScope(request);
  if (!scoped.ok) return scoped.response;

  const { body, scope } = scoped.value;

  const supabase = await createClient();
  const slot = await consume(supabase, user.value, "questions");
  if (!slot.ok) return fail(slot.message, slot.status);

  const kind = KINDS.includes(body.type as Kind) ? (body.type as Kind) : "short";
  const difficulty = DIFFICULTIES.includes(body.difficulty as Difficulty)
    ? (body.difficulty as Difficulty)
    : "standard";

  const count = Math.min(
    20,
    Math.max(4, Number.isFinite(body.count) ? Number(body.count) : 20),
  );

  /* A set is a ladder across the four bands, not a flat pile at one
     difficulty. The split is computed here so the prompt and the stored rows
     agree on how many of each there should be.
   *
   * The chosen difficulty moves where that ladder sits. It used to be read,
   * validated and then dropped on the floor — the dropdown in QuestionsView
   * sent it, nothing consumed it, and a student picking "stretch" got exactly
   * the same set as one picking "foundation". */
  const split = levelSplit(count, difficulty);

  let generated: Generated;
  try {
    generated = await structured<Generated>({
      system: SYSTEM,
      prompt: `Write ${count} ${KIND_BRIEF[kind]} for:

${scopeLine(scope)}

Overall difficulty: ${DIFFICULTY_BRIEF[difficulty]}.

Build the set as a ladder, not a flat pile. Every question sits in one of four
bands, and you must produce exactly this many of each:

${LEVELS.map((level) => `${level.id} ${level.name} — ${split[level.id]} question${split[level.id] === 1 ? "" : "s"}: ${level.brief}`).join("\n")}

Order the set L1 first through to L4 last, and tag each question with its band.
A student should feel the floor rise under them, not fall off a cliff.`,
      schema: SCHEMA as unknown as Record<string, unknown>,
      toolName: "deliver_questions",
      toolDescription: "Return the finished question set.",
      maxTokens: 4096,
    });
  } catch (error) {
    await release(supabase, "questions");
    return aiFailure(error);
  }

  const rows = generated.questions.slice(0, count).map((question) => ({
    user_id: user.value,
    subject_id: String(body.subjectId),
    unit_id: String(body.unitId),
    topic_id: scope.topicId,
    kind,
    level: question.level ?? "L2",
    board_id: String(body.boardId ?? ""),
    class_level: Number(body.classLevel ?? 0),
    prompt: question.prompt,
    marks: question.marks,
    options: kind === "mcq" ? (question.options ?? null) : null,
  }));

  if (rows.length === 0) {
    await release(supabase, "questions");
    return fail("The model returned an empty set. Try again.", 502);
  }

  const { data, error } = await supabase
    .from("generated_questions")
    .insert(rows)
    .select("id, prompt, marks, options, kind, level");

  if (error || !data) {
    await release(supabase, "questions");
    return fail(
      "Questions were written but could not be saved. Run supabase/schema.sql.",
      500,
    );
  }

  return NextResponse.json({
    scope: scopeLine(scope),
    quota: slot.quota,
    questions: data.map((row) => ({
      id: row.id as string,
      prompt: row.prompt as string,
      marks: row.marks as number,
      kind: row.kind as Kind,
      level: (row.level as LevelId) ?? "L2",
      options: (row.options as string[] | null) ?? undefined,
    })),
  });
}
