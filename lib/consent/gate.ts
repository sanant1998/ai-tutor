/* May this account be processed right now?
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS ITS OWN FILE
 *
 * The rule used to live inside app/api/tutor/session/route.ts, which meant it
 * applied to exactly one endpoint: starting a lesson. Every other route that
 * sends a child's words to a model — the explainer, extra questions, marking,
 * notes, mock papers, the fix sheet, and the tutor's own turn handler — reached
 * the provider without ever asking whether a parent had agreed to that.
 *
 * The comment in app/(dashboard)/layout.tsx said "the API routes gate
 * independently". They did not. One of them did.
 *
 * The same applies to `account_state`. /api/parent/data returns
 * `stopsProcessingImmediately: true` when an erasure is requested, and that
 * was true of the tutor and of nothing else — a student could carry on
 * generating notes and mock papers all week after asking to be deleted.
 *
 * So the rule lives here, once, and every route that processes a student goes
 * through it.
 *
 * ---------------------------------------------------------------------------
 * IT FAILS CLOSED
 *
 * Unlike the paywall and the rate limiter, which open when they cannot answer.
 * The difference is what being wrong costs: a missing paywall is a free
 * lesson, a missing consent check is a child's data processed with no lawful
 * basis. So a database that cannot answer this question refuses the request
 * and names the migration that is missing. */

import "server-only";

import { isMinorFromDob } from "@/lib/consent/age";
import { REQUIRED_PURPOSES } from "@/lib/consent/purposes";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";

export type ConsentCheck =
  | { ok: true }
  | { ok: false; status: number; message: string };

export async function processingAllowed(userId: string): Promise<ConsentCheck> {
  /* No service key means no compliance tables and no consent to be missing.
     This is the keyless preview deploy, which has no real students in it. The
     dashboard layout takes the same view. */
  if (!isAdminConfigured()) return { ok: true };

  const admin = createAdminClient();

  const { data: profile, error } = await admin
    .from("profiles")
    .select("dob, account_state, role")
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
        "Consent for this account has been withdrawn. Past work can still be read, but studying again needs a parent to give consent once more.",
    };
  }

  if (profile?.account_state === "suspended") {
    return { ok: false, status: 403, message: "This account is suspended." };
  }

  /* A teacher has no parent.
   *
   * This gate asks for a date of birth and treats a missing one as a minor —
   * the right direction for a student, and lib/consent/age.ts argues it. But a
   * teacher account has no dob either, so a teacher opening the question
   * builder was told "padhai shuru karne se pehle parent ki consent chahiye",
   * with a link that had been sent to nobody. There is no parent, there never
   * was, and the message could not be acted on.
   *
   * Keyed on profiles.role, which a browser cannot write: compliance.sql
   * revokes update on profiles and grants back only first_name, last_name and
   * language, so a student cannot leave this gate by relabelling themselves.
   *
   * The account_state checks above stay above this line on purpose — a
   * suspended teacher is still suspended. What is skipped here is parental
   * consent, and only that. */
  if (profile?.role === "teacher") return { ok: true };

  /* An adult account needs no parental consent. A missing date of birth counts
     as a minor — see lib/consent/age.ts for why that is the safe direction. */
  if (!isMinorFromDob(profile?.dob as string | null)) return { ok: true };

  const { data: granted } = await admin
    .from("consents")
    .select("purpose, granted, withdrawn_at, granted_at")
    .eq("student_id", userId)
    .in("purpose", [...REQUIRED_PURPOSES])
    .order("granted_at", { ascending: false });

  const current = new Map<string, boolean>();
  for (const row of granted ?? []) {
    /* Newest row per purpose wins; the query is already in that order. */
    if (current.has(row.purpose as string)) continue;
    current.set(
      row.purpose as string,
      Boolean(row.granted) && row.withdrawn_at === null,
    );
  }

  /* Driven off REQUIRED_PURPOSES rather than a hard-coded pair, so adding a
     required purpose to the consent screen cannot leave the gate checking the
     old list. */
  if (REQUIRED_PURPOSES.every((purpose) => current.get(purpose))) {
    return { ok: true };
  }

  return {
    ok: false,
    status: 403,
    message:
      "A parent has to give consent before studying can start. A link has been sent to their phone.",
  };
}
