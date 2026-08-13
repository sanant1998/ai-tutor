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

  if (provided !== secret) {
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

  const results = { considered: phoneByStudent.size, sent: 0, skipped: 0, failed: 0 };
  const failures: string[] = [];

  for (const [studentId, phone] of phoneByStudent) {
    try {
      const report = await buildParentReport(studentId);

      if (report.quiet) {
        /* One nudge, then silence. Counted as skipped either way so the run
           summary shows how much of the base went quiet — which is the number
           that matters long before the report copy does. */
        const nudged = await alreadyNudged(admin, studentId);
        if (nudged) {
          results.skipped += 1;
          continue;
        }
      }

      if (dryRun) {
        results.skipped += 1;
        continue;
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
      await reportError("cron.parent_report", error, { studentId: studentId.slice(0, 8) });
      results.failed += 1;
      failures.push(
        `${studentId.slice(0, 8)}: ${error instanceof Error ? error.message : "failed"}`,
      );
    }
  }

  /* Failures are returned rather than only logged: a cron whose errors are
     invisible is a cron nobody notices has stopped working. */
  return NextResponse.json({ ...results, failures: failures.slice(0, 20), dryRun });
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
