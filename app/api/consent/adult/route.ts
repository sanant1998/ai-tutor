/* The way out of the consent gate for someone who is not a child.
 *
 * ---------------------------------------------------------------------------
 * THE BUG THIS EXISTS TO FIX
 *
 * The consent gate treats an unknown date of birth as "minor", which is the
 * right default — the population is overwhelmingly under 18 and the cost of
 * guessing wrong in the other direction is processing a child's data with no
 * lawful basis.
 *
 * But it left no exit. A teacher signing up to see their class, or a parent
 * signing up to see a report, was sent to a screen asking for THEIR parent's
 * phone number, and there was no path off it. The gate was correct and the
 * flow was unusable.
 *
 * So: state a date of birth. Eighteen or over, and the account is an adult's
 * account — consent is given by the account holder for themselves, recorded
 * with method 'self_adult' so it is distinguishable in an audit from a
 * parent's grant.
 *
 * ---------------------------------------------------------------------------
 * WHY A SELF-DECLARED AGE IS ENOUGH HERE AND NOT ELSEWHERE
 *
 * Nothing stops a fifteen-year-old typing 1990. That is worth being clear
 * about rather than pretending otherwise.
 *
 * It is acceptable because of what the declaration buys them: an ordinary
 * account with the same processing a consented child's account has. It does
 * not unlock anything a child is protected from — there is no advertising, no
 * marketing, no profile sold on. The safety gate, the retention limits and the
 * content restrictions are identical either way, because they were never
 * conditioned on age.
 *
 * The place where a lie would matter — a parent's continuing view of a child's
 * progress — is not reachable from here. That needs a verified phone and the
 * student's own confirmation. */

import { NextResponse } from "next/server";

import { fail, requireUser } from "@/lib/ai/route";
import { ADULT_AGE, ageFrom, plausibleDob } from "@/lib/consent/age";
import { POLICY_VERSION, PURPOSES } from "@/lib/consent/purposes";
import { isStoredRole, type StoredRole } from "@/lib/roles";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await requireUser();
  if (!user.ok) return user.response;

  if (!isAdminConfigured()) {
    return fail("Consent is not configured on this deployment.", 503);
  }

  let body: { dob?: string; role?: string; purposes?: string[] };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return fail("Expected a JSON body.", 400);
  }

  const dob = String(body.dob ?? "");

  /* One age rule, in lib/consent/age.ts.
   *
   * This route used to divide by 365.25, which is close enough almost always
   * and wrong on exactly the day it decides whether a parent must be asked. */
  if (!plausibleDob(dob)) {
    return fail("That date does not look right. Please use YYYY-MM-DD.", 400);
  }

  const years = ageFrom(new Date(dob));

  const admin = createAdminClient();

  /* Under 18 is not an error and must not be one — it is the ordinary case.
     The DOB is stored either way, and the caller is told to go the parental
     route. Refusing to store it would mean asking again on the next screen. */
  if (years < ADULT_AGE) {
    await admin.from("profiles").update({ dob }).eq("id", user.value);

    return NextResponse.json({
      adult: false,
      next: "/parent-consent",
      note: "Under 18, so a parent\u2019s permission is needed.",
    });
  }

  /* Two roles are storable, and 'parent' is no longer one of them: a parent
     does not have an account at all, they consent from a link on their phone.
     Anything unrecognised falls to student, which is the least privileged of
     the two and the only safe direction for a default. See lib/roles.ts. */
  const role: StoredRole = isStoredRole(body.role) ? body.role : "student";

  await admin
    .from("profiles")
    .update({
      dob,
      /* No is_minor to write: it is derived from dob at read time. */
      account_state: "active",
      /* Stored as itself. It used to be squashed into "parent" because the
         column only had two values, which meant a teacher revisiting the gate
         was sent to the parent screen instead of their classes.

         This grants nothing: teaching is org_members plus sections.teacher_id,
         re-checked by teaches_section() on every call. This only decides which
         screen they land on. */
      role,
    })
    .eq("id", user.value);

  /* Rows for every purpose, including the optional ones the caller declined.
     Same shape as a parent's grant, so the privacy screen and any later audit
     read one table rather than two code paths. */
  const chosen = new Set(
    (body.purposes ?? PURPOSES.filter((purpose) => purpose.required).map((p) => p.key)).map(
      String,
    ),
  );

  const forwarded = request.headers.get("x-forwarded-for") ?? "";

  await admin.from("consents").insert(
    PURPOSES.map((purpose) => ({
      student_id: user.value,
      parent_id: user.value,
      purpose: purpose.key,
      granted: purpose.required || chosen.has(purpose.key),
      method: "self_adult",
      policy_version: POLICY_VERSION,
      evidence: {
        declared_dob: dob,
        role,
        shown: { key: purpose.key, label: purpose.label, detail: purpose.detail },
      },
      ip: forwarded.split(",")[0]?.trim() || null,
      user_agent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
    })),
  );


  return NextResponse.json({
    adult: true,
    role,
    /* A teacher is finished; a student still has revision setup to do. */
    next: role === "teacher" ? "/teacher" : "/onboarding",
  });
}
