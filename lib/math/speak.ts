/* Turning a tutor's message into something a voice can read aloud.
 *
 * ---------------------------------------------------------------------------
 * THIS IS THE WHOLE DIFFICULTY OF SPEECH IN A MATHS APP
 *
 * Hand `$\frac{5}{8}$ ka additive inverse kya hai?` to any text-to-speech
 * engine and a student hears "dollar backslash frac five eight dollar ka
 * additive inverse kya hai". The feature is not "call a TTS API"; the feature
 * is this file.
 *
 * ---------------------------------------------------------------------------
 * SAY IT THE WAY A TEACHER SAYS IT
 *
 * An Indian classroom does not say "five eighths". It says "paanch bataa
 * aath" — literally "five divided by eight" — and the same teacher writing in
 * English says "five by eight". Neither is what a Western TTS convention would
 * produce, and getting it wrong makes the voice sound like a machine reading a
 * textbook rather than a person explaining.
 *
 * So the fraction form is chosen by the student's language, and the same rule
 * runs through minus signs, powers and the multiplication symbol.
 *
 * ---------------------------------------------------------------------------
 * WHEN IN DOUBT, DROP IT
 *
 * An expression this cannot render is replaced with a short phrase rather than
 * being read literally. A student who hears "ye dekho" and looks at the screen
 * has lost nothing; a student who hears forty seconds of backslashes has
 * learned that the button does not work. */

import type { LanguageId } from "@/lib/language";

type Words = {
  over: string;
  minus: string;
  plus: string;
  times: string;
  equals: string;
  squared: string;
  cubed: string;
  toThe: string;
  lookAtScreen: string;
};

const WORDS: Record<LanguageId, Words> = {
  hinglish: {
    /* "paanch bataa aath". What a teacher actually says at a blackboard in
       most of India, and what a student will repeat back. */
    over: " bataa ",
    minus: "minus ",
    plus: " plus ",
    times: " into ",
    equals: " barabar ",
    squared: " ka square",
    cubed: " ka cube",
    toThe: " ki power ",
    lookAtScreen: "ye wala",
  },
  "hi-IN": {
    over: " बटा ",
    minus: "माइनस ",
    plus: " प्लस ",
    times: " गुणा ",
    equals: " बराबर ",
    squared: " का वर्ग",
    cubed: " का घन",
    toThe: " की घात ",
    lookAtScreen: "यह वाला",
  },
  "en-IN": {
    /* "five by eight" — Indian English, not "five eighths". */
    over: " by ",
    minus: "minus ",
    plus: " plus ",
    times: " into ",
    equals: " equals ",
    squared: " squared",
    cubed: " cubed",
    toThe: " to the power ",
    lookAtScreen: "this one",
  },
};

/* --------------------------------------------------------------------------
   One expression
   -------------------------------------------------------------------------- */
export function speakExpression(latex: string, language: LanguageId): string | null {
  const words = WORDS[language] ?? WORDS.hinglish;

  let text = latex;

  /* Innermost fractions first, so a nested one resolves outward rather than
     leaving a stray brace. Six passes is far more than school maths needs. */
  for (let pass = 0; pass < 6; pass += 1) {
    const next = text.replace(
      /\\d?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g,
      (_, top: string, bottom: string) => `${top}${words.over}${bottom}`,
    );
    if (next === text) break;
    text = next;
  }

  text = text
    .replace(/\\left|\\right/g, "")
    .replace(/\\times|\\cdot/g, words.times)
    .replace(/\\div/g, words.over)
    .replace(/\\neq/g, language === "hi-IN" ? " बराबर नहीं " : " not equal to ")
    .replace(/\\approx/g, language === "hi-IN" ? " लगभग " : " approximately ")
    /* Powers, before the general cleanup strips the braces. */
    .replace(/\^\s*\{?\s*2\s*\}?/g, words.squared)
    .replace(/\^\s*\{?\s*3\s*\}?/g, words.cubed)
    .replace(/\^\s*\{?\s*(-?\d+)\s*\}?/g, `${words.toThe}$1`)
    .replace(/\s*=\s*/g, words.equals)
    .replace(/\s*\+\s*/g, words.plus)
    /* A leading minus is "minus five"; an infix one is "five minus three". The
       distinction matters because "5 minus 3" and "minus 5, 3" are different
       sentences. */
    .replace(/(^|[(\s])-\s*/g, `$1${words.minus}`)
    .replace(/\s*-\s*/g, ` ${words.minus}`)
    .replace(/[{}$\\]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  /* Anything left that is not a word, a number or ordinary punctuation means
     notation this does not handle — a root, an integral, a matrix. Better to
     say nothing than to read symbols aloud. */
  if (/[\^_&|~<>\[\]]/.test(text)) return null;
  if (!text) return null;

  return text;
}

/* --------------------------------------------------------------------------
   A whole message
   -------------------------------------------------------------------------- */
export function speakable(body: string, language: LanguageId): string {
  const words = WORDS[language] ?? WORDS.hinglish;

  let text = body
    /* Bold markers are for eyes. */
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    /* Bullets read as "dash" otherwise. */
    .replace(/^\s*[-•]\s*/gm, "");

  text = text.replace(/\$([^$]+)\$/g, (_, expression: string) => {
    const spoken = speakExpression(expression, language);
    return spoken ?? words.lookAtScreen;
  });

  return (
    text
      /* A numbered step wants a pause after it, not a full stop that the voice
         swallows. */
      .replace(/^(\s*\d+)\.\s*/gm, "$1, ")
      .replace(/\n{2,}/g, ". ")
      .replace(/\n/g, ". ")
      .replace(/\.\s*\./g, ".")
      .replace(/\s+/g, " ")
      .trim()
  );
}

/* Speech is billed per character and a runaway message is a runaway bill.
   Nothing the tutor writes should approach this — the prompt caps replies at
   200 words — so hitting it means something else went wrong. */
export const MAX_SPOKEN_CHARS = 1200;
