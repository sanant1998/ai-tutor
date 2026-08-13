/* Starting a teaching session.
 *
 * Three gates before a session opens, in ascending order of cost to check:
 * the topic must exist, its prerequisites must be met, and — for a minor —
 * a parent must have consented to AI processing. */

import { NextResponse } from "next/server";

import { chapterAccess, PAYWALL_MESSAGE } from "@/lib/billing/access";
import { isMinorFromDob } from "@/lib/consent/age";
import { fail, requireUser } from "@/lib/ai/route";
import { LIMITS, topicUnlocked } from "@/lib/pedagogy/beats";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";
import { canSee, visibleTo } from "@/lib/tenancy";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await requireUser();
  if (!user.ok) return user.response;

  if (!isAdminConfigured()) {
    return fail(
      "The tutor is not configured on this deployment. Set SUPABASE_SERVICE_ROLE_KEY and run supabase/tutor.sql.",
      503,
    );
  }

  let body: { topicId?: string };
  try {
    body = (await request.json()) as { topicId?: string };
  } catch {
    return fail("Expected a JSON body.", 400);
  }

  const topicId = String(body.topicId ?? "").trim();
  if (!topicId) return fail("topicId is required.", 400);

  const admin = createAdminClient();

  const { data: topic } = await admin
    .from("topics")
    .select("id, title, prereq_topic_ids, chapter_ref, org_id")
    .eq("id", topicId)
    .maybeSingle();

  if (!topic) return fail("That topic is not in the curriculum.", 404);

  /* A point lookup, so a filter would be the wrong shape — this checks the row
     that came back. The client sends a topic id and RLS does not apply to the
     service-role key, so without this a student at one institute could open a
     session on another institute's topic simply by knowing its id.

     Same 404 as a topic that does not exist. A different message would confirm
     that the id is real, which is how a competitor's curriculum gets
     enumerated one id at a time. */
  const visibility = await visibleTo(user.value);

  if (!canSee(topic.org_id as string | null, visibility)) {
    return fail("That topic is not in the curriculum.", 404);
  }

  /* --- Paywall ----------------------------------------------------------
     Checked before consent so a parent evaluating the product is not asked to
     consent to processing for a chapter they cannot open anyway. */
  const access = await chapterAccess(user.value, topic.chapter_ref as string);

  if (!access.allowed) {
    return NextResponse.json(
      { error: PAYWALL_MESSAGE, paywall: true, chapterId: topic.chapter_ref },
      { status: 402 },
    );
  }

  /* --- Consent ---------------------------------------------------------
     Checked before anything is processed, not after. For a minor with no
     parental consent on record there is no lawful basis to send their words
     to a model, and "we will collect consent later" is not one either. */
  const consent = await consentState(admin, user.value);
  if (!consent.ok) return fail(consent.message, consent.status);

  /* --- Prerequisites --------------------------------------------------- */
  const prereqs = (topic.prereq_topic_ids as string[]) ?? [];

  if (prereqs.length > 0) {
    const { data: mastery } = await admin
      .from("topic_mastery")
      .select("topic_ref, score")
      .eq("user_id", user.value)
      .in("topic_ref", prereqs);

    const scores: Record<string, number> = {};
    for (const row of mastery ?? []) {
      scores[row.topic_ref as string] = Number(row.score ?? 0);
    }

    const { unlocked, blockedBy } = topicUnlocked(prereqs, scores);

    if (!unlocked) {
      const { data: blockers } = await admin
        .from("topics")
        .select("id, title")
        .in("id", blockedBy);

      return NextResponse.json(
        {
          error: "Pehle iske prerequisites poore karo.",
          blockedBy: (blockers ?? []).map((row) => ({
            id: row.id as string,
            title: row.title as string,
          })),
          needScore: LIMITS.unlockScore,
        },
        { status: 409 },
      );
    }
  }

  /* --- First concept ---------------------------------------------------- */
  const { data: concepts } = await admin
    .from("concepts")
    .select("id, title, seq")
    .eq("topic_ref", topicId)
    .order("seq")
    .limit(1);

  const firstConcept = concepts?.[0];
  if (!firstConcept) {
    return fail("That topic has no concepts seeded yet.", 409);
  }

  /* Opened through a security-definer function rather than an insert, so two
     tabs pressing Start cannot open two sessions on one topic. Two sessions
     means two independent turn counters, and the turn counter is the only
     thing bounding what a stuck student costs. */
  const supabase = await createClient();
  const { data: session, error } = await supabase.rpc("start_learning_session", {
    p_topic_ref: topicId,
    p_concept_ref: firstConcept.id,
  });

  if (error || !session) {
    return fail(
      "Could not start the session. Run supabase/tutor.sql on this project.",
      500,
    );
  }

  const row = Array.isArray(session) ? session[0] : session;

  return NextResponse.json({
    sessionId: row.id as string,
    beat: row.current_beat as string,
    topic: { id: topic.id as string, title: topic.title as string },
    concept: { id: firstConcept.id as string, title: firstConcept.title as string },
    turnsUsed: row.turns_used as number,
    access: { reason: access.reason, graceEndsOn: access.graceEndsOn ?? null },
    limits: {
      maxTurns: LIMITS.maxTurnsPerConcept,
      sessionMinutes: LIMITS.sessionMinutes,
    },
  });
}

/* An adult account needs no parental consent; a minor needs both 'account' and
   'ai_processing' granted and not withdrawn. Absence of a DOB is treated as a
   minor, because the population using this app is overwhelmingly under 18 and
   the safe default is the restrictive one. */
async function consentState(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
): Promise<{ ok: true } | { ok: false; message: string; status: number }> {
  const { data: profile, error } = await admin
    .from("profiles")
    .select("dob, account_state")
    .eq("id", userId)
    .maybeSingle();

  /* The compliance migration has not been run. Fail closed and say which one:
     a deployment that silently skips the consent check is the exact failure
     the check exists to prevent. */
  if (error) {
    return {
      ok: false,
      status: 503,
      message:
        "Consent tracking is not set up on this database yet. Run supabase/compliance.sql.",
    };
  }

  if (profile?.account_state === "read_only") {
    return {
      ok: false,
      status: 403,
      message:
        "Is account ki consent wapas le li gayi hai. Purana kaam padha ja sakta hai, nayi padhai ke liye parent ko dobara consent dena hoga.",
    };
  }

  if (profile?.account_state === "suspended") {
    return { ok: false, status: 403, message: "Ye account suspended hai." };
  }

  const minor = isMinorFromDob(profile?.dob as string | null);
  if (!minor) return { ok: true };

  const { data: granted } = await admin
    .from("consents")
    .select("purpose, granted, withdrawn_at, granted_at")
    .eq("student_id", userId)
    .in("purpose", ["account", "ai_processing"])
    .order("granted_at", { ascending: false });

  const current = new Map<string, boolean>();
  for (const row of granted ?? []) {
    /* Newest row per purpose wins; the query is already in that order. */
    if (!current.has(row.purpose as string)) {
      current.set(
        row.purpose as string,
        Boolean(row.granted) && row.withdrawn_at === null,
      );
    }
  }

  if (current.get("account") && current.get("ai_processing")) return { ok: true };

  return {
    ok: false,
    status: 403,
    message:
      "Padhai shuru karne se pehle parent ki consent chahiye. Unke phone pe link bheja gaya hai.",
  };
}
