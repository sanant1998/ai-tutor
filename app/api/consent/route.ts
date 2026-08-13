/* Reading and withdrawing consent.
 *
 * GET is what the settings screen and the onboarding gate both call.
 *
 * DELETE is the withdrawal, and it is the part most products never build. The
 * DPDP Act requires that withdrawing be as easy as giving — so it is one
 * request, it takes effect immediately, and it does not route through support.
 *
 * ---------------------------------------------------------------------------
 * WITHDRAWAL IS NOT DELETION
 *
 * Pulling ai_processing stops the tutor and puts the account into read_only:
 * the student can still read everything they have already done — their notes,
 * their fix sheet, their progress — and nothing new is processed.
 *
 * Treating a withdrawal as a deletion would destroy months of a child's work
 * over a checkbox, and would make parents afraid to touch the control at all.
 * Deletion is a separate, explicit request, and it lives at
 * /api/parent/data/[studentId]. */

import { NextResponse } from "next/server";

import { fail, requireUser } from "@/lib/ai/route";
import { isMinorFromDob } from "@/lib/consent/age";
import {
  isPurpose,
  POLICY_VERSION,
  PURPOSES,
  REQUIRED_PURPOSES,
  type PurposeKey,
} from "@/lib/consent/purposes";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET() {
  const user = await requireUser();
  if (!user.ok) return user.response;

  if (!isAdminConfigured()) {
    return fail("Consent is not configured on this deployment.", 503);
  }

  const admin = createAdminClient();

  const [{ data: profile }, { data: rows }] = await Promise.all([
    admin
      .from("profiles")
      .select("dob, account_state")
      .eq("id", user.value)
      .maybeSingle(),
    admin
      .from("consents")
      .select("purpose, granted, withdrawn_at, granted_at, method, policy_version")
      .eq("student_id", user.value)
      .order("granted_at", { ascending: false }),
  ]);

  /* Newest row per purpose wins; the query is already in that order. */
  const current = new Map<string, { granted: boolean; at: string; version: string }>();

  for (const row of rows ?? []) {
    if (current.has(row.purpose as string)) continue;
    current.set(row.purpose as string, {
      granted: Boolean(row.granted) && row.withdrawn_at === null,
      at: row.granted_at as string,
      version: row.policy_version as string,
    });
  }

  const purposes = PURPOSES.map((purpose) => {
    const state = current.get(purpose.key);

    return {
      ...purpose,
      granted: state?.granted ?? false,
      grantedAt: state?.at ?? null,
      /* True when the grant predates the current policy. The gate does not act
         on this — a stale grant is still a grant — but the settings screen
         says so and offers a re-confirm, which is the honest middle ground
         between ignoring a policy change and locking a child out over one. */
      stale: state ? state.version !== POLICY_VERSION : false,
    };
  });

  return NextResponse.json({
    accountState: (profile?.account_state as string) ?? "pending_consent",
    isMinor: isMinorFromDob(profile?.dob as string | null),
    hasDob: Boolean(profile?.dob),
    policyVersion: POLICY_VERSION,
    purposes,
    /* The two that gate everything, so the caller does not re-derive the rule
       and get it slightly different. */
    canStudy: REQUIRED_PURPOSES.every(
      (key) => purposes.find((purpose) => purpose.key === key)?.granted,
    ),
  });
}

export async function DELETE(request: Request) {
  const user = await requireUser();
  if (!user.ok) return user.response;

  if (!isAdminConfigured()) {
    return fail("Consent is not configured on this deployment.", 503);
  }

  let body: { purposes?: string[] };
  try {
    body = (await request.json()) as { purposes?: string[] };
  } catch {
    body = {};
  }

  /* No list means withdraw everything, which is what "withdraw consent" means
     to the person clicking it. */
  const targets: PurposeKey[] =
    body.purposes && body.purposes.length > 0
      ? body.purposes.filter((purpose): purpose is PurposeKey => isPurpose(purpose))
      : PURPOSES.map((purpose) => purpose.key);

  const admin = createAdminClient();
  const now = new Date().toISOString();

  /* Stamped on the existing rows rather than written as new refusals: the
     history has to show that a grant was given and then taken back, and two
     rows with opposite values and no link between them do not show that. */
  const { error } = await admin
    .from("consents")
    .update({ withdrawn_at: now })
    .eq("student_id", user.value)
    .in("purpose", targets)
    .is("withdrawn_at", null);

  if (error) return fail("Withdraw nahi ho paaya. Dobara try karo.", 500);

  const lostRequired = targets.some((purpose) =>
    REQUIRED_PURPOSES.includes(purpose),
  );

  if (lostRequired) {
    await admin
      .from("profiles")
      .update({ account_state: "read_only" })
      .eq("id", user.value);

    /* Any session still open would otherwise keep its next turn processing
       under a consent that no longer exists. */
    await admin
      .from("learning_sessions")
      .update({ status: "paused" })
      .eq("user_id", user.value)
      .eq("status", "active");
  }

  return NextResponse.json({
    withdrawn: targets,
    accountState: lostRequired ? "read_only" : "active",
    note: lostRequired
      ? "Account ab read-only hai. Purana kaam padha ja sakta hai; nayi padhai ke liye dobara consent chahiye."
      : "Ye feature band kar diya gaya. Baaki app waise hi chalega.",
  });
}
