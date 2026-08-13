/* Telling a parent that their child said something worrying.
 *
 * ---------------------------------------------------------------------------
 * THE DECISION THIS FILE MAKES, WRITTEN DOWN
 *
 * The question left open until now was whether to message a parent on a
 * self-harm escalation at all. Both answers have a real cost:
 *
 *   Not sending  — a thirteen-year-old told an app they did not want to live,
 *                  and the only adult who could act never found out.
 *
 *   Sending      — the message reaches the wrong adult, or the right adult who
 *                  reacts badly, and the child is worse off for having spoken.
 *
 * The resolution here is to send, narrowly, under four conditions, because the
 * failure of not sending is unrecoverable and the failures of sending are
 * mitigable:
 *
 *   1  SELF-HARM ONLY. Not the other moderation categories. A child swearing
 *      at a maths app is not something a parent needs a WhatsApp about, and
 *      routing those through the same channel would train everyone — parents
 *      included — to ignore it.
 *
 *   2  THE VERIFIED NUMBER ONLY. The phone that received the consent OTP and
 *      completed the consent. That is the strongest evidence available that
 *      this number belongs to a responsible adult for this child; a number
 *      typed into a profile field is not.
 *
 *   3  NO CONTENT, EVER. The message says a conversation is worth having and
 *      names a helpline. It does not quote the child. Handing a distressed
 *      child's words to their parent over WhatsApp can make the conversation
 *      that follows worse, and the excerpt is already in safety_flags where a
 *      trained human can see it.
 *
 *   4  ONCE A DAY. A child who repeats the phrase, or whose message trips the
 *      pattern three times in one session, produces one alert. Three alerts in
 *      an hour reads as an app malfunctioning rather than as a child in
 *      trouble.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS IS NOT
 *
 * It is not a safeguarding process. There is no trained human on the other end
 * of safety_flags yet, and until there is, this file plus the helplines shown
 * to the student are the whole of the response. That is a real limitation and
 * it belongs in the launch checklist, not in a comment nobody reads: before
 * this ships to more than a pilot, someone has to own the flag queue. */

import "server-only";

import { sendTemplate, TEMPLATES } from "@/lib/messaging/send";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";

const ONCE_PER_MS = 24 * 60 * 60 * 1000;

export type EscalationResult =
  | { sent: true }
  | { sent: false; reason: "not_configured" | "no_number" | "already_alerted" | "send_failed" };

export async function alertParentOfSelfHarm(
  studentId: string,
  sessionId?: string,
): Promise<EscalationResult> {
  if (!isAdminConfigured()) return { sent: false, reason: "not_configured" };

  const admin = createAdminClient();

  /* --- 4. Once a day ---------------------------------------------------- */
  const since = new Date(Date.now() - ONCE_PER_MS).toISOString();

  const { count } = await admin
    .from("safety_flags")
    .select("id", { count: "exact", head: true })
    .eq("user_id", studentId)
    .eq("category", "self_harm")
    .eq("source", "parent_alert")
    .gte("created_at", since);

  if ((count ?? 0) > 0) return { sent: false, reason: "already_alerted" };

  /* --- 2. The verified number ------------------------------------------- */
  const { data: consent } = await admin
    .from("consents")
    .select("evidence, granted, withdrawn_at")
    .eq("student_id", studentId)
    .eq("purpose", "account")
    .eq("granted", true)
    .is("withdrawn_at", null)
    .order("granted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const phone = (consent?.evidence as { phone?: string } | null)?.phone;

  if (!phone) {
    /* Loud. An adult account, or a consent flow that was never completed —
       either way nobody is going to be told, and that is worth seeing in the
       logs rather than inferring from silence. */
    console.error(
      `[safety] self-harm escalation for ${studentId} has no verified parent number.`,
    );
    return { sent: false, reason: "no_number" };
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("first_name")
    .eq("id", studentId)
    .maybeSingle();

  /* --- 3. No content ----------------------------------------------------- */
  const sent = await sendTemplate({
    to: phone,
    template: TEMPLATES.safetyAlert,
    params: [(profile?.first_name as string) || "your child"],
  });

  /* Recorded whether or not it went, and with source 'parent_alert' so the
     once-a-day check above sees it and so a reviewer can tell an alert that
     was sent from one that failed. */
  await admin.from("safety_flags").insert({
    user_id: studentId,
    session_id: sessionId ?? null,
    category: "self_harm",
    severity: "urgent",
    excerpt: sent.ok
      ? "parent alerted"
      : `parent alert FAILED: ${"reason" in sent ? sent.reason : "unknown"}`,
    source: "parent_alert",
    status: "open",
  });

  return sent.ok ? { sent: true } : { sent: false, reason: "send_failed" };
}
