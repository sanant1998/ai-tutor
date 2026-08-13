/* Answers one question from the exam-FAQ bank.

   The client sends only a question id; the prompt itself is read from the
   catalogue, so this route cannot be handed arbitrary text to answer.

   These answers are written by the model, not lifted from a published mark
   scheme. The page says so, because the difference matters in an exam. */

import { NextResponse } from "next/server";

import { structured } from "@/lib/ai/client";
import { BOARD_CONTEXT, HOUSE_STYLE } from "@/lib/ai/style";
import { aiFailure, fail, requireStudent } from "@/lib/ai/route";
import { consume, release } from "@/lib/ai/quota";
import { createClient } from "@/lib/supabase/server";
import { EXAM_BOARDS } from "@/lib/onboarding";
import { EXAM_FAQ_GROUPS } from "@/lib/examFaqs";

export const runtime = "nodejs";
export const maxDuration = 60;

const SYSTEM = `You are an examiner writing the answer that earns full marks on a commonly-asked exam question.

Write the answer the mark scheme rewards:
- Use the technical phrasing examiners require. Precision beats fluency.
- Give the marking points separately, one per mark.
- Name the single mistake students most often make on this question.

Keep it tight. This is a revision card, not an essay.

${BOARD_CONTEXT}

${HOUSE_STYLE}`;

const SCHEMA = {
  type: "object",
  properties: {
    answer: {
      type: "string",
      description: "The full-mark answer, in the phrasing examiners expect.",
    },
    markingPoints: {
      type: "array",
      items: { type: "string" },
      description: "One entry per mark.",
    },
    commonMistake: {
      type: "string",
      description: "The error that most often costs students the marks here.",
    },
  },
  required: ["answer", "markingPoints", "commonMistake"],
} as const;

type Answer = {
  answer: string;
  markingPoints: string[];
  commonMistake: string;
};

export async function POST(request: Request) {
  const user = await requireStudent();
  if (!user.ok) return user.response;

  let body: { questionId?: unknown; boardId?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return fail("Expected a JSON body.", 400);
  }

  const questionId = typeof body.questionId === "string" ? body.questionId : "";

  const group = EXAM_FAQ_GROUPS.find((entry) =>
    entry.questions.some((question) => question.id === questionId),
  );
  const question = group?.questions.find((entry) => entry.id === questionId);

  if (!group || !question) return fail("No such question.", 404);

  const board = EXAM_BOARDS.find((entry) => entry.id === body.boardId);

  const supabase = await createClient();
  const slot = await consume(supabase, user.value, "faqs");
  if (!slot.ok) return fail(slot.message, slot.status);

  try {
    const result = await structured<Answer>({
      system: SYSTEM,
      prompt: `Board: ${board?.name ?? "Edexcel IAL"}
Subject: ${group.subject}
Topic: ${group.topic}

Question: ${question.prompt}`,
      schema: SCHEMA as unknown as Record<string, unknown>,
      toolName: "deliver_answer",
      toolDescription: "Return the model answer and its marking points.",
      maxTokens: 1200,
    });

    return NextResponse.json(result);
  } catch (error) {
    await release(supabase, "faqs");
    return aiFailure(error);
  }
}
