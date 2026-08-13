/* The fix sheet: practice built from what this student actually gets wrong.

   Every other layer produces questions about a chapter. This one produces
   questions about a *weakness*. It reads the student's own classified
   mistakes, finds the pattern, and writes practice aimed only at that.

   The weaknesses are read from the attempts table — rows written server-side
   during marking — so a browser cannot ask for a flattering diagnosis. */

import { NextResponse } from "next/server";

import { structured } from "@/lib/ai/client";
import { consume, release } from "@/lib/ai/quota";
import { aiFailure, fail, requireStudent } from "@/lib/ai/route";
import { BOARD_CONTEXT, HOUSE_STYLE } from "@/lib/ai/style";
import { errorKind, readinessFor, type Attempt, type ErrorType } from "@/lib/mastery";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 180;

const SYSTEM = `You are a teacher building a correction sheet for one student.

You are not writing general practice on a chapter. You are writing practice
against a diagnosis. The student's mistakes have already been classified, and
each kind needs a different sheet:

- concept: do not drill. Re-explain the idea from a different angle first, then
  give one gentle question that cannot be answered without understanding it.
- formula: short, repetitive questions where the formula must be written and
  used correctly. Volume matters more than variety here.
- application: questions that look different from each other but need the same
  method, so the student learns to recognise it rather than pattern-match.
- calculation: the same method with messier numbers, so accuracy is what is
  being tested rather than choice of method.
- careless: questions engineered so a sign, a unit or a misread value changes
  the answer, so the slip shows up immediately.
- incomplete: questions where the marks are explicitly for stating steps,
  units and conclusions, so the student practises writing the full answer.

Write to the student directly, and be specific about their pattern. "You have
lost marks three times to the same rearrangement" is worth more than "practise
more".

Never be discouraging. A fix sheet exists because these marks are winnable.

${BOARD_CONTEXT}

${HOUSE_STYLE}`;

const SCHEMA = {
  type: "object",
  properties: {
    diagnosis: {
      type: "string",
      description:
        "Two or three sentences to the student naming the pattern across their mistakes, not each mistake in turn.",
    },
    priority: {
      type: "string",
      description: "The single thing to fix first, in one sentence.",
    },
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          prompt: { type: "string" },
          marks: { type: "integer", minimum: 1, maximum: 8 },
          targets: {
            type: "string",
            description: "Which weakness this question is aimed at.",
          },
          watchFor: {
            type: "string",
            description:
              "The specific trap in this question, told to the student before they start.",
          },
        },
        required: ["prompt", "marks", "targets", "watchFor"],
      },
    },
  },
  required: ["diagnosis", "priority", "questions"],
} as const;

type FixSheet = {
  diagnosis: string;
  priority: string;
  questions: {
    prompt: string;
    marks: number;
    targets: string;
    watchFor: string;
  }[];
};

export async function POST(request: Request) {
  const user = await requireStudent();
  if (!user.ok) return user.response;

  let body: { subjectId?: unknown; chapterId?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return fail("Expected a JSON body.", 400);
  }

  const subjectId = typeof body.subjectId === "string" ? body.subjectId : "";
  const chapterId = typeof body.chapterId === "string" ? body.chapterId : "";

  const supabase = await createClient();

  /* The diagnosis comes from rows this server wrote, never from the request.
     Scoped to a chapter when one is named, otherwise across everything. */
  let query = supabase
    .from("attempts")
    .select("chapter_id, subject_id, level, correct, error_type, question_id, created_at")
    .eq("user_id", user.value)
    .neq("error_type", "none")
    .order("created_at", { ascending: false })
    .limit(40);

  if (subjectId) query = query.eq("subject_id", subjectId);
  if (chapterId) query = query.eq("chapter_id", chapterId);

  const { data: rows, error } = await query;

  if (error) {
    return fail(
      "Your attempt history is not set up yet. Run supabase/schema.sql.",
      500,
    );
  }

  if (!rows || rows.length === 0) {
    return fail(
      "Nothing to fix yet — answer some questions first and this builds itself from what you get wrong.",
      422,
    );
  }

  /* Count the kinds, so the sheet is aimed at the pattern rather than the most
     recent single mistake. */
  const counts = new Map<ErrorType, number>();
  for (const row of rows) {
    const type = row.error_type as ErrorType;
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }

  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const dominant = ranked[0][0];

  /* The questions the student actually got wrong, so the sheet can echo them
     rather than inventing a weakness that was never demonstrated. */
  const wrongIds = rows
    .map((row) => row.question_id as string | null)
    .filter(Boolean)
    .slice(0, 12) as string[];

  const { data: wrongQuestions } = await supabase
    .from("generated_questions")
    .select("prompt, level")
    .in("id", wrongIds)
    .eq("user_id", user.value);

  const slot = await consume(supabase, user.value, "questions");
  if (!slot.ok) return fail(slot.message, slot.status);

  const attempts: Attempt[] = rows.map((row) => ({
    chapterId: row.chapter_id as string,
    level: row.level as Attempt["level"],
    correct: row.correct as boolean,
    errorType: row.error_type as ErrorType,
    date: String(row.created_at).slice(0, 10),
  }));

  const readiness = readinessFor([...attempts].reverse());

  const breakdown = ranked
    .map(([type, count]) => `${errorKind(type).name}: ${count} time${count === 1 ? "" : "s"}`)
    .join("\n");

  const missed = (wrongQuestions ?? [])
    .map((row) => `- [${row.level}] ${row.prompt as string}`)
    .join("\n");

  let sheet: FixSheet;
  try {
    sheet = await structured<FixSheet>({
      system: SYSTEM,
      prompt: `This student's classified mistakes, most recent first:

${breakdown}

Their dominant weakness is: ${errorKind(dominant).name} — ${errorKind(dominant).definition}

Questions they actually got wrong:
${missed || "(the questions themselves are no longer on record)"}

Readiness on this material is ${readiness.score} out of 100 (${readiness.band}).

Write a fix sheet of 6 questions aimed at the dominant weakness, with one or
two covering the next most common one. Match the level of the questions they
missed — do not drop to easy questions to make them feel better.`,
      schema: SCHEMA as unknown as Record<string, unknown>,
      toolName: "deliver_fix_sheet",
      toolDescription: "Return the diagnosis and the targeted practice.",
      maxTokens: 4096,
    });
  } catch (aiError) {
    await release(supabase, "questions");
    return aiFailure(aiError);
  }

  return NextResponse.json({
    diagnosis: sheet.diagnosis,
    priority: sheet.priority,
    dominant: {
      id: dominant,
      name: errorKind(dominant).name,
      fix: errorKind(dominant).fix,
      sendsBackTo: errorKind(dominant).sendsBackTo,
    },
    breakdown: ranked.map(([type, count]) => ({
      id: type,
      name: errorKind(type).name,
      count,
    })),
    readiness,
    questions: sheet.questions,
    quota: slot.quota,
  });
}
