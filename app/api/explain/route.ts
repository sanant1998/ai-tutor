/* The narrated explainer for one topic: a diagram, plus the script that talks
   a student through it.

   Narration comes back as steps rather than one block of prose, because the
   player highlights the step it is currently reading. One call produces both,
   so the diagram and the words about it can never describe different things.

   Cached per student: reopening a topic costs nothing. */

import { NextResponse } from "next/server";

import { structured } from "@/lib/ai/client";
import { consume, release } from "@/lib/ai/quota";
import { aiFailure, fail, readScope, requireStudent } from "@/lib/ai/route";
import { scopeLine } from "@/lib/ai/scope";
import { BOARD_CONTEXT, HOUSE_STYLE } from "@/lib/ai/style";
import { sanitiseSvg } from "@/lib/ai/svg";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 180;

const SYSTEM = `You are a teacher explaining one topic at the whiteboard to a student who is revising.

Work strictly in the order of the fields you are asked for, and do not skip
ahead. You will decide what the diagram means BEFORE you draw it, and draw it
BEFORE you narrate it. A narration that describes a different diagram from the
one on screen teaches the student something false, which is worse than teaching
them nothing.

Deciding the diagram:
- Name each axis with its quantity and unit, or name each labelled part.
- State what the shape of the drawing actually means physically or
  mathematically. If it is a displacement-time graph then the gradient is
  velocity; do not later call the vertical axis velocity. Get this straight
  here and hold to it.

The narration:
- Six to nine steps. Each step is one or two spoken sentences.
- Speak them aloud, not written prose: this is read by a voice.
- Every step must say something a student could be examined on: a definition,
  a relationship, a method, a specific error. If a step would still be true
  with the topic name swapped for any other topic, it is filler — delete it
  and write a real one.
- Banned, because they carry no teaching: "this topic covers", "it explains
  how", "practice helps", "understanding is important", "in real-world
  scenarios", and any sentence that only restates the topic name.
- Anchor the early steps to the diagram, using the same words that appear as
  labels on it.
- Say numbers and symbols in words, the way you would out loud: "x squared",
  "the square root of three", "delta H". A voice cannot read a symbol.

The diagram, as a single inline SVG:
- viewBox="0 0 640 400", no width or height attributes.
- Use ONLY these elements: svg, g, defs, path, line, polyline, polygon, rect,
  circle, ellipse, text, tspan, marker, linearGradient, radialGradient, stop.
  Anything else is stripped and your diagram will break.
- No script, no style blocks, no foreignObject, no external references, no
  event attributes.
- Use stroke="currentColor" and fill="currentColor" for anything that should
  follow the page's colour. Use fill="none" on outlines. For one accent colour
  use #e07a3f.
- Label the parts. A diagram with no text on it teaches nothing.
- Keep it to what the topic needs: axes and a curve, a force diagram, an
  energy profile, a labelled cycle. Not decoration.

The geometry has to mean what you said it means. Before you write the
coordinates, work out what the shape must do, then place points that actually
do it:
- A straight line means every point is collinear. Check it: between successive
  points, the change in y divided by the change in x must be the same number
  every time. If your last segment is flat while the others rise, you have
  drawn an object that stopped.
- A curve of increasing gradient means each successive segment is steeper than
  the last, and you must be able to show that from your own numbers.
- Remember SVG y grows downwards, so a quantity that increases needs y to
  decrease.
- Never label a shape with a description its coordinates contradict.

${BOARD_CONTEXT}

${HOUSE_STYLE}`;

/* Field order is load-bearing, as it is in the marking route. The model fills
   these in sequence, so committing to what the diagram means before drawing
   it, and drawing before narrating, is what stops the picture and the words
   drifting apart. Asked for in the other order, it narrated a velocity axis
   onto a displacement-time graph. */
const SCHEMA = {
  type: "object",
  properties: {
    diagramPlan: {
      type: "string",
      description:
        "What the diagram will show: each axis with quantity and unit, or each labelled part, and what the shape of it means. Decided before drawing.",
    },
    diagram: {
      type: "string",
      description:
        "The complete inline SVG matching diagramPlan exactly, starting with <svg and nothing before it.",
    },
    diagramLabels: {
      type: "array",
      items: { type: "string" },
      description: "Every text label you placed on the diagram, verbatim.",
    },
    headline: {
      type: "string",
      description:
        "One sentence stating the idea this topic turns on. Not the topic name restated.",
    },
    narration: {
      type: "array",
      items: {
        type: "object",
        properties: {
          label: {
            type: "string",
            description: "Two or three words naming this step, for the caption strip.",
          },
          say: {
            type: "string",
            description:
              "What the teacher says at this step, read aloud. Must carry something examinable.",
          },
        },
        required: ["label", "say"],
      },
    },
  },
  required: ["diagramPlan", "diagram", "diagramLabels", "headline", "narration"],
} as const;

type Explainer = {
  diagramPlan: string;
  diagram: string;
  diagramLabels: string[];
  headline: string;
  narration: { label: string; say: string }[];
};

export async function POST(request: Request) {
  const user = await requireStudent();
  if (!user.ok) return user.response;

  const scoped = await readScope(request);
  if (!scoped.ok) return scoped.response;

  const { body, scope } = scoped.value;
  const boardId = String(body.boardId ?? "");

  const supabase = await createClient();

  /* Served from cache when this student has already opened this topic. */
  const { data: cached } = await supabase
    .from("topic_explainers")
    .select("headline, narration, diagram")
    .eq("user_id", user.value)
    .eq("topic_id", scope.topicId)
    .eq("board_id", boardId)
    .maybeSingle();

  if (cached?.diagram) {
    return NextResponse.json({
      scope: scopeLine(scope),
      headline: cached.headline as string,
      narration: cached.narration as Explainer["narration"],
      diagram: cached.diagram as string,
      cached: true,
    });
  }

  const slot = await consume(supabase, user.value, "explain");
  if (!slot.ok) return fail(slot.message, slot.status);

  let explainer: Explainer;
  try {
    explainer = await structured<Explainer>({
      system: SYSTEM,
      prompt: `Explain, at the whiteboard:

${scopeLine(scope)}

Teach what this board examines on this topic, and nothing beyond it.`,
      schema: SCHEMA as unknown as Record<string, unknown>,
      toolName: "deliver_explainer",
      toolDescription: "Return the diagram and the narration that goes with it.",
      maxTokens: 6000,
      /* Diagram geometry is the hardest thing asked of the model in this app;
         a deployment can point it at a stronger model without paying that
         rate for plain prose. */
      model: process.env.AI_MODEL_DIAGRAMS,
    });
  } catch (error) {
    await release(supabase, "explain");
    return aiFailure(error);
  }

  /* Never render model markup unchecked. An empty result here means the
     diagram was unusable, and the narration still stands on its own. */
  const diagram = sanitiseSvg(explainer.diagram);

  const narration = (explainer.narration ?? [])
    .filter((step) => step?.say?.trim())
    .slice(0, 12);

  if (narration.length === 0) {
    await release(supabase, "explain");
    return fail("The explainer came back empty. Try again.", 502);
  }

  await supabase.from("topic_explainers").upsert({
    user_id: user.value,
    topic_id: scope.topicId,
    board_id: boardId,
    headline: explainer.headline ?? "",
    narration,
    diagram,
    /* Audio is generated on first play, not here — a student who only reads
       the steps should not pay for speech they never listen to. */
    audio_path: null,
  });

  return NextResponse.json({
    scope: scopeLine(scope),
    headline: explainer.headline ?? "",
    narration,
    diagram,
    quota: slot.quota,
    cached: false,
  });
}
