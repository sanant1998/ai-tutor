/* Step two: the parent agrees, and the account opens.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS ROUTE IS NOT SIGNED IN
 *
 * The parent is not a user of this app. They are a person holding a phone that
 * received a link, and requiring them to create an account first would mean
 * the consent never gets given — which locks the child out of a product their
 * parent has already paid for.
 *
 * The challenge id in the URL is unguessable, single-use, five minutes old and
 * was delivered to the number the student named. That, plus the code, is the
 * authorisation. It is the same standard used for a UPI mandate.
 *
 * The consequence is that this route must be careful about what it accepts:
 * the student id comes from the challenge row and never from the request, so
 * a valid code for one child cannot consent for another. */

import { NextResponse } from "next/server";

import { fail } from "@/lib/ai/route";
import { verifyChallenge } from "@/lib/consent/otp";
import {
  isPurpose,
  POLICY_VERSION,
  PURPOSES,
  REQUIRED_PURPOSES,
  type PurposeKey,
} from "@/lib/consent/purposes";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isAdminConfigured()) {
    return fail("Consent is not configured on this deployment.", 503);
  }

  let body: {
    challengeId?: string;
    code?: string;
    purposes?: string[];
    relation?: string;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return fail("Expected a JSON body.", 400);
  }

  const challengeId = String(body.challengeId ?? "");
  const code = String(body.code ?? "");

  if (!challengeId || !code) return fail("Code aur link dono chahiye.", 400);

  const verified = await verifyChallenge(challengeId, code);

  if (!verified.ok) {
    const message: Record<typeof verified.reason, string> = {
      not_found: "Ye link theek nahi hai.",
      expired: "Code ki samay-seema khatam ho gayi. Naya code maango.",
      used: "Ye code pehle hi use ho chuka hai.",
      too_many: "Bahut baar galat code daala gaya. Naya code maango.",
      wrong: "Code galat hai. Dobara dekho.",
    };

    /* 410 for a spent or expired challenge so the screen can offer "send
       again" rather than "try again", which are different actions. */
    const status =
      verified.reason === "wrong" ? 401 : verified.reason === "not_found" ? 404 : 410;

    return fail(message[verified.reason], status);
  }

  /* --- What was agreed to ---------------------------------------------- */
  const asked = (body.purposes ?? []).filter((purpose): purpose is PurposeKey =>
    isPurpose(purpose),
  );

  const missing = REQUIRED_PURPOSES.filter((purpose) => !asked.includes(purpose));

  if (missing.length > 0) {
    return fail(
      "Account aur AI processing — in dono ke bina app chal hi nahi sakta. Agar aap sehmat nahi hain to is page ko band kar dijiye; account nahi banega.",
      400,
    );
  }

  const admin = createAdminClient();
  const studentId = verified.challenge.studentId;

  /* A row per purpose, including the refusals. A missing row and a refused one
     mean different things — "never asked" against "asked and said no" — and
     only one of them should ever be re-asked. */
  const forwarded = request.headers.get("x-forwarded-for") ?? "";
  const ip = forwarded.split(",")[0]?.trim() || null;

  const rows = PURPOSES.map((purpose) => ({
    student_id: studentId,
    parent_id: null,
    purpose: purpose.key,
    granted: asked.includes(purpose.key),
    method: "parent_otp",
    policy_version: POLICY_VERSION,
    evidence: {
      challenge_id: challengeId,
      phone: verified.challenge.phone,
      relation: body.relation ?? "parent",
      /* What the parent was actually shown, stored with the grant. A consent
         recorded against a policy version whose text later changed is only
         evidence if the text is recoverable. */
      shown: { key: purpose.key, label: purpose.label, detail: purpose.detail },
    },
    ip,
    user_agent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
  }));

  const { error } = await admin.from("consents").insert(rows);

  if (error) {
    return fail(
      "Consent record nahi ho paayi. Ek baar aur try karo.",
      500,
    );
  }

  /* Cached negative answers from before the grant would otherwise suppress a
     minute of legitimate events. */

  /* Only now does the account open. */
  await admin
    .from("profiles")
    .update({ account_state: "active" })
    .eq("id", studentId);

  const { data: profile } = await admin
    .from("profiles")
    .select("first_name")
    .eq("id", studentId)
    .maybeSingle();

  return NextResponse.json({
    ok: true,
    studentName: (profile?.first_name as string) || "",
    granted: asked,
    refused: PURPOSES.map((purpose) => purpose.key).filter(
      (key) => !asked.includes(key),
    ),
    policyVersion: POLICY_VERSION,
  });
}
