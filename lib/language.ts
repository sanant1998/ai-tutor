/* Which language the tutor teaches in.
 *
 * ---------------------------------------------------------------------------
 * THIS FIELD EXISTED AND DID NOTHING
 *
 * `language` has been on the subjects table and in the student snapshot since
 * the first migration, it was interpolated into the prompt as a bare string,
 * and the system prompt hard-coded one voice regardless. A student set to
 * hi-IN got the same Hinglish as everyone else. A column that is read and
 * ignored is worse than one that does not exist: it looks like a feature in
 * every code review.
 *
 * ---------------------------------------------------------------------------
 * WHY HINGLISH IS THE DEFAULT AND NOT ENGLISH
 *
 * It is what these students actually speak. "Iska additive inverse kya hoga"
 * is one sentence made of two languages, and a tutor that answers in careful
 * English is asking a thirteen-year-old to translate their own confusion
 * before they can express it.
 *
 * The other two exist because the audience is not uniform. A student in a
 * Hindi-medium school reads Devanagari faster than Latin-script Hinglish; a
 * student in an English-medium metro school may find Hinglish patronising. The
 * cost of offering all three is one instruction block.
 *
 * ---------------------------------------------------------------------------
 * WHAT DOES NOT CHANGE WITH LANGUAGE
 *
 * The mathematics, the content pack, and the misconceptions. Those are written
 * once and delivered in whichever language — which is only possible because
 * the tutor does not invent its material. Translating a curriculum is a
 * content job; translating a delivery style is a prompt.
 *
 * No "server-only": the settings screen renders these labels. */

export type LanguageId = "hinglish" | "hi-IN" | "en-IN";

export type Language = {
  id: LanguageId;
  /* Shown in the picker, in the language itself — a student who cannot read
     the label cannot choose the language. */
  label: string;
  hint: string;
  /* Appended to the system prompt. The only thing that actually changes. */
  instruction: string;
};

export const LANGUAGES: Language[] = [
  {
    id: "hinglish",
    label: "Hinglish",
    hint: "Simple English + Hindi words — jaise dost samjhaata hai",
    instruction: `LANGUAGE: Hinglish.
Simple English sentences with the Hindi words a student actually uses — matlab, socho, dekho, chalo, samajh aaya, bilkul, thoda. Latin script throughout. Not formal Hindi, not academic English. Write the way an older sibling explains something across a table.`,
  },
  {
    id: "hi-IN",
    label: "हिन्दी",
    hint: "पूरी बातचीत हिन्दी में",
    instruction: `LANGUAGE: Hindi, in Devanagari.
Write in everyday spoken Hindi, not textbook Hindi. Keep the mathematical terms the student will meet in their exam — additive inverse, rational number, distributive law — in English, because those are the words on their paper and translating them helps in the lesson and hurts in the exam. Everything else in Devanagari.`,
  },
  {
    id: "en-IN",
    label: "English",
    hint: "Plain Indian English, no Hindi",
    instruction: `LANGUAGE: Indian English.
Plain, warm, simple English. No Hindi words at all. Short sentences. Indian conventions throughout — lakh and crore, rupees, Indian names and settings in any example you are given.`,
  },
];

export const DEFAULT_LANGUAGE: LanguageId = "hinglish";

export function isLanguage(value: string): value is LanguageId {
  return LANGUAGES.some((language) => language.id === value);
}

export function languageOf(value: string | null | undefined): Language {
  const found = LANGUAGES.find((language) => language.id === value);
  return found ?? LANGUAGES[0];
}

/* The block appended to the system prompt.
 *
 * Appended rather than interpolated into the middle: the system prompt is
 * marked cacheable, and a variable in its body would make every student's
 * first call a cache miss. A suffix keeps the long shared prefix identical. */
export function languageInstruction(value: string | null | undefined): string {
  return languageOf(value).instruction;
}

/* What the fixed replies say — the safety redirects, the turn-limit message,
   the paywall. These are written by us and never by a model, so they need a
   translation rather than an instruction.

   Only the ones a student sees mid-lesson are here. Screens have their own
   copy and are a bigger job; this is the set where a sudden switch of language
   is most jarring, because it lands in the middle of a conversation. */
export const FIXED_REPLIES: Record<
  LanguageId,
  { turnLimit: string; timeLimit: string; offTopic: string; answerBegging: string }
> = {
  hinglish: {
    turnLimit:
      "Is concept pe kaafi baat ho gayi. Chalo isko yahin rakhte hain aur practice pe chalte hain — ye topic phir aayega.",
    timeLimit:
      "Kaafi der se padh rahe ho — thoda break lo. Main yahin hoon, wapas aakar isi jagah se shuru karenge.",
    offTopic:
      "Ye is chapter se bahar ka sawal hai. Abhi hum jo concept kar rahe hain usi pe focus karte hain — baaki baatein baad me!",
    answerBegging:
      "Answer bata dunga to samajh nahi aayega — aur agli baar exam me yahi sawal aaya to phir wahi dikkat. Ek hint deta hoon, tum khud try karo.",
  },
  "hi-IN": {
    turnLimit:
      "इस concept पर काफ़ी बात हो गई। चलो इसे यहीं रखते हैं और practice पर चलते हैं — यह topic फिर आएगा।",
    timeLimit:
      "काफ़ी देर से पढ़ रहे हो — थोड़ा break लो। मैं यहीं हूँ, वापस आकर इसी जगह से शुरू करेंगे।",
    offTopic:
      "यह इस chapter से बाहर का सवाल है। अभी हम जो concept कर रहे हैं उसी पर ध्यान देते हैं — बाकी बातें बाद में!",
    answerBegging:
      "Answer बता दूँगा तो समझ नहीं आएगा — और अगली बार exam में यही सवाल आया तो फिर वही दिक्कत। एक hint देता हूँ, तुम खुद try करो।",
  },
  "en-IN": {
    turnLimit:
      "We have spent a good while on this concept. Let us leave it here and move to practice — this topic will come back.",
    timeLimit:
      "You have been at this a long time — take a short break. I will be here, and we will start from exactly this spot.",
    offTopic:
      "That is outside this chapter. Let us stay with the concept we are on — the rest can wait!",
    answerBegging:
      "If I give you the answer it will not stick, and the same question in the exam will be the same problem. Here is a hint; you try it.",
  },
};
