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
  options: { beat: string; answer?: string | null },
): OutputProblem {
  if (LEAK_MARKERS.some((marker) => marker.test(text))) return "prompt_leak";

  if (options.beat === "CHECK" && options.answer) {
    if (containsAnswer(text, options.answer)) return "answer_leak";
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
  if (!needle) return false;

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

function normalise(value: string) {
  return value
    .replace(/\\left|\\right/g, "")
    .replace(/\\d?frac\s*\{\s*(-?\d+)\s*\}\s*\{\s*(-?\d+)\s*\}/g, "$1/$2")
    .replace(/[$\\{}\s]/g, "")
    .toLowerCase();
}
