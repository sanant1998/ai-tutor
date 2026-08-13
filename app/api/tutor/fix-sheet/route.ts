/* The fix sheet, built from what actually went wrong.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS ONE CALLS NO MODEL
 *
 * app/api/fix-sheet/route.ts writes a fix sheet with a model, because the
 * revision side of the app marks free-text answers and has nothing but prose
 * to work from.
 *
 * The tutor does not have that problem. Every error_event carries the
 * misconception id that produced it, and the correction for that misconception
 * was written by a human when the concept was authored. Asking a model to
 * paraphrase a correction we already have would cost money, add latency, and
 * make the advice slightly different every week — for a document a parent
 * prints and sticks on a wall.
 *
 * So the sheet is a query. It is instant, free, identical every time, and
 * every line of it can be traced to a question the student got wrong. */

import { NextResponse } from "next/server";

import { fail, requireStudent } from "@/lib/ai/route";
import { errorKind, type ErrorType } from "@/lib/mastery";
import { scoped, visibleTo, type Visibility } from "@/lib/tenancy";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";
import type { Formula, Misconception } from "@/lib/content/pack";

export const runtime = "nodejs";

const WINDOW_DAYS = 30;
const MAX_ENTRIES = 5;
const DRILLS_PER_ENTRY = 3;

export async function GET(request: Request) {
  const user = await requireStudent();
  if (!user.ok) return user.response;

  if (!isAdminConfigured()) {
    return fail("The tutor is not configured on this deployment.", 503);
  }

  const url = new URL(request.url);
  const chapterId = url.searchParams.get("chapterId");
  const topicId = url.searchParams.get("topicId");

  const admin = createAdminClient();
  const since = new Date(Date.now() - WINDOW_DAYS * 86400000).toISOString();

  /* Scope. A chapter needs its topic list first — error_events is keyed by
     topic, and joining up to chapter in PostgREST for a filter is more
     round-trips than just resolving it here. */
  let topicFilter: string[] | null = null;

  if (topicId) {
    topicFilter = [topicId];
  } else if (chapterId) {
    const { data: topics } = await admin
      .from("topics")
      .select("id")
      .eq("chapter_ref", chapterId);

    topicFilter = (topics ?? []).map((row) => row.id as string);
    if (topicFilter.length === 0) return fail("That chapter has no topics.", 404);
  }

  let query = admin
    .from("error_events")
    .select("etype, concept_ref, misconception_id, topic_ref, created_at, source")
    .eq("user_id", user.value)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(400);

  if (topicFilter) query = query.in("topic_ref", topicFilter);

  const { data: events } = await query;

  if (!events || events.length === 0) {
    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      windowDays: WINDOW_DAYS,
      entries: [],
      /* Not "you have no weaknesses" — an empty sheet after no practice is a
         different thing from an empty sheet after fifty questions, and saying
         so stops the screen reading as praise nobody earned. */
      note: "No mistakes recorded yet. Do some practice and this sheet builds itself.",
    });
  }

  /* Group by the thing a remedy attaches to: a specific wrong belief where we
     have one, otherwise the concept and the kind of mistake. */
  type Group = {
    conceptRef: string | null;
    misconceptionId: string | null;
    etype: ErrorType;
    count: number;
    lastSeen: string;
    fromDistractorMap: boolean;
  };

  const groups = new Map<string, Group>();

  for (const event of events) {
    const etype = event.etype as ErrorType;
    if (!etype || (etype as string) === "none") continue;

    const key = `${event.concept_ref ?? ""}|${event.misconception_id ?? etype}`;
    const existing = groups.get(key);

    if (existing) {
      existing.count += 1;
      existing.fromDistractorMap ||= event.source === "distractor_map";
      continue;
    }

    groups.set(key, {
      conceptRef: (event.concept_ref as string | null) ?? null,
      misconceptionId: (event.misconception_id as string | null) ?? null,
      etype,
      count: 1,
      lastSeen: event.created_at as string,
      fromDistractorMap: event.source === "distractor_map",
    });
  }

  const ranked = [...groups.values()]
    .sort((a, b) => {
      /* A concept gap outranks a slip of the same frequency: one needs
         re-teaching and the other needs care, and a sheet that leads with
         "check your signs" while a concept is broken is advice in the wrong
         order. */
      const weight = (group: Group) => group.count * (group.etype === "concept" ? 2 : 1);
      return weight(b) - weight(a);
    })
    .slice(0, MAX_ENTRIES);

  const conceptIds = [...new Set(ranked.map((group) => group.conceptRef).filter(Boolean))] as string[];

  /* Scoped, even though the ids came from this student's own error_events and
     so are already theirs by construction. Belt and braces: if an institute's
     licence lapses and its content stops being visible, the fix sheet should
     stop showing it too rather than becoming the one screen that still does. */
  const visibility = await visibleTo(user.value);

  const { data: concepts } = await scoped(
    admin
      .from("concepts")
      .select("id, title, statement, misconceptions, formulas, topic_ref, org_id, topics(title)")
      .in("id", conceptIds.length > 0 ? conceptIds : ["-"]),
    visibility,
  );

  const conceptById = new Map(
    (concepts ?? []).map((row) => [row.id as string, row]),
  );

  const entries = await Promise.all(
    ranked.map(async (group) => {
      const concept = group.conceptRef ? conceptById.get(group.conceptRef) : undefined;

      const misconceptions = (concept?.misconceptions as Misconception[] | undefined) ?? [];
      const misconception = group.misconceptionId
        ? misconceptions.find((entry) => entry.id === group.misconceptionId)
        : undefined;

      const formulas = (concept?.formulas as Formula[] | undefined) ?? [];
      const topic = concept?.topics as unknown as { title?: string } | { title?: string }[] | null;

      return {
        concept: (concept?.title as string) ?? "Ye topic",
        topic: (Array.isArray(topic) ? topic[0]?.title : topic?.title) ?? "",
        times: group.count,
        lastSeen: group.lastSeen,
        error: {
          type: group.etype,
          name: errorKind(group.etype).name,
          fix: errorKind(group.etype).fix,
        },
        /* The remedy, written by whoever authored the concept. Present only
           when the mistake was diagnosed from a distractor map — otherwise we
           know the kind of error but not the belief behind it, and inventing
           one would be worse than leaving it out. */
        remedy: misconception
          ? {
              belief: misconception.wrong_belief,
              whyWrong: misconception.why_wrong,
              correction: misconception.correction,
            }
          : null,
        formula: formulas[0] ?? null,
        /* Fresh questions on the same concept, easiest first. Answers are not
           included — this is a worksheet, not an answer key. */
        drill: await drillFor(admin, user.value, group.conceptRef, visibility),
        diagnosedFrom: group.fromDistractorMap ? "distractor_map" : "model",
      };
    }),
  );

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    windowDays: WINDOW_DAYS,
    entries,
  });
}

async function drillFor(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  conceptRef: string | null,
  /* Belt and braces. The concept came from this student's own error_events, so
     it was already gated when the question was served — but this is where the
     question bank leaves the building, and the bank is the most valuable thing
     an institute pays to keep to itself. */
  visibility: Visibility,
) {
  if (!conceptRef) return [];

  const { data: seen } = await admin
    .from("attempts")
    .select("bank_question_id")
    .eq("user_id", userId)
    .eq("concept_ref", conceptRef)
    .not("bank_question_id", "is", null)
    .limit(60);

  const seenIds = (seen ?? []).map((row) => row.bank_question_id as string);

  let query = scoped(
    admin
      .from("bank_questions")
      .select("id, stem, level, qtype, options, org_id")
      .eq("concept_ref", conceptRef)
      .in("level", ["L1", "L2"])
      .order("level"),
    visibility,
  );

  if (seenIds.length > 0) {
    query = query.not("id", "in", `(${seenIds.map((id) => `"${id}"`).join(",")})`);
  }

  const { data } = await query.limit(DRILLS_PER_ENTRY);

  return (data ?? []).map((row) => ({
    id: row.id as string,
    stem: row.stem as string,
    level: row.level as string,
    qtype: row.qtype as string,
    options: (row.options as { key: string; text: string }[] | null) ?? null,
  }));
}
