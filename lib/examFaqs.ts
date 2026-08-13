/* The exam-FAQ bank: question prompts only.

   Answers are not stored here. They are written on demand by /api/exam-faqs,
   which resolves a question by id from this list — so the prompt the model
   answers is always one of ours, never text from the browser.

   Those answers are model-written, not lifted from a published mark scheme.
   The page says so plainly, because on this page the difference is the
   difference between marks and no marks. */

export type FaqQuestion = {
  id: string;
  prompt: string;
};

export type FaqGroup = {
  subjectId: string;
  subject: string;
  topic: string;
  questions: FaqQuestion[];
};

export const EXAM_FAQ_GROUPS: FaqGroup[] = [
  {
    subjectId: "chemistry",
    subject: "Chemistry",
    topic: "Atomic structure",
    questions: [
      { id: "c-as-1", prompt: "Define first ionisation energy." },
      {
        id: "c-as-2",
        prompt:
          "Explain why there is a large increase in ionisation energy between the 2nd and 3rd ionisation energies of magnesium.",
      },
      { id: "c-as-3", prompt: "Explain the trend in atomic radius across a period." },
    ],
  },
  {
    subjectId: "chemistry",
    subject: "Chemistry",
    topic: "Bonding and structure",
    questions: [
      { id: "c-bs-1", prompt: "Explain why diamond has a very high melting point." },
      {
        id: "c-bs-2",
        prompt: "Why does graphite conduct electricity but diamond does not?",
      },
      { id: "c-bs-3", prompt: "Define electronegativity." },
    ],
  },
  {
    subjectId: "physics",
    subject: "Physics",
    topic: "Mechanics",
    questions: [
      { id: "p-m-1", prompt: "State Newton's second law of motion." },
      {
        id: "p-m-2",
        prompt:
          "Explain why a skydiver reaches terminal velocity, in terms of the forces acting.",
      },
      { id: "p-m-3", prompt: "Define the moment of a force about a point." },
    ],
  },
  {
    subjectId: "biology",
    subject: "Biology",
    topic: "Enzymes",
    questions: [
      {
        id: "b-e-1",
        prompt: "Explain how a competitive inhibitor reduces the rate of reaction.",
      },
      { id: "b-e-2", prompt: "Explain the effect of temperature on enzyme activity." },
      { id: "b-e-3", prompt: "Describe the induced-fit model of enzyme action." },
    ],
  },
  {
    subjectId: "maths",
    subject: "Mathematics",
    topic: "Differentiation",
    questions: [
      { id: "m-d-1", prompt: "State the conditions for a stationary point to be a minimum." },
      { id: "m-d-2", prompt: "Differentiate from first principles — what is the definition used?" },
      { id: "m-d-3", prompt: "Explain when the chain rule is required rather than the product rule." },
    ],
  },
];

export const TOTAL_FAQ_QUESTIONS = EXAM_FAQ_GROUPS.reduce(
  (total, group) => total + group.questions.length,
  0,
);
