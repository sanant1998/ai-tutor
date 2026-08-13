/* Narration audio for a cached explainer.

   Speech is billed per character, so this is cached hard: the mp3 is written
   to private storage on first play and every later play is a signed URL to
   that same file. A student who replays a topic ten times pays once.

   The text spoken is read from the stored explainer row, never from the
   request — the browser sends a topic id, so this cannot be used to have the
   provider read out arbitrary text on the account's bill. */

import { NextResponse } from "next/server";

import { fail, requireUser } from "@/lib/ai/route";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 120;

const BUCKET = "topic-audio";
/* Signed long enough to listen through, short enough not to be a shareable
   asset. */
const SIGNED_URL_SECONDS = 60 * 60;

const VOICE = process.env.AI_TTS_VOICE ?? "alloy";
const TTS_MODEL = process.env.AI_TTS_MODEL ?? "tts-1";

export async function POST(request: Request) {
  const user = await requireUser();
  if (!user.ok) return user.response;

  let body: { topicId?: unknown; boardId?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return fail("Expected a JSON body.", 400);
  }

  const topicId = typeof body.topicId === "string" ? body.topicId : "";
  const boardId = typeof body.boardId === "string" ? body.boardId : "";

  if (!topicId) return fail("Which topic?", 400);

  const supabase = await createClient();

  const { data: row } = await supabase
    .from("topic_explainers")
    .select("narration, audio_path")
    .eq("user_id", user.value)
    .eq("topic_id", topicId)
    .eq("board_id", boardId)
    .maybeSingle();

  if (!row) return fail("Generate the explainer first.", 404);

  /* Already spoken once: hand back a fresh signed URL for the stored file. */
  if (row.audio_path) {
    const { data: signed } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(row.audio_path as string, SIGNED_URL_SECONDS);

    if (signed?.signedUrl) {
      return NextResponse.json({ url: signed.signedUrl, cached: true });
    }
    /* The row pointed at a file that is gone — fall through and remake it. */
  }

  const narration = (row.narration ?? []) as { label: string; say: string }[];
  const script = narration
    .map((step) => step.say)
    .join("\n\n")
    .slice(0, 4000);

  if (!script.trim()) return fail("This explainer has no narration.", 422);

  const key = process.env.AI_API_KEY ?? process.env.OPENAI_API_KEY ?? "";
  if (!key) return fail("Speech is not configured on this deployment.", 503);

  const base = (process.env.AI_BASE_URL || "https://api.openai.com/v1").replace(
    /\/$/,
    "",
  );

  let speech: Response;
  try {
    speech = await fetch(`${base}/audio/speech`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: TTS_MODEL,
        voice: VOICE,
        input: script,
        response_format: "mp3",
      }),
    });
  } catch {
    return fail("Could not reach the speech provider.", 502);
  }

  if (!speech.ok) {
    const detail = await speech.text().catch(() => "");
    return fail(
      detail.slice(0, 200) || `Speech provider returned ${speech.status}.`,
      speech.status,
    );
  }

  const audio = Buffer.from(await speech.arrayBuffer());

  /* The user id is the first path segment because the storage policy reads it
     from there to decide who may touch the file. */
  const path = `${user.value}/${hash(`${topicId}:${boardId}:${VOICE}`)}.mp3`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, audio, { contentType: "audio/mpeg", upsert: true });

  if (uploadError) {
    /* Storage is not set up. The audio is already paid for, so serve it
       directly this once rather than throwing the work away. */
    return new NextResponse(new Uint8Array(audio), {
      headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=3600" },
    });
  }

  await supabase
    .from("topic_explainers")
    .update({ audio_path: path })
    .eq("user_id", user.value)
    .eq("topic_id", topicId)
    .eq("board_id", boardId);

  const { data: signed } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_SECONDS);

  if (!signed?.signedUrl) {
    return new NextResponse(new Uint8Array(audio), {
      headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=3600" },
    });
  }

  return NextResponse.json({ url: signed.signedUrl, cached: false });
}

/* Short, stable filename from the topic. Not security-bearing — the storage
   policy is what keeps one student out of another's folder. */
function hash(input: string) {
  let value = 5381;
  for (let i = 0; i < input.length; i += 1) {
    value = ((value << 5) + value + input.charCodeAt(i)) >>> 0;
  }
  return value.toString(36);
}
