/* Sunday evening: send every parent their weekly digest.
 *
 * Triggered by a scheduler (Vercel Cron, or pg_cron calling this URL), not by
 * a user. Authorised by a shared secret in a header — this endpoint can send
 * thousands of paid messages and read every student's aggregates, so an
 * unauthenticated hit must do nothing at all.
 *
 * ---------------------------------------------------------------------------
 * WHY SUNDAY 7PM
 *
 * The message has to arrive when a parent can act on it. Weekday evenings are
 * cooking and homework; Saturday it is ignored. Sunday evening is when Indian
 * families plan the week, which is the only moment "agle hafte ka focus:
 * additive inverse" turns into anything.
 *
 * ---------------------------------------------------------------------------
 * WHY QUIET WEEKS ARE SKIPPED
 *
 * A parent who gets "0 sessions this week" four times running learns to ignore
 * the channel, and the channel is the whole retention mechanism. So a silent
 * week sends nothing the first time and a single nudge the second — after
 * which the product's problem is not the report. */

import { createHash, timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { buildParentReport, reportTemplateParams } from "@/lib/parent/report";
import { sendTemplate, TEMPLATES } from "@/lib/messaging/send";
import { reportError } from "@/lib/observability";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;

  /* No secret set means no cron. Refusing is the only safe default: an
     unprotected endpoint that spends money on messages is worse than one that
     never runs. */
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not set" }, { status: 503 });
  }

  const provided =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    request.headers.get("x-cron-secret") ??
    "";

  /* Constant time. `!==` on a secret leaks its prefix through response timing,
     and this endpoint can spend thousands of rupees of messaging — which is
     exactly the kind of target somebody is willing to send a few thousand
     requests at to find out. */
  if (!sameSecret(provided, secret)) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }

  if (!isAdminConfigured()) {
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }

  const admin = createAdminClient();
  const url = new URL(request.url);
  const dryRun = url.searchParams.get("dry") === "1";

  /* Everyone whose parent consented to an account. The phone lives on the
     consent row because that is where it was verified — there is no separate
     "parent contact" field to drift out of sync with what was consented to. */
  const { data: consents } = await admin
    .from("consents")
    .select("student_id, evidence, granted, withdrawn_at, granted_at")
    .eq("purpose", "account")
    .eq("granted", true)
    .is("withdrawn_at", null)
    .order("granted_at", { ascending: false });

  const phoneByStudent = new Map<string, string>();
  for (const row of consents ?? []) {
    const studentId = row.student_id as string;
    if (phoneByStudent.has(studentId)) continue;
    const phone = (row.evidence as { phone?: string } | null)?.phone;
    if (phone) phoneByStudent.set(studentId, phone);
  }

  /* --- One slice of the base per invocation -----------------------------
   *
   * This used to walk every student in one pass, one at a time, under a
   * 300-second budget. That is fine at a hundred students and impossible at
   * ten thousand: the function is killed partway through, and because nothing
   * records where it stopped, the students at the end of the map never get a
   * report and the run looks like it half-succeeded for reasons nobody can
   * reconstruct.
   *
   * So a run takes a bounded slice, and reports back where the next one should
   * start. `?offset=` lets the scheduler chain runs; `?limit=` tunes the slice
   * to whatever the platform's real timeout is. The default is sized for a
   * comfortable margin inside 300 seconds at roughly a second per student.
   *
   * The order is stable — the consent query is ordered — so a slice means the
   * same thing on every run of a given week. */
  const all = [...phoneByStudent.entries()];

  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0) || 0);
  const limit = Math.min(
    500,
    Math.max(1, Number(url.searchParams.get("limit") ?? 200) || 200),
  );

  const slice = all.slice(offset, offset + limit);
  const remaining = Math.max(0, all.length - (offset + slice.length));

  const results = {
    total: all.length,
    considered: slice.length,
    sent: 0,
    skipped: 0,
    failed: 0,
  };
  const failures: string[] = [];

  /* A small amount of concurrency. The bottleneck is a WhatsApp round trip per
     student, and doing them strictly one after another is what made the whole
     base impossible to get through — but the messaging provider rate-limits,
     so this stays deliberately modest rather than firing all of them at once. */
  const CONCURRENCY = 8;

  for (let start = 0; start < slice.length; start += CONCURRENCY) {
    const batch = slice.slice(start, start + CONCURRENCY);

    await Promise.all(
      batch.map(async ([studentId, phone]) => {
        try {
          const report = await buildParentReport(studentId);

          if (report.quiet) {
            /* One nudge, then silence. Counted as skipped either way so the run
               summary shows how much of the base went quiet — which is the
               number that matters long before the report copy does. */
            const nudged = await alreadyNudged(admin, studentId);
            if (nudged) {
              results.skipped += 1;
              return;
            }
          }

          if (dryRun) {
            results.skipped += 1;
            return;
          }

          const sent = await sendTemplate({
            to: phone,
            template: TEMPLATES.weeklyReport,
            params: reportTemplateParams(report),
          });

          if (sent.ok) {
            results.sent += 1;
            await admin.from("parent_report_log").insert({
              student_id: studentId,
              quiet: report.quiet,
              channel: "whatsapp",
            });
          } else {
            results.failed += 1;
            failures.push(`${studentId.slice(0, 8)}: ${sent.reason}`);
          }
        } catch (error) {
          await reportError("cron.parent_report", error, {
            studentId: studentId.slice(0, 8),
          });
          results.failed += 1;
          failures.push(
            `${studentId.slice(0, 8)}: ${error instanceof Error ? error.message : "failed"}`,
          );
        }
      }),
    );
  }

  /* Failures are returned rather than only logged: a cron whose errors are
     invisible is a cron nobody notices has stopped working. `nextOffset` is
     the other half of that — a run that silently covered part of the base
     looks identical to one that covered all of it. */
  return NextResponse.json({
    ...results,
    remaining,
    nextOffset: remaining > 0 ? offset + slice.length : null,
    failures: failures.slice(0, 20),
    dryRun,
  });
}

/* Constant-time comparison that does not leak the length either. */
function sameSecret(provided: string, expected: string): boolean {
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();

  return timingSafeEqual(a, b);
}

/* Was a quiet-week message already sent since the last active week? */
async function alreadyNudged(
  admin: ReturnType<typeof createAdminClient>,
  studentId: string,
): Promise<boolean> {
  const { data } = await admin
    .from("parent_report_log")
    .select("quiet, sent_at")
    .eq("student_id", studentId)
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return Boolean(data?.quiet);
}
