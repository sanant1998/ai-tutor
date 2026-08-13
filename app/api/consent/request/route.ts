/* Step one of parental consent: get a code to the parent's phone.
 *
 * Called by the student, who is signed in but whose account is locked in
 * pending_consent and can do nothing else until this completes. */

import { NextResponse } from "next/server";

import { fail, requireUser } from "@/lib/ai/route";
import { plausibleDob } from "@/lib/consent/age";
import { createChallenge, maskPhone, normalisePhone } from "@/lib/consent/otp";
import { callerIp, LIMIT_MESSAGE, takeLimit } from "@/lib/ratelimit";
import { sendConsentCode } from "@/lib/messaging/send";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await requireUser();
  if (!user.ok) return user.response;

  if (!isAdminConfigured()) {
    return fail("Consent is not configured on this deployment.", 503);
  }

  /* Per IP, on top of the three-per-fifteen-minutes per student inside
     createChallenge. Accounts are free, so a per-account limit alone does not
     bound what one person can make us spend on SMS. */
  const limit = await takeLimit("consent_request", callerIp(request));
  if (!limit.allowed) return fail(LIMIT_MESSAGE, 429);

  let body: { phone?: string; relation?: string; dob?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return fail("Expected a JSON body.", 400);
  }

  const phone = normalisePhone(String(body.phone ?? ""));
  if (!phone) {
    return fail("Ye number theek nahi lag raha. 10 ank ka mobile number daalo.", 400);
  }

  const admin = createAdminClient();

  /* The date of birth is captured here rather than at signup because it is
     only needed once there is a consent to attach it to — and asking for it on
     the signup form, before anyone has said why, is the kind of collection the
     Act is about. */
  if (body.dob) {
    /* A four-year-old and a hundred-year-old are both typos, and a wrong date
       of birth decides whether consent is required at all. Same rule as every
       other place that asks — see lib/consent/age.ts. */
    if (!plausibleDob(body.dob)) {
      return fail("Ye date theek nahi lag rahi. Dobara check karo.", 400);
    }

    await admin.from("profiles").update({ dob: body.dob }).eq("id", user.value);
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("first_name, dob")
    .eq("id", user.value)
    .maybeSingle();

  if (!profile?.dob) {
    return fail("Pehle date of birth batao.", 400);
  }

  /* Not a hard block — on a family phone the number genuinely is shared — but
     worth telling the student when the number they typed is the one already on
     their own account, because the common case is a child consenting for
     themselves rather than a shared handset.
     
     The previous version of this looked up the caller's own profile by the
     caller's own id and therefore always reported "yes", which is worse than
     not checking at all. */
  const selfNumber = await isCallersOwnNumber(admin, user.value, phone);

  const issued = await createChallenge({ studentId: user.value, phone });

  if (!issued) {
    return fail(
      "Bahut baar try kar liya. 15 minute baad dobara koshish karo.",
      429,
    );
  }

  const origin =
    process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin;

  const link = `${origin}/consent/${issued.challenge.id}`;

  const sent = await sendConsentCode({
    phone,
    studentName: (profile.first_name as string) || "aapke bachche",
    code: issued.code,
    link,
  });

  return NextResponse.json({
    challengeId: issued.challenge.id,
    sentTo: maskPhone(phone),
    expiresAt: issued.challenge.expiresAt,
    delivered: sent.ok,
    /* Unconfigured messaging must not look like a delivered message. In
       development the code comes back so the flow can be walked end to end;
       in production it never does, whatever the gateway did. */
    devCode:
      process.env.NODE_ENV === "production" ? undefined : issued.code,
    note: sent.ok
      ? undefined
      : "Message nahi ja paaya. Parent ke saath baithe ho to screen pe dikhaya gaya code use karo.",
    /* Surfaced, not enforced. The screen says "ye tumhara hi number lag raha
       hai" and lets them continue — refusing outright would break the shared
       family phone, which is the common case in this market. */
    selfNumber,
  });
}

/* Whether this phone is the one on the caller's own auth record. */
async function isCallersOwnNumber(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  phone: string,
): Promise<boolean> {
  try {
    const { data } = await admin.auth.admin.getUserById(userId);
    const own = data.user?.phone;
    return Boolean(own) && `+${String(own).replace(/^\+/, "")}` === phone;
  } catch {
    return false;
  }
}
