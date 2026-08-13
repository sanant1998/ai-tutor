/* Asking a question out loud.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS GATED SEPARATELY FROM EVERYTHING ELSE
 *
 * A recording of a child's voice, made in their home, is the most sensitive
 * thing this product could hold. It is identifiable in a way a maths answer is
 * not, and there is no version of "we had general consent" that covers it.
 *
 * So it has its own consent purpose, its own storage bucket, and a thirty-day
 * life enforced by a scheduled job rather than by anyone remembering. The
 * transcript survives — that is the useful part and it is just text — and the
 * audio does not.
 *
 * ---------------------------------------------------------------------------
 * WHISPER IS THE WRONG MODEL FOR THIS AUDIENCE
 *
 * Word error rates on Indian-accented English are substantially worse for
 * Whisper than for models trained on Indic speech, and worse again for the
 * Hinglish code-switching these students actually speak — "iska additive
 * inverse kya hoga" is half of each language in one sentence.
 *
 * A tutor that mishears the question and confidently answers a different one
 * is worse than no voice feature, so the endpoint is provider-agnostic and the
 * recommendation in .env.example is an Indic-trained model (Sarvam, or Google's
 * Chirp Indic). Transcripts come back with a confidence score, and a low one is
 * shown to the student to confirm rather than sent straight to the tutor. */

import { NextResponse } from "next/server";

import { consume, release } from "@/lib/ai/quota";
import { fail, requireStudent } from "@/lib/ai/route";
import { callerIp, LIMIT_MESSAGE, takeLimit } from "@/lib/ratelimit";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/* Thirty seconds. A spoken maths question is under ten; anything longer is a
   student holding the button down, and it costs transcription money and adds
   latency to a turn they are waiting on.
 *
 * The duration is what the student is told about and what actually matters, so
 * it is enforced on the duration the client reports as well as on the byte
 * size. Only the byte cap existed before, which meant the limit in force was
 * a number nobody had been told and the message quoted one that was not being
 * checked at all. Bytes are still the backstop, because the reported duration
 * comes from the browser and a browser can say anything. */
const MAX_SECONDS = 30;
const MAX_BYTES = 2 * 1024 * 1024;

/* Below this the transcript is shown back for confirmation instead of being
   sent to the tutor. Acting on a bad transcript wastes a turn and teaches the
   student the feature does not work. */
const CONFIDENCE_FLOOR = 0.6;

export async function POST(request: Request) {
  const user = await requireStudent();
  if (!user.ok) return user.response;

  if (!isAdminConfigured()) {
    return fail("Voice is not configured on this deployment.", 503);
  }

  const admin = createAdminClient();

  /* --- Consent, before a byte is stored -------------------------------- */
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
      "Voice needs a separate permission from a parent. They can give it from Settings.",
      403,
    );
  }

  const endpoint = process.env.STT_URL;
  const key = process.env.STT_API_KEY;

  if (!endpoint || !key) {
    return fail("Speech recognition is not configured on this deployment.", 503);
  }

  /* --- The audio -------------------------------------------------------- */
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail("Expected multipart form data.", 400);
  }

  const audio = form.get("audio");
  const sessionId = form.get("sessionId");
  const durationMs = Number(form.get("durationMs"));

  if (!(audio instanceof File)) return fail("audio file is required.", 400);

  const tooLong =
    audio.size > MAX_BYTES ||
    (Number.isFinite(durationMs) && durationMs > MAX_SECONDS * 1000);

  if (tooLong) {
    return fail(`That recording is too long — keep it under ${MAX_SECONDS} seconds.`, 413);
  }

  /* --- The session this belongs to --------------------------------------
     Checked rather than trusted. The id arrives in a form field, and writing
     a row that points at somebody else's session is not something a browser
     should be able to ask for — even though nothing reads the link today, an
     unverified foreign key is the sort of thing a later feature starts
     trusting. */
  let linkedSession: string | null = null;

  if (typeof sessionId === "string" && sessionId) {
    const { data: owned } = await admin
      .from("learning_sessions")
      .select("id")
      .eq("id", sessionId)
      .eq("user_id", user.value)
      .maybeSingle();

    linkedSession = owned ? sessionId : null;
  }

  /* --- Limits, before a paid call ---------------------------------------
     Transcription bills per request and this route had neither axis: one
     signed-in account could hold the button down all evening. */
  const ipLimit = await takeLimit("audio", callerIp(request));
  if (!ipLimit.allowed) return fail(LIMIT_MESSAGE, 429);

  const supabase = await createClient();
  const slot = await consume(supabase, user.value, "voice");
  if (!slot.ok) return fail(slot.message, slot.status);

  /* --- Transcribe -------------------------------------------------------
     OpenAI-compatible /audio/transcriptions, which Sarvam, Groq and OpenAI
     all speak. The provider is env, exactly like the text models. */
  let transcript = "";
  let confidence = 1;

  try {
    const upstream = new FormData();
    upstream.append("file", audio, audio.name || "audio.webm");
    upstream.append("model", process.env.STT_MODEL ?? "whisper-1");
    /* Hinglish is written in Latin script and is mostly English grammar, so
       en-IN gets closer than hi. Left configurable because the right answer
       differs by provider. */
    upstream.append("language", process.env.STT_LANGUAGE ?? "en");
    upstream.append("response_format", "verbose_json");

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: upstream,
      signal: AbortSignal.timeout(20000),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error("[voice] stt failed", response.status, detail.slice(0, 200));
      await release(supabase, "voice");
      return fail("That could not be understood. Type your question instead.", 502);
    }

    const payload = (await response.json()) as {
      text?: string;
      segments?: { avg_logprob?: number; no_speech_prob?: number }[];
    };

    transcript = (payload.text ?? "").trim();

    /* Providers differ on how they express confidence. avg_logprob is what the
       Whisper-compatible ones return; mapped roughly onto 0-1 so the floor
       above means something. Absent, we assume confident rather than blocking
       a working feature on a missing field. */
    const segments = payload.segments ?? [];
    if (segments.length > 0) {
      const mean =
        segments.reduce((total, segment) => total + (segment.avg_logprob ?? 0), 0) /
        segments.length;
      confidence = Math.max(0, Math.min(1, 1 + mean / 2));
    }
  } catch (error) {
    console.error("[voice] transcription failed", error);
    /* A provider outage is not the student's fault. */
    await release(supabase, "voice");
    return fail("That could not be understood. Type your question instead.", 502);
  }

  if (!transcript) {
    /* Silence is usually a microphone permission problem, not a question they
       meant to ask. Charging for it teaches them the feature is broken. */
    await release(supabase, "voice");
    return fail("Nothing was heard. Please try again.", 422);
  }

  /* --- Store ------------------------------------------------------------
     The audio goes to a private bucket under the student's own id, so the
     storage policy scopes it even though this route uses the service key. The
     purge job deletes both the row and the object at 30 days. */
  const path = `${user.value}/${crypto.randomUUID()}.webm`;

  const { error: uploadError } = await admin.storage
    .from("voice-notes")
    .upload(path, audio, { contentType: audio.type || "audio/webm", upsert: false });

  if (uploadError) {
    /* The transcript is still useful and the student is waiting. Losing the
       recording is not a reason to lose their question. */
    console.error("[voice] upload failed", uploadError.message);
  }

  await admin.from("voice_blobs").insert({
    user_id: user.value,
    session_id: linkedSession,
    storage_path: uploadError ? "" : path,
    transcript,
  });

  return NextResponse.json({
    transcript,
    confidence: Number(confidence.toFixed(2)),
    /* The client shows the transcript for confirmation rather than sending it
       straight to the tutor when this is set. One extra tap beats a tutor
       answering a question nobody asked. */
    confirm: confidence < CONFIDENCE_FLOOR,
    retentionDays: 30,
  });
}
