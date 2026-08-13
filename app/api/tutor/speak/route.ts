/* Reading a tutor message aloud.
 *
 * ---------------------------------------------------------------------------
 * IT SPEAKS A STORED TURN, NEVER TEXT FROM THE REQUEST
 *
 * The browser sends a session id and a sequence number. The text comes from
 * session_turns, scoped to the caller. That is the difference between a
 * feature and an open text-to-speech proxy billed to our account — and the
 * same rule the explainer audio route already follows.
 *
 * ---------------------------------------------------------------------------
 * ON DEMAND, NOT AUTOMATIC
 *
 * Nothing here fires on its own. A student taps a speaker on a message they
 * want to hear again, and only that message is synthesised.
 *
 * Speaking every reply automatically would have been easier to build and worse
 * in three measurable ways: it multiplies the per-student cost that
 * /admin/health watches, it adds seconds to a turn the student is already
 * waiting on, and most replies are three lines a student can read faster than
 * a voice can say them. Speech earns its place on a worked example and a
 * reteach, which is exactly where a student reaches for it.
 *
 * ---------------------------------------------------------------------------
 * CACHED ON THE TEXT, NOT THE TURN
 *
 * Billed per character, so the file is keyed by a hash of what is actually
 * spoken plus the voice. A student replaying a message pays once; two students
 * hearing the same worked example pay once between them, because the tutor
 * teaches from a fixed content pack and its sentences genuinely repeat. */

import { createHash } from "node:crypto";

import { NextResponse } from "next/server";

import { fail, requireUser } from "@/lib/ai/route";
import { languageOf } from "@/lib/language";
import { MAX_SPOKEN_CHARS, speakable } from "@/lib/math/speak";
import { reportError } from "@/lib/observability";
import { callerIp, LIMIT_MESSAGE, takeLimit } from "@/lib/ratelimit";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

const BUCKET = "tutor-audio";

/* Long enough to listen through, short enough not to become a shareable
   asset. */
const SIGNED_URL_SECONDS = 60 * 60;

export async function POST(request: Request) {
  const user = await requireUser();
  if (!user.ok) return user.response;

  if (!isAdminConfigured()) return fail("Voice is not configured here.", 503);

  const limit = await takeLimit("practice_attempt", callerIp(request));
  if (!limit.allowed) return fail(LIMIT_MESSAGE, 429);

  let body: { sessionId?: string; seq?: number };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return fail("Expected a JSON body.", 400);
  }

  const sessionId = String(body.sessionId ?? "");
  const seq = Number(body.seq);

  if (!sessionId || !Number.isFinite(seq)) {
    return fail("sessionId and seq are required.", 400);
  }

  const endpoint = process.env.AI_TTS_URL;
  const key = process.env.AI_TTS_API_KEY ?? process.env.AI_API_KEY;

  if (!endpoint || !key) {
    return fail("Speech is not configured on this deployment.", 503);
  }

  const admin = createAdminClient();

  /* --- Consent, before a character is synthesised ----------------------- */
  const { data: consent } = await admin
    .from("consents")
    .select("granted, withdrawn_at")
    .eq("student_id", user.value)
    .eq("purpose", "voice")
    .order("granted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!consent?.granted || consent.withdrawn_at) {
    return fail(
      "Awaaz wale feature ke liye parent ki alag anumati chahiye. Wo Privacy page se de sakte hain.",
      403,
    );
  }

  /* --- The text, from the row, scoped to this student ------------------- */
  const { data: turn } = await admin
    .from("session_turns")
    .select("content, role")
    .eq("session_id", sessionId)
    .eq("user_id", user.value)
    .eq("seq", seq)
    .maybeSingle();

  if (!turn) return fail("That message is not one of yours.", 404);
  if (turn.role !== "tutor") return fail("Only the tutor's messages are read aloud.", 400);

  const { data: profile } = await admin
    .from("profiles")
    .select("language")
    .eq("id", user.value)
    .maybeSingle();

  const language = languageOf(profile?.language as string | null).id;

  /* LaTeX into something a voice can say. Without this the student hears
     "backslash frac five eight", which is worse than silence. */
  const text = speakable(turn.content as string, language).slice(0, MAX_SPOKEN_CHARS);

  if (!text) return fail("Is message me bolne layak kuch nahi hai.", 422);

  /* --- Cache ------------------------------------------------------------ */
  const voice = process.env.AI_TTS_VOICE ?? "alloy";
  const model = process.env.AI_TTS_MODEL ?? "tts-1";

  const digest = createHash("sha256")
    .update(`${model}:${voice}:${language}:${text}`)
    .digest("hex")
    .slice(0, 32);

  /* Not under a student's folder: this is OUR content read aloud, not their
     data. Two students hearing the same worked example share one file, and the
     30-day purge that applies to their recordings does not apply here. */
  const path = `${language}/${digest}.mp3`;

  const cached = await admin.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_SECONDS);

  if (cached.data?.signedUrl) {
    return NextResponse.json({ url: cached.data.signedUrl, cached: true });
  }

  /* --- Synthesise ------------------------------------------------------- */
  let audio: ArrayBuffer;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, voice, input: text, response_format: "mp3" }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`${response.status}: ${detail.slice(0, 200)}`);
    }

    audio = await response.arrayBuffer();
  } catch (error) {
    await reportError("tutor.speak", error, { sessionId, seq, language });
    return fail("Awaaz nahi ban paayi. Padh kar dekh lo — text wahi hai.", 502);
  }

  const { error: uploadError } = await admin.storage
    .from(BUCKET)
    .upload(path, audio, { contentType: "audio/mpeg", upsert: true });

  if (uploadError) {
    /* The audio exists and the cache does not. Returning it inline is better
       than failing — the student hears it, and the next play pays again. */
    return new NextResponse(audio, {
      headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=3600" },
    });
  }

  const signed = await admin.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_SECONDS);

  return NextResponse.json({ url: signed.data?.signedUrl ?? null, cached: false });
}
