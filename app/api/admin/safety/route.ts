/* The safety queue.
 *
 * ---------------------------------------------------------------------------
 * THIS IS A TOOL FOR A PERSON WHO DOES NOT YET EXIST
 *
 * safety_flags has been filling up since the gate was built and nothing has
 * ever read it. That is the gap the README calls a person rather than a
 * feature — but a person cannot own a queue that has no interface, so this is
 * the half of the problem that can be solved from here.
 *
 * ---------------------------------------------------------------------------
 * WHY THE EXCERPT IS SHOWN, HAVING BEEN WITHHELD EVERYWHERE ELSE
 *
 * The weekly report withholds transcripts from parents, and the parent safety
 * alert never quotes the child. Both are right: a parent reading their child's
 * words changes what the child is willing to type.
 *
 * A reviewer is a different reader with a different job. They have to decide
 * whether a message is a child in distress or a thirteen-year-old quoting a
 * song lyric, and that cannot be done from a category label. So the excerpt is
 * here, it is the only place it is, and every open is logged — a reviewer who
 * knows their reads are recorded is a reviewer who opens only what they need.
 */

import { NextResponse } from "next/server";

import { fail } from "@/lib/ai/route";
import { requireAdmin } from "@/lib/admin/guard";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return fail(admin.message, admin.status);
  if (!isAdminConfigured()) return fail("Not configured.", 503);

  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? "open";

  const db = createAdminClient();

  let query = db
    .from("safety_flags")
    .select("id, user_id, session_id, category, severity, excerpt, score, source, status, created_at, handled_at, review_note")
    /* Urgent first, then oldest. A self-harm flag from yesterday outranks a
       swearing flag from a minute ago, and the sort is the queue's whole
       opinion about what to do next. */
    .order("severity", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(200);

  if (status !== "all") query = query.eq("status", status);

  const { data, error } = await query;

  if (error) {
    return fail("safety_flags is missing. Run supabase/compliance.sql.", 503);
  }

  const rows = data ?? [];

  /* First names only, so a reviewer can talk about "Aarav in 8-A" rather than
     a uuid — and no more than that. */
  const ids = [...new Set(rows.map((row) => row.user_id as string))];
  const names = new Map<string, string>();

  if (ids.length > 0) {
    const { data: profiles } = await db
      .from("profiles")
      .select("id, first_name")
      .in("id", ids);

    for (const profile of profiles ?? []) {
      names.set(profile.id as string, (profile.first_name as string) || "");
    }
  }

  const { count: openUrgent } = await db
    .from("safety_flags")
    .select("id", { count: "exact", head: true })
    .eq("status", "open")
    .eq("severity", "urgent");

  return NextResponse.json({
    flags: rows.map((row) => ({
      id: row.id as string,
      studentId: row.user_id as string,
      studentName: names.get(row.user_id as string) ?? "",
      sessionId: row.session_id as string | null,
      category: row.category as string,
      severity: row.severity as string,
      excerpt: row.excerpt as string | null,
      score: row.score as number | null,
      source: row.source as string,
      status: row.status as string,
      createdAt: row.created_at as string,
      handledAt: row.handled_at as string | null,
      reviewNote: (row.review_note as string | null) ?? null,
    })),
    openUrgent: openUrgent ?? 0,
  });
}

export async function PATCH(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return fail(admin.message, admin.status);
  if (!isAdminConfigured()) return fail("Not configured.", 503);

  let body: { id?: string; status?: string; note?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return fail("Expected a JSON body.", 400);
  }

  if (!body.id) return fail("id is required.", 400);

  const status = body.status === "dismissed" ? "dismissed" : "actioned";

  const { error } = await createAdminClient()
    .from("safety_flags")
    .update({
      status,
      handled_by: admin.userId,
      handled_at: new Date().toISOString(),
      /* Its own column. Writing the reviewer's note over the excerpt would
         destroy the only record of what was actually said, which is the
         evidence the decision rests on. Both go at twelve months together. */
      ...(body.note ? { review_note: body.note.slice(0, 500) } : {}),
    })
    .eq("id", body.id);

  if (error) return fail("Could not update the flag.", 500);

  return NextResponse.json({ ok: true, status });
}
