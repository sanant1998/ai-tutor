/* The tutor's reply carries two payloads: prose for the student, and a verdict
   for the server.

   They arrive in one call on purpose. Asking a second time — "given what you
   just said, did the student understand?" — doubles the latency of every turn
   and pays twice for the same context, and the student feels all of it. So the
   model is told to end its reply with a <verdict> block, the sanitizer holds
   that block back from the stream, and this file parses it afterwards.

   The parse must never throw. A verdict is an input to a decision the server
   was going to make anyway; if it is missing or malformed the right outcome is
   "assume the student has not got it yet", which costs one extra reteach. A
   crash costs the session. */

import type { ErrorOutcome } from "@/lib/mastery";

export type Verdict = {
  student_understood: boolean;
  error_type: ErrorOutcome;
  misconception_id: string | null;
  /* 0-1. The state machine ignores a claim of understanding below 0.6 — a
     model that is unsure is usually being agreeable. */
  confidence: number;
  next_hint: string;
};

export const SAFE_DEFAULT: Verdict = {
  student_understood: false,
  error_type: "none",
  misconception_id: null,
  confidence: 0,
  next_hint: "",
};

const ERROR_TYPES: ErrorOutcome[] = [
  "concept",
  "formula",
  "application",
  "calculation",
  "careless",
  "incomplete",
  "blank",
  "guess",
  "none",
];

/* The instruction appended to every teaching prompt. Kept next to the parser
   so the two cannot drift: if the shape changes here it changes there. */
export const VERDICT_INSTRUCTION = `After your reply to the student, and only then, emit exactly one block:

<verdict>{"student_understood": true|false, "error_type": "concept|formula|application|calculation|careless|incomplete|blank|guess|none", "misconception_id": "m1"|null, "confidence": 0.0-1.0, "next_hint": "one short line, max 200 chars"}</verdict>

Rules for the verdict:
- The student never sees it. Do not refer to it, and write nothing after it.
- misconception_id must be one of the ids in the CONTENT PACK, or null. Never invent one.
- student_understood is about THIS reply from the student, not about the topic overall.
- confidence is your own certainty. If the student said something short like "haan" or "ok", you cannot be certain — say so with a low number rather than guessing high.
- error_type is "none" when the student was right or when nothing was assessed.`;

export function extractVerdict(raw: string): Verdict {
  const match = raw.match(/<verdict>([\s\S]*?)<\/verdict>/);

  /* An unclosed block still happens when the model runs into its token limit
     mid-verdict. Take everything after the opening tag and try that too. */
  const body = match?.[1] ?? raw.split("<verdict>")[1];
  if (!body) return SAFE_DEFAULT;

  const json = body.trim().replace(/^```(?:json)?/, "").replace(/```$/, "").trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return SAFE_DEFAULT;
  }

  return coerce(parsed);
}

/* Field by field, because a model that gets four of five right should not have
   all five discarded. A strict schema parse would return the default here and
   throw away a perfectly good misconception id over a confidence of "0.8"
   arriving as a string. */
function coerce(input: unknown): Verdict {
  if (typeof input !== "object" || input === null) return SAFE_DEFAULT;

  const raw = input as Record<string, unknown>;

  const errorType = String(raw.error_type ?? "none").toLowerCase() as ErrorOutcome;

  const confidence = Number(raw.confidence);

  const hint = typeof raw.next_hint === "string" ? raw.next_hint : "";

  return {
    student_understood: raw.student_understood === true,
    error_type: ERROR_TYPES.includes(errorType) ? errorType : "none",
    misconception_id:
      typeof raw.misconception_id === "string" && raw.misconception_id.trim()
        ? raw.misconception_id.trim()
        : null,
    confidence: Number.isFinite(confidence)
      ? Math.min(1, Math.max(0, confidence))
      : 0,
    next_hint: hint.slice(0, 200),
  };
}

/* A misconception id the model made up is worse than none: the fix sheet would
   print a correction for a belief the student was never shown to hold. Checked
   against the pack before the verdict is stored. */
export function pruneUnknownMisconception(
  verdict: Verdict,
  knownIds: string[],
): Verdict {
  if (!verdict.misconception_id) return verdict;
  if (knownIds.includes(verdict.misconception_id)) return verdict;
  return { ...verdict, misconception_id: null };
}
