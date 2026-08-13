/* Builds a full mock paper for one unit.

   The paper is stored so marking can read the questions back by id, the same
   guarantee the topic-question route relies on. */

import { NextResponse } from "next/server";

import { structured } from "@/lib/ai/client";
import { BOARD_CONTEXT, HOUSE_STYLE } from "@/lib/ai/style";
import { aiFailure, fail, readScope, requireStudent } from "@/lib/ai/route";
import { consume, release } from "@/lib/ai/quota";
import { scopeLine } from "@/lib/ai/scope";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 180;

const SYSTEM = `You are a senior teacher setting a board-pattern mock paper.

Build a paper that behaves like the real thing:
- Open with accessible marks and finish with the hardest question.
- Use the command words and mark allocations of the stated board.
- Total marks must match the stated duration at roughly one mark per minute.
- Every question is ORIGINAL. Never reproduce a past paper question verbatim.
- Spread coverage across the whole unit, not one favourite topic.
- Do not include answers or mark schemes in the question text.

${BOARD_CONTEXT}

${HOUSE_STYLE}`;

const SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          prompt: { type: "string" },
          marks: { type: "integer", minimum: 1, maximum: 15 },
          topic: {
            type: "string",
            description: "Which part of the unit this question tests.",
          },
        },
        required: ["prompt", "marks", "topic"],
      },
    },
  },
  required: ["title", "questions"],
} as const;

type Paper = {
  title: string;
  questions: { prompt: string; marks: number; topic: string }[];
};

const DURATIONS = [30, 60, 90] as const;

export async function POST(request: Request) {
  const user = await requireStudent();
  if (!user.ok) return user.response;

  /* Mocks are set at unit level, so no topic is required. */
  const scoped = await readScope(request, { requireTopic: false });
  if (!scoped.ok) return scoped.response;

  const { body, scope } = scoped.value;

  const supabase = await createClient();
  const slot = await consume(supabase, user.value, "mocks");
  if (!slot.ok) return fail(slot.message, slot.status);

  const minutes = DURATIONS.includes(Number(body.minutes) as 30 | 60 | 90)
    ? Number(body.minutes)
    : 60;

  let paper: Paper;
  try {
    paper = await structured<Paper>({
      system: SYSTEM,
      prompt: `Set a ${minutes}-minute mock paper for:

${scopeLine(scope)}

Target roughly ${minutes} marks in total.`,
      schema: SCHEMA as unknown as Record<string, unknown>,
      toolName: "deliver_paper",
      toolDescription: "Return the finished mock paper.",
      maxTokens: 8192,
    });
  } catch (error) {
    await release(supabase, "mocks");
    return aiFailure(error);
  }

  if (paper.questions.length === 0) {
    await release(supabase, "mocks");
    return fail("The model returned an empty paper. Try again.", 502);
  }

  const { data, error } = await supabase
    .from("generated_questions")
    .insert(
      paper.questions.map((question) => ({
        user_id: user.value,
        subject_id: String(body.subjectId),
        unit_id: String(body.unitId),
        /* Mock questions belong to the unit rather than one topic. */
        topic_id: `mock:${body.subjectId}:${body.unitId}`,
        kind: "mock",
        prompt: question.prompt,
        marks: question.marks,
        options: null,
      })),
    )
    .select("id, prompt, marks");

  if (error || !data) {
    await release(supabase, "mocks");
    return fail(
      "The paper was written but could not be saved. Run supabase/schema.sql.",
      500,
    );
  }

  return NextResponse.json({
    title: paper.title,
    scope: scopeLine(scope),
    minutes,
    quota: slot.quota,
    totalMarks: data.reduce((sum, row) => sum + (row.marks as number), 0),
    questions: data.map((row, index) => ({
      id: row.id as string,
      prompt: row.prompt as string,
      marks: row.marks as number,
      topic: paper.questions[index]?.topic ?? "",
    })),
  });
}
