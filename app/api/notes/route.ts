/* Writes revision notes for one topic.

   Notes are not stored: they are cheap to regenerate, and a stale copy of a
   topic a student has since re-picked is worse than a fresh one. */

import { NextResponse } from "next/server";

import { structured } from "@/lib/ai/client";
import { BOARD_CONTEXT, HOUSE_STYLE } from "@/lib/ai/style";
import { aiFailure, fail, readScope, requireUser } from "@/lib/ai/route";
import { consume, release } from "@/lib/ai/quota";
import { scopeLine } from "@/lib/ai/scope";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 120;

const SYSTEM = `You are a subject teacher writing the revision notes you would hand a student the week before their exam.

Write for recall, not for reading:
- Lead with what the exam actually asks for on this topic.
- Definitions must be in the phrasing the mark scheme expects.
- Every formula gets its symbols named and its units given.
- Worked examples show the steps a student must write to earn the marks.
- Say plainly where students lose marks on this topic.

No filler, no motivational padding, no restating the topic name back. If a
subtopic is not examinable on the stated board, leave it out.

${BOARD_CONTEXT}

${HOUSE_STYLE}`;

const SCHEMA = {
  type: "object",
  properties: {
    summary: {
      type: "string",
      description: "Two sentences on what this topic is and why it is examined.",
    },
    sections: {
      type: "array",
      items: {
        type: "object",
        properties: {
          heading: { type: "string" },
          points: {
            type: "array",
            items: { type: "string" },
            description: "Tight, self-contained revision points.",
          },
        },
        required: ["heading", "points"],
      },
    },
    formulae: {
      type: "array",
      items: {
        type: "object",
        properties: {
          expression: { type: "string" },
          meaning: {
            type: "string",
            description: "What each symbol is, with units.",
          },
        },
        required: ["expression", "meaning"],
      },
    },
    workedExample: {
      type: "object",
      properties: {
        question: { type: "string" },
        steps: { type: "array", items: { type: "string" } },
        answer: { type: "string" },
      },
      required: ["question", "steps", "answer"],
    },
    examinerTips: {
      type: "array",
      items: { type: "string" },
      description: "Where marks are actually lost on this topic.",
    },
  },
  required: ["summary", "sections", "workedExample", "examinerTips"],
} as const;

export type Notes = {
  summary: string;
  sections: { heading: string; points: string[] }[];
  formulae?: { expression: string; meaning: string }[];
  workedExample: { question: string; steps: string[]; answer: string };
  examinerTips: string[];
};

export async function POST(request: Request) {
  const user = await requireUser();
  if (!user.ok) return user.response;

  const scoped = await readScope(request);
  if (!scoped.ok) return scoped.response;

  const { scope } = scoped.value;

  const supabase = await createClient();
  const slot = await consume(supabase, user.value, "notes");
  if (!slot.ok) return fail(slot.message, slot.status);

  try {
    const notes = await structured<Notes>({
      system: SYSTEM,
      prompt: `Write revision notes for:

${scopeLine(scope)}

Cover only what this board examines on this topic.`,
      schema: SCHEMA as unknown as Record<string, unknown>,
      toolName: "deliver_notes",
      toolDescription: "Return the finished revision notes.",
      maxTokens: 4096,
    });

    return NextResponse.json({ scope: scopeLine(scope), notes, quota: slot.quota });
  } catch (error) {
    await release(supabase, "notes");
    return aiFailure(error);
  }
}
