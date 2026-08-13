/* Proving that the person consenting is the parent.
 *
 * ---------------------------------------------------------------------------
 * WHAT "VERIFIABLE" CAN AND CANNOT MEAN HERE
 *
 * The DPDP Act asks for verifiable parental consent. Nothing an app can do
 * proves that the human holding a phone is a child's parent — a tick-box on
 * the child's own screen certainly does not, because the child ticks it.
 *
 * What is achievable is possession of a phone number the child could not use
 * alone, plus a record of what was shown and agreed. So:
 *
 *   1  The student enters a parent's number.
 *   2  A one-time code and a single-use link go to THAT number.
 *   3  The parent either opens the link on their own phone, or reads the code
 *      to the child when they are sitting together.
 *   4  Either way the code is checked against a hash, and the grant is stored
 *      with the phone, the policy version, the IP and the time.
 *
 * That is the same standard Indian banking and payments use for consent, and
 * it is defensible. It is not proof of parentage and this file does not
 * pretend otherwise — which is why `method` is stored on every consent row.
 *
 * ---------------------------------------------------------------------------
 * WHY ONLY A HASH IS STORED
 *
 * A table of live codes is a table that completes consents on behalf of
 * parents. Anyone who can read the database — a support engineer, a leaked
 * backup, a misconfigured read replica — could authorise processing of a
 * child's data. The hash costs nothing and removes that entirely. */

import "server-only";

import { createHash, randomInt, timingSafeEqual } from "node:crypto";

import { createAdminClient } from "@/lib/supabase/admin";

/* Six digits. Long enough that guessing is hopeless within the attempt limit,
   short enough to read aloud across a room, which is the common case. */
const CODE_LENGTH = 6;
const MAX_ATTEMPTS = 5;

export type Challenge = {
  id: string;
  studentId: string;
  phone: string;
  expiresAt: string;
};

function hash(code: string, salt: string) {
  /* Salted with the challenge id so two identical codes issued at the same
     moment do not share a hash, and a precomputed table of a million six-digit
     hashes is useless. */
  return createHash("sha256").update(`${salt}:${code}`).digest("hex");
}

/* Indian mobile numbers, normalised to E.164. Accepts the four ways people
   type them — 98765 43210, 9876543210, 09876543210, +91 98765 43210 — because
   rejecting a valid number over a space is how a parent gives up. */
export function normalisePhone(input: string): string | null {
  const digits = input.replace(/\D/g, "");

  const local =
    digits.length === 10
      ? digits
      : digits.length === 11 && digits.startsWith("0")
        ? digits.slice(1)
        : digits.length === 12 && digits.startsWith("91")
          ? digits.slice(2)
          : null;

  if (!local || !/^[6-9]\d{9}$/.test(local)) return null;
  return `+91${local}`;
}

export async function createChallenge(input: {
  studentId: string;
  phone: string;
  purpose?: string;
}): Promise<{ challenge: Challenge; code: string } | null> {
  const admin = createAdminClient();

  /* Rate limit per student, not per phone: a phone number is chosen by the
     attacker and a student id is not. Three in fifteen minutes covers a
     genuine "it did not arrive, send again" twice over. */
  const { count } = await admin
    .from("otp_challenges")
    .select("id", { count: "exact", head: true })
    .eq("student_id", input.studentId)
    .gte("created_at", new Date(Date.now() - 15 * 60000).toISOString());

  if ((count ?? 0) >= 3) return null;

  /* randomInt, not Math.random: this is a credential. */
  const code = String(randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, "0");

  const { data, error } = await admin
    .from("otp_challenges")
    .insert({
      student_id: input.studentId,
      phone: input.phone,
      purpose: input.purpose ?? "parent_consent",
      /* Hashed with a placeholder, then rewritten with the real row id below —
         the salt has to be the id and the id does not exist until the insert
         returns. */
      code_hash: "pending",
    })
    .select("id, student_id, phone, expires_at")
    .maybeSingle();

  if (error || !data) return null;

  await admin
    .from("otp_challenges")
    .update({ code_hash: hash(code, data.id as string) })
    .eq("id", data.id);

  return {
    code,
    challenge: {
      id: data.id as string,
      studentId: data.student_id as string,
      phone: data.phone as string,
      expiresAt: data.expires_at as string,
    },
  };
}

export type VerifyResult =
  | { ok: true; challenge: Challenge }
  | { ok: false; reason: "not_found" | "expired" | "used" | "too_many" | "wrong" };

export async function verifyChallenge(
  challengeId: string,
  code: string,
): Promise<VerifyResult> {
  const admin = createAdminClient();

  const { data } = await admin
    .from("otp_challenges")
    .select("id, student_id, phone, code_hash, attempts, expires_at, consumed_at")
    .eq("id", challengeId)
    .maybeSingle();

  if (!data) return { ok: false, reason: "not_found" };
  if (data.consumed_at) return { ok: false, reason: "used" };
  if (new Date(data.expires_at as string).getTime() < Date.now()) {
    return { ok: false, reason: "expired" };
  }
  if ((data.attempts as number) >= MAX_ATTEMPTS) return { ok: false, reason: "too_many" };

  /* The attempt is counted before the comparison, so a crash between the two
     cannot hand an attacker a free guess. */
  await admin
    .from("otp_challenges")
    .update({ attempts: (data.attempts as number) + 1 })
    .eq("id", challengeId);

  const expected = Buffer.from(data.code_hash as string, "utf8");
  const actual = Buffer.from(hash(code.replace(/\D/g, ""), challengeId), "utf8");

  /* Constant time. The window is small but it is free to close. */
  const same =
    expected.length === actual.length && timingSafeEqual(expected, actual);

  if (!same) return { ok: false, reason: "wrong" };

  /* Single use, and consumed before the consent is written: a replay must not
     be able to re-grant a consent that was later withdrawn. */
  await admin
    .from("otp_challenges")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", challengeId);

  return {
    ok: true,
    challenge: {
      id: data.id as string,
      studentId: data.student_id as string,
      phone: data.phone as string,
      expiresAt: data.expires_at as string,
    },
  };
}

/* Shown back to the student as "code sent to 98765 4••••" so they can tell
   whether they typed their own number by mistake, without the screen becoming
   a way to read a number they did not already know. */
export function maskPhone(phone: string) {
  const digits = phone.replace(/\D/g, "").slice(-10);
  return `${digits.slice(0, 5)} ${digits.slice(5, 6)}••••`;
}
