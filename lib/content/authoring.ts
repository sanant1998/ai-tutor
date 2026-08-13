/* How a concept pack gets written, and what one has to contain.
 *
 * Shared by the two things that draft content: scripts/author-concept.ts, run
 * by the platform team one concept at a time, and the chapter import a teacher
 * uses from /admin/content. They were going to end up with two copies of this
 * prompt, and two copies of an authoring prompt is two different products —
 * the same chapter drafted from the CLI and from the console would come back
 * in different voices, with different ideas about what a misconception is.
 *
 * No "server-only": this is a string and a schema, and the CLI imports it
 * under plain node. */

export const AUTHOR_SYSTEM = `You are a CBSE curriculum author writing teaching material for Class 8 Mathematics, for a one-to-one tutoring app used by Indian school students.

You are writing a CONTENT PACK. It is not a lesson and not an explanation — it is the raw material a tutor will teach from, so every field has to stand on its own.

HARD REQUIREMENTS

hook
- One relatable, everyday Indian situation: money and udhaar, cricket, a lift, a bus, food, marks, a shop. Never a Western example, never an abstract one.
- Ends with a curiosity question. Never states the definition.

misconceptions — exactly 4
- These must be errors REAL Class 8 students make, not hypothetical ones. If you are inventing a plausible-sounding error rather than recalling a common one, you are doing this wrong.
- Each needs: wrong_belief (in the student's own voice), why_wrong (an explanation, not a restatement), correction (the one line worth remembering), probe (a question that surfaces exactly this error).
- Number them m1, m2, m3, m4.

worked_examples — exactly 2
- Numbered steps. Every step is a real step, not "now solve it".
- CHECK EVERY CALCULATION. A wrong sum here is worse than no example.

language
- Simple English with the Hindi words a student actually uses: matlab, socho, dekho, chalo, samajh. Not formal Hindi. Not academic English.
- All mathematics in LaTeX between $...$.

Return the pack by calling the tool. Write nothing else.`;

/* The extra paragraph the chapter import adds on top.
 *
 * The difference between the two callers is not the house style, it is where
 * the material comes from: the CLI is told a concept name and works from what
 * the model knows, and the import is given the actual pages of a textbook and
 * must not wander off them. A teacher who uploads their chapter and gets back
 * a pack about something adjacent has been given work to check rather than
 * work to use. */
export const IMPORT_SYSTEM = `${AUTHOR_SYSTEM}

YOU HAVE BEEN GIVEN THE ACTUAL CHAPTER TEXT.

- Split it into the concepts it genuinely teaches — usually two to five. A concept is one idea a student can be checked on, not a section heading and not a whole chapter.
- Stay inside the text you were given. Do not add a topic because it usually appears near this one; if the chapter does not teach it, it is not in this chapter.
- The misconceptions must be the ones THIS material produces. Where the text itself warns about a common error, that is the strongest possible source for one.
- Extracted text from a PDF loses layout, and mathematics suffers most: fractions arrive flattened, symbols go missing. Where a passage is too mangled to be sure what it says, leave that concept out rather than guessing at it.
- Order the concepts the way the chapter teaches them.`;

/* One concept, as the model must return it. Mirrors lib/content/pack.ts's
   Concept minus the fields the caller supplies (id, seq, topicRef). */
export const CONCEPT_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    statement: { type: "string", description: "The crisp definition. One or two sentences." },
    hook: { type: "string" },
    analogies: {
      type: "array",
      items: {
        type: "object",
        properties: { id: { type: "string" }, text: { type: "string" } },
        required: ["id", "text"],
      },
    },
    formulas: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          latex: { type: "string" },
          note: { type: "string" },
        },
        required: ["id", "latex"],
      },
    },
    misconceptions: {
      type: "array",
      minItems: 4,
      maxItems: 4,
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          wrong_belief: { type: "string" },
          why_wrong: { type: "string" },
          correction: { type: "string" },
          probe: { type: "string" },
        },
        required: ["id", "wrong_belief", "why_wrong", "correction", "probe"],
      },
    },
    worked_examples: {
      type: "array",
      minItems: 2,
      maxItems: 2,
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          problem: { type: "string" },
          steps: { type: "array", items: { type: "string" } },
          answer: { type: "string" },
        },
        required: ["id", "problem", "steps", "answer"],
      },
    },
  },
  required: ["title", "statement", "hook", "misconceptions", "worked_examples"],
} as const;

/* What the import returns: several concepts, plus what the model thinks the
   chapter is called. The title is asked for rather than taken from the
   filename — "ch3_final_v2.pdf" is not a chapter name. */
export const IMPORT_SCHEMA = {
  type: "object",
  properties: {
    chapterTitle: {
      type: "string",
      description: "The chapter's own title, as printed in the text.",
    },
    concepts: {
      type: "array",
      minItems: 1,
      maxItems: 6,
      items: CONCEPT_SCHEMA,
    },
  },
  required: ["chapterTitle", "concepts"],
} as const;
