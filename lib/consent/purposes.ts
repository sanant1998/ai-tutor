/* What a parent is actually being asked to agree to.
 *
 * One list, read by the consent screen, the API that records a grant, and the
 * gate that checks one before a lesson starts. A purpose that exists on the
 * screen and not in the gate is a promise nobody keeps; a purpose in the gate
 * and not on the screen is processing nobody agreed to.
 *
 * ---------------------------------------------------------------------------
 * WHY THE LIST IS GRANULAR AND WHY MARKETING IS NOT ON IT
 *
 * "I agree to the terms" is not consent to anything specific, and the DPDP Act
 * asks for consent that is informed and purpose-bound. So each purpose is a
 * separate decision, written in the language the parent speaks, saying what is
 * processed and why.
 *
 * Two are required — without an account and without sending a child's messages
 * to a model, there is no product to consent to. The other two are genuinely
 * optional and the app works with both refused.
 *
 * There is no marketing or advertising purpose. Behavioural advertising and
 * tracking directed at children is prohibited outright, so the honest design
 * is the absence of the checkbox rather than one that starts unticked. If this
 * list ever grows a fifth entry, that is the question to ask about it.
 *
 * No "server-only": the consent screen is a client component and must render
 * exactly these strings. */

export type PurposeKey = "account" | "ai_processing" | "voice";

export type Purpose = {
  key: PurposeKey;
  required: boolean;
  /* Shown to the parent, in Hinglish, because the parent reading this on a
     phone in Kanpur is the person the wording has to work for. */
  label: string;
  /* What is actually processed, and for how long. Vagueness here is what makes
     a consent uninformed. */
  detail: string;
};

/* Written in the plainest English available, not in legal English.
 *
 * These moved from Hinglish with the rest of the product, and this is the one
 * place where that is a decision worth flagging rather than a translation. The
 * DPDP Act asks for consent that is informed, and a parent who reads the words
 * more comfortably in Hinglish is better informed by Hinglish, whatever the
 * rest of the app is in.
 *
 * So: short sentences, no legal register, concrete about what is stored and
 * for how long. If a pilot shows parents skipping these, the answer is not
 * shorter English — it is putting these three strings through the same
 * language switch the tutor already has. */
export const PURPOSES: Purpose[] = [
  {
    key: "account",
    required: true,
    label: "Create an account and keep a record of their study",
    detail:
      "Name, class, board and study progress are stored so your child can pick up where they left off. Everything is deleted 30 days after the account is closed.",
  },
  {
    key: "ai_processing",
    required: true,
    label: "Send their questions to the AI tutor",
    detail:
      "What your child types is sent to an AI model so it can answer. These conversations are deleted automatically after 24 months.",
  },
  {
    key: "voice",
    required: false,
    label: "Ask questions by voice (microphone)",
    detail:
      "Your child can ask questions out loud. The recording is deleted within 30 days; only the written text is kept. You can leave this switched off.",
  },
  /* There is no 'analytics' purpose, and its absence is the design.
   *
   * A box asking a parent's permission for usage data only belongs here if
   * refusing it changes what is stored about their child. It did not: nothing
   * ever read the user id on an analytics event, and the browser collector
   * wrote it without consulting this list at all. So the box asked for
   * permission that was neither needed nor honoured — the worst possible
   * combination, because it makes a consent screen look thorough while being
   * decorative.
   *
   * The events are counts now, with nobody's identity attached, and usage data
   * is something the platform team reads on /admin/health. Under the DPDP Act
   * the safest design for a purpose you do not need is not an unticked box; it
   * is the absence of the box, exactly as with marketing. */
];

export const REQUIRED_PURPOSES = PURPOSES.filter((purpose) => purpose.required).map(
  (purpose) => purpose.key,
);

export function isPurpose(value: string): value is PurposeKey {
  return PURPOSES.some((purpose) => purpose.key === value);
}

/* Bumped whenever the privacy policy or this list changes in a way that
   affects what a parent agreed to. Consents are stored against it, so an old
   grant can be told apart from a current one — and a policy change can force a
   re-ask for the purposes it touched rather than for all of them.

   Changing the wording of a detail line is a version bump. Fixing a typo is
   not. If unsure, bump it: a needless re-ask costs a parent ten seconds. */
export const POLICY_VERSION = "2026-08-12";

/* Where a parent complains, which the DPDP Act requires be published and
   reachable. Read by the consent screen and the privacy policy page so the two
   cannot disagree. */
export const GRIEVANCE_OFFICER = {
  name: process.env.NEXT_PUBLIC_GRIEVANCE_OFFICER_NAME ?? "",
  email: process.env.NEXT_PUBLIC_GRIEVANCE_OFFICER_EMAIL ?? "",
  /* Statutory maximum for a response. */
  respondsWithinDays: 30,
};

export function grievanceConfigured() {
  return Boolean(GRIEVANCE_OFFICER.name && GRIEVANCE_OFFICER.email);
}
