/* Output-side checks: what the tutor wrote, before the student reads it.

   Separate from gate.ts because these are pure functions over a string, with
   no database and no model behind them — which means they can be unit tested
   under plain node, and they are (scripts/test-core.ts). gate.ts imports
   server-only and Supabase and can be neither.

   Two failures matter:

     prompt_leak   the scaffolding of our own prompt reaching the student. Rare,
                   embarrassing, and a signal that an injection worked.

     answer_leak   the tutor giving away the answer during a CHECK. This one is
                   the quiet product-killer: it never errors, no student
                   reports it, and it turns the app from a tutor into an
                   answer key one turn at a time. */

export type OutputProblem = "prompt_leak" | "answer_leak" | null;

const LEAK_MARKERS = [
  /<content_pack>/i,
  /<student_state>/i,
  /<student_message>/i,
  /<beat_instruction>/i,
  /you are a patient tutor/i,
  /system prompt/i,
];

export function checkOutput(
  text: string,
  options: { beat: string; answers?: readonly string[] | null },
): OutputProblem {
  if (LEAK_MARKERS.some((marker) => marker.test(text))) return "prompt_leak";

  /* A plural, because the tutor writes its own check question rather than
     drawing one from the bank. There is no single "the answer" to compare
     against — the question is whether the reply gave away ANY answer this
     concept is examined on. */
  if (options.beat === "CHECK") {
    for (const answer of options.answers ?? []) {
      if (containsAnswer(text, answer)) return "answer_leak";
    }
  }

  return null;
}

/* Plain substring matching fires on any digit that happens to appear — "Chapter
   14" would count as leaking the answer 4. So the answer is compared as a
   token: both sides normalised into one notation first, because the same value
   is written `-7/9` in the question bank and `$-\frac{7}{9}$` by the tutor, and
   a check that misses the LaTeX form misses every real leak. */
export function containsAnswer(text: string, answer: string): boolean {
  const needle = normalise(answer);
  if (!checkable(needle)) return false;

  const haystack = normalise(text);
  if (!haystack.includes(needle)) return false;

  /* A short answer ("7", "-4") legitimately appears in prose about the
     question, so require it not to be part of a longer number. */
  if (needle.length <= 3) {
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^\\d/.-])${escaped}([^\\d/.]|$)`).test(haystack);
  }

  return true;
}

/* Some "answers" cannot be looked for at all, and searching for them anyway is
   worse than not checking.
 *
 * The one that mattered: a multiple-choice question stores its answer as the
 * OPTION KEY — `["A"]` — not as the value. Passing that in meant the check
 * hunted for a lone "a" in Hinglish prose and found one in almost every reply,
 * so a perfectly good check question was thrown away and replaced by the canned
 * fallback probe. The fix is upstream — resolve the key to the option's text —
 * and this is the guard that stops a bare key ever being used as a needle
 * again. */
function checkable(needle: string): boolean {
  if (!needle) return false;

  /* A single letter is an option key or a variable name, never an answer worth
     searching prose for. Single DIGITS are kept: "0" and "7" are real answers,
     and the word-boundary rule below is what makes them safe to look for. */
  if (needle.length === 1 && !/\d/.test(needle)) return false;

  return true;
}

function normalise(value: string) {
  return value
    .replace(/\\left|\\right/g, "")
    .replace(/\\d?frac\s*\{\s*(-?\d+)\s*\}\s*\{\s*(-?\d+)\s*\}/g, "$1/$2")
    .replace(/[$\\{}\s]/g, "")
    .toLowerCase();
}
