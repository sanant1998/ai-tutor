/* All landing copy.

   The messaging and section order are new. Every factual claim — boards,
   plan limits, prices, marking speed, sign-up count — is carried over
   unchanged from the previous site, so nothing here asserts something the
   product has not already claimed publicly.

   Two things need a human pass before launch and are flagged inline:
   the three FAQ answers marked `needsReview`, and the testimonials, which
   name real-sounding students and were inherited from the previous build. */

import { BRAND } from "@/lib/brand";
import { limitLine } from "@/lib/plans";

export const NAV_LINKS = [
  { label: "Features", target: "features" },
  { label: "How it works", target: "how" },
  { label: "Boards", target: "boards" },
  { label: "Pricing", target: "pricing" },
  { label: "FAQ", target: "faq" },
] as const;

/* --------------------------------------------------------------------------
   Hero
   -------------------------------------------------------------------------- */
export const HERO = {
  badge: "Now covering CBSE, ICSE and UP Board",
  headline: {
    lead: "Revision that knows what you",
    /* Set in marker pen with a hand-drawn underline. */
    accent: "need next.",
  },
  sub: `${BRAND.name} builds a topic-by-topic plan around your exam date, marks a full mock paper in about 30 seconds, and explains anything you are stuck on — at 1am, on a Sunday, whenever.`,
  primaryCta: "Start free — no card",
  secondaryCta: "See how it works",
  /* No student-count claim here. The old build carried two that contradicted
     each other — "20,000+" in the hero and "80+" in the stats row — and
     neither could be substantiated. A number goes back only when there is a
     real one to quote. */
  trust: [
    { icon: "students" as const, label: "Built on NCERT chapters" },
    { icon: "check" as const, label: "Free to start" },
    { icon: "lock" as const, label: "Data stays private" },
  ],
  annotations: {
    focus: "Focus on what\nactually matters",
    steps: "Small steps\nbig results",
  },
  notebook: {
    title: "To do:",
    items: ["Organic chem revision", "Past paper", "Practise questions"],
  },
  /* Cycled one at a time under the buttons, so the page has a pulse. */
  liveTopics: [
    "Electrolysis",
    "Integration by parts",
    "Le Chatelier's principle",
    "Projectile motion",
    "Enzyme kinetics",
    "Redox equations",
  ],
  stats: [
    { value: "3", label: "boards covered" },
    { value: "1–10", label: "classes" },
    { value: "~30s", label: "to mark a full mock" },
    { value: "24/7", label: "help on call" },
  ],
  panel: {
    title: "Tonight's plan",
    action: "View full plan",
    progressLabel: "3 / 4 tasks completed",
    progress: 75,
    tasks: [
      { label: "Science: Ch 5 — Life Processes", state: "done" as const },
      { label: "Maths: Ch 4 — Quadratic Equations", state: "done" as const },
      { label: "Science: Ch 11 — Electricity", state: "active" as const },
      { label: "Maths: Ch 6 — Triangles", state: "todo" as const },
    ],
  },
};

/* --------------------------------------------------------------------------
   Trust strip
   -------------------------------------------------------------------------- */
export const TRUST_ITEMS = [
  "CBSE",
  "ICSE",
  "UP Board",
  "Class 1–10",
  "NCERT chapters",
  "Maths",
  "Science",
  "Social Science",
  "English",
  "Hindi",
] as const;

/* --------------------------------------------------------------------------
   Bento feature grid
   -------------------------------------------------------------------------- */
export type BentoIcon =
  | "route"
  | "clipboard"
  | "camera"
  | "repeat"
  | "notebook"
  | "timer"
  | "pen"
  | "accessibility";

export type BentoTile = {
  id: string;
  icon: BentoIcon;
  eyebrow: string;
  title: string;
  body: string;
  /* Tailwind column span for the lg grid. Every tile is one row tall: row
     spans leave a tall box with short content, which reads as a hole. */
  span: string;
  visual: "roadmap" | "marking" | "photo" | "heatmap" | "notes" | "focus" | "none";
  accent: "acc" | "acc2" | "acc3";
  /* The one tile that carries a larger title. */
  featured?: boolean;
};

export const BENTO_SECTION = {
  eyebrow: "The whole toolkit",
  heading: "One place for every part of revision",
  sub: "Planning, practising, marking and remembering — stitched together, so nothing falls through the gap between six different websites.",
};

export const BENTO_TILES: BentoTile[] = [
  {
    id: "roadmap",
    icon: "route",
    eyebrow: "Adaptive roadmap",
    title: "A plan that rewrites itself",
    body: "Give it your exam date and your board. It maps every topic on the specification, then reorders your week around whatever you got wrong last time. You open the app to a decision that has already been made.",
    span: "lg:col-span-2",
    visual: "roadmap",
    accent: "acc",
    featured: true,
  },
  {
    id: "marking",
    icon: "clipboard",
    eyebrow: "Mock marking",
    title: "Full paper, marked in ~30 seconds",
    body: "Examiner-style feedback against your board's mark scheme — which marks you earned, which you missed, and the exact wording that cost you.",
    span: "lg:col-span-2",
    visual: "marking",
    accent: "acc2",
  },
  {
    id: "tutor",
    icon: "camera",
    eyebrow: "Photo tutor",
    title: "Snap it, understand it",
    body: "Photograph any past-paper or textbook question and get the method step by step, in your board's command words.",
    span: "lg:col-span-1",
    visual: "photo",
    accent: "acc3",
  },
  {
    id: "spaced",
    icon: "repeat",
    eyebrow: "Spaced repetition",
    title: "Weak topics come back",
    body: "Your shakiest topics resurface on the day you were about to forget them. No deck to build, no cards to shuffle.",
    span: "lg:col-span-1",
    visual: "heatmap",
    accent: "acc",
  },
  {
    id: "notes",
    icon: "notebook",
    eyebrow: "Topic notes",
    title: "Notes written to the spec",
    body: "Every topic on your roadmap comes with notes generated for your exact specification — not a generic summary scraped off the internet.",
    span: "lg:col-span-2",
    visual: "notes",
    accent: "acc2",
  },
  {
    id: "focus",
    icon: "timer",
    eyebrow: "Focus",
    title: "Pomodoro and lo-fi, built in",
    body: "Timers, streaks and curated focus music, so the hour you sat down for is the hour you actually get.",
    span: "lg:col-span-1",
    visual: "focus",
    accent: "acc",
  },
  {
    id: "handwriting",
    icon: "pen",
    eyebrow: "Handwriting",
    title: "It marks your working",
    body: "Photograph your handwritten answer and the method gets marked, not just the final number. Built for maths and the sciences.",
    span: "lg:col-span-1",
    visual: "none",
    accent: "acc3",
  },
  {
    id: "access",
    icon: "accessibility",
    eyebrow: "Reading comfort",
    title: "Reads the way you read",
    body: "Dyslexia-friendly type, wider spacing, larger text, higher contrast, or a calm low-distraction mode — switched on whenever you want them. Try them from the palette button in the header.",
    span: "lg:col-span-2",
    visual: "none",
    accent: "acc2",
  },
];

/* --------------------------------------------------------------------------
   How it works
   -------------------------------------------------------------------------- */
export const HOW_SECTION = {
  eyebrow: "Getting started",
  heading: "Three steps, about a minute",
  sub: "No onboarding call, no card, no setting up a spreadsheet you will abandon by Thursday.",
};

export const HOW_STEPS = [
  {
    n: "01",
    title: "Tell it your exam",
    body: "Board, class, subject and the date you sit the paper. CBSE, ICSE or UP Board — mapped to this year's textbook chapters.",
  },
  {
    n: "02",
    title: "Get tonight's plan",
    body: "A topic-by-topic roadmap appears, front-loaded with whatever is weakest and closest to your exam.",
  },
  {
    n: "03",
    title: "Revise, submit, improve",
    body: "Work through it, submit questions and mocks, and watch the plan bend around your results.",
  },
] as const;

/* --------------------------------------------------------------------------
   Comparison
   -------------------------------------------------------------------------- */
export const COMPARE_SECTION = {
  eyebrow: "Why it is different",
  heading: "Notes sites hand you a PDF. This hands you a plan.",
  sub: "The free stuff online is not wrong — it is just unowned. Nobody is deciding what you do tonight, and nobody is reading what you wrote.",
  before: {
    label: "Revision without a system",
    items: [
      "Forty tabs, six sites, one abandoned spreadsheet",
      "Twenty minutes deciding what to revise",
      "Re-reading the topics you already know",
      "Mocks that sit unmarked until your teacher has time",
      "Losing the same marks on command words every paper",
    ],
  },
  after: {
    label: "Revision with PaperPath",
    items: [
      "One place: plan, notes, papers, marking and tutor",
      "The next task is already chosen when you open it",
      "Weak topics resurface before you forget them",
      "A full mock marked in about 30 seconds, any hour",
      "The exact wording that cost you, flagged every time",
    ],
  },
};

/* --------------------------------------------------------------------------
   Boards
   -------------------------------------------------------------------------- */
export const BOARDS = {
  eyebrow: "Find your exam",
  heading: "Mapped to your specification, not a generic syllabus",
  sub: "Every topic, note and mark scheme is tied to the board you actually sit — and reviewed each exam cycle.",
  groups: [
    {
      region: "International",
      boards: [
        {
          name: "Edexcel",
          detail: "IGCSE and International A Level",
          subjects: "Maths · Physics · Chemistry · Biology",
        },
        {
          name: "Cambridge (CIE)",
          detail: "IGCSE and International A Level",
          subjects: "Maths · Physics · Chemistry · Biology",
        },
      ],
    },
    {
      region: "India",
      boards: [
        {
          name: "CBSE",
          detail: "Grades 10 to 12",
          subjects: "Sciences · Maths · Business · Economics",
        },
        {
          name: "NEET and JEE",
          detail: "Entrance preparation",
          subjects: "Physics · Chemistry · Biology · Maths",
        },
      ],
    },
  ],
  footnote:
    "More boards and subjects are added every term. Cannot see yours? Tell us and it goes on the list.",
  cta: "Start free",
};

/* --------------------------------------------------------------------------
   Accessibility
   -------------------------------------------------------------------------- */
export const ACCESSIBILITY = {
  eyebrow: "Reading and focus",
  heading: "Built to be read, not just looked at",
  body: "Not everyone reads or concentrates the same way, and a revision tool you cannot comfortably read for two hours is not much of a revision tool. These are honest comfort options rather than a fix for everything — and we are still adding more, so tell us what would help.",
  features: [
    {
      icon: "type" as const,
      title: "Dyslexia-friendly type",
      body: "Lexend, a typeface designed to make reading easier, across every note and question.",
    },
    {
      icon: "align" as const,
      title: "Readable spacing",
      body: "Wider letters and taller lines, so words stop running into each other on a long page.",
    },
    {
      icon: "brain" as const,
      title: "Calm mode",
      body: "No animation, no movement, no flashing. Lower sensory load when you need to concentrate.",
    },
    {
      icon: "contrast" as const,
      title: "Contrast and size",
      body: "Stronger contrast and larger text for low-strain reading, late at night or on a bad screen.",
    },
  ],
  hint: "Try them now — the palette button in the header changes this page live.",
};

/* --------------------------------------------------------------------------
   Testimonials
   Inherited verbatim from the previous site. Confirm these are real, current
   and cleared for use before launch.
   -------------------------------------------------------------------------- */
export type Testimonial = {
  initials: string;
  name: string;
  detail: string;
  rating: number;
  quote: string;
  tint: string;
};

export const TESTIMONIALS_SECTION = {
  eyebrow: "From the cohort",
  heading: "What students actually say",
  sub: "Across three boards, including the parts that are still a work in progress.",
};

/* Emptied deliberately.

   The previous build shipped six testimonials naming individual students with
   schools, cities and grade claims. They were inherited, not collected, and
   nobody could say whether those students exist or consented. Invented praise
   attributed to a named person is not a placeholder — it is a false statement
   about a real-sounding individual, so it is gone rather than reworded.

   Put real ones here once they are collected with permission. The section
   below hides itself while these are empty. */
export const TESTIMONIALS_ROW_1: Testimonial[] = [];
export const TESTIMONIALS_ROW_2: Testimonial[] = [];

/* --------------------------------------------------------------------------
   Pricing
   Figures carried over from the previous site's FAQ copy.
   -------------------------------------------------------------------------- */
export const PRICING_SECTION = {
  eyebrow: "Plans & pricing",
  heading: "Pick the plan that matches your run-up.",
  sub: `Notes sites give you notes and questions. ${BRAND.name} gives you a complete daily plan, AI marking, and a roadmap that thinks for you.`,
  note: "Every paid plan opens with a 3-day free trial. Your local currency is worked out at checkout. Cancel in two clicks, no contract.",
};

/* The launch banner above the plan cards. */
export const LAUNCH_OFFER = {
  kicker: "🔥 Launch offer — first 100 users only",
  headline: "50% off your first month",
  code: "REVISE50",
  suffix: "at checkout",
};

export type Plan = {
  id: string;
  name: string;
  icon: "sparkle" | "zap" | "crown";
  price: string;
  /* Shown struck through beside the price, when there is a discount. */
  wasPrice?: string;
  period: string;
  discountBadge?: string;
  altPrice?: string;
  altBadge?: string;
  tagline: string;
  features: string[];
  cta: string;
  featured?: boolean;
  comingSoon?: boolean;
};

/* Prices are the USD figures the live pricing page shows. The FAQ quotes the
   same Pro monthly ($10.89), so the two agree. */
export const PLANS: Plan[] = [
  {
    id: "starter",
    name: "Starter",
    icon: "sparkle",
    price: "$0",
    period: "forever",
    tagline: `Get a real taste of ${BRAND.name}.`,
    /* These lines are generated from the limits the server actually enforces,
       so the card cannot drift from the paywall. */
    features: [
      "Roadmap across every subject you pick",
      `${limitLine("free", "questions")} — 10 questions each`,
      `${limitLine("free", "mark")}, with mark scheme and model answer`,
      limitLine("free", "notes"),
      `${limitLine("free", "mocks")}, marked like the real thing`,
      "Pomodoro, streaks and focus music",
    ],
    cta: "Start free",
  },
  {
    id: "pro",
    name: "Pro",
    icon: "zap",
    price: "$5.44",
    wasPrice: "$10.89",
    period: "/ first month",
    discountBadge: "50% off — code REVISE50",
    altPrice: "or $81.42 / year",
    altBadge: "Save 38%",
    tagline: "The plan most students pick. Built for exam season.",
    features: [
      "Everything in Starter",
      `${limitLine("pro", "questions")} — 400 questions a day`,
      limitLine("pro", "mark"),
      limitLine("pro", "notes"),
      `${limitLine("pro", "mocks")} with examiner-style feedback`,
      "Priority generation during exam season",
    ],
    cta: "Start 3-day trial",
    featured: true,
  },
  {
    id: "advanced",
    name: "Advanced",
    icon: "crown",
    price: "$35.40",
    period: "/ month",
    tagline: "For top-grade hunters and full-on offer holders.",
    features: [
      "Everything in Pro",
      "Unlimited AI tutor — no message cap",
      "Deep-dive notes (longer, more worked examples)",
      "Adaptive mock papers tuned to your weak spots",
      "Predicted-paper generator (exam-season exclusive)",
      "Full AI exam strategy report",
    ],
    cta: "Coming soon",
    comingSoon: true,
  },
];

/* --------------------------------------------------------------------------
   FAQ
   -------------------------------------------------------------------------- */
export type Faq = { q: string; a: string; needsReview?: boolean };

export const FAQ_SECTION = {
  eyebrow: "The specifics",
  heading: "Everything you need to know",
  sub: "The awkward questions included.",
};

export const FAQS: Faq[] = [
  {
    q: "What is PaperPath?",
    a: "PaperPath is an AI-powered revision platform that builds a personalised, topic-by-topic study roadmap for your exam and marks your practice automatically. It brings a study planner, AI-marked practice questions, mock-paper marking with examiner-style feedback, auto-generated topic notes and an AI tutor together in one place, so you always know what to revise next and where you are losing marks.",
  },
  {
    q: "Which exam boards and subjects does it cover?",
    a: "Edexcel (IGCSE and International A Level), Cambridge (IGCSE and A Level) and CBSE (Grades 10-12), plus NEET and JEE preparation. Subjects span Maths, Physics, Chemistry and Biology, with Business and Economics for CBSE. Every topic is mapped to your board's current specification and reviewed each exam cycle, and more boards and subjects are added every term.",
  },
  {
    q: "Is PaperPath free?",
    a: "Yes. The free Starter plan needs no card and includes a roadmap for one subject, 10 AI-marked topic-wise questions per day, 5 AI tutor messages to try it out, notes for 3 topics per week, and built-in focus music with Pomodoro timers and streaks.",
  },
  {
    q: "How much does Pro cost, and is there a discount?",
    a: "Pro is AED 39.99 per month before VAT, or AED 299 per year — roughly a 38% saving. Your local currency is detected automatically at checkout, so depending on where you are that is about £8.50, $10.89 or ₹920 a month. New users get 50% off the first month with code REVISE50, bringing it to AED 19.99, and every Pro plan starts with a 3-day free trial you can cancel before it ends without being charged. An Advanced plan at AED 129.99 per month is coming soon.",
  },
  {
    q: "Why pay when free notes sites already exist?",
    a: "Free sites give you scattered notes and PDFs. They do not mark your mock paper, do not tell you which topic to revise on Tuesday, and do not catch the specific command-word mistakes losing you marks. You are paying for a planner, a marker and a tutor, not just another notes page.",
  },
  {
    q: "How does the AI marking work, and can I trust it?",
    a: "PaperPath marks both topic-wise questions and full mock papers using AI trained on official mark schemes and published examiner reports. Mock papers come back with examiner-style feedback rather than a simple right-or-wrong score, showing which marks you earned, which you missed and why, in the board's own wording. Treat it as a strict second opinion alongside your teacher, not a replacement for them.",
  },
  {
    q: "Can it mark handwritten answers?",
    a: "Yes. On Pro and above you can photograph your handwritten working and the AI will mark it. This is built for subjects like maths and the sciences, where the method and working — not just the final answer — earn the marks.",
  },
  {
    q: "What does the AI tutor do?",
    a: "The AI tutor answers subject questions and helps you work through problems as you revise. The free Starter plan includes 5 messages to try it out, Pro includes 200 messages per day, and Advanced removes the message cap entirely.",
  },
  {
    q: "Does it create study notes?",
    a: "Yes. Topic notes are generated automatically as part of your roadmap. The free plan covers 3 topics per week, Pro unlocks unlimited notes for every topic and unit, and Advanced adds deep-dive notes with more worked examples.",
  },
  {
    q: "What's the difference between the Pro and Advanced plans?",
    a: "Pro is built for regular exam-season revision: unlimited subjects, unlimited AI-marked questions and mock papers, and a 200-message-per-day AI tutor. Advanced adds an uncapped AI tutor, adaptive mock papers targeted at your weak topics, a predicted-paper generator, and a personalised AI exam-strategy report based on your diagnostic results and target grade. Advanced is coming soon.",
  },
  {
    q: "Can I revise more than one subject at a time?",
    a: "On the free Starter plan you get a roadmap for one subject. Pro and Advanced support unlimited subjects and multiple active exams at once, with an urgency timer that adjusts as each exam date approaches.",
  },
  {
    q: "Does it have accessibility, reading and focus options?",
    a: "Yes. Once signed in you can switch on a dyslexia-friendly font, wider spacing, larger text, higher contrast, or a calm low-distraction mode, and the built-in focus music, Pomodoro timer and streaks help you stay on task. These are a core part of the product and we are actively adding more.",
  },
  {
    q: "What if I sign up and do not use it?",
    a: "Cancel anytime in two clicks — no contracts and no awkward emails. The 3-day free trial means you can build your roadmap and mark a real mock paper before you pay anything.",
  },
  /* The three answers below were not present in the captured page and were
     written to match the surrounding voice. Review before launch. */
  {
    q: "Can teachers and schools use PaperPath?",
    a: "Yes. Teachers can set a class up on the same roadmaps and marking their students use at home, and see where a cohort is consistently dropping marks rather than guessing from a spreadsheet. If you are a school or tuition centre, get in touch and we will set your group up directly.",
    needsReview: true,
  },
  {
    q: "What makes it different from a tutor or tuition class?",
    a: "A tutor gives you an hour or two a week at a fixed time. PaperPath sits with you every night: it decides what to revise, marks whatever you write, and explains the questions you get stuck on at 1am. It is built to work alongside a teacher or tutor, not to replace the person who knows you.",
    needsReview: true,
  },
  {
    q: "Who is PaperPath best for?",
    a: "Students sitting Edexcel, Cambridge or CBSE exams who know they need to revise but lose the evening deciding how. If you are already scoring full marks with a system that works, you do not need us. If you are staring at forty tabs wondering where to start, that is exactly who this was built for.",
    needsReview: true,
  },
];

/* --------------------------------------------------------------------------
   Closing CTA and footer
   -------------------------------------------------------------------------- */
export const CTA = {
  heading: "Build tonight's plan in under a minute",
  sub: "No card, no call, no commitment. Map one subject, mark one real mock, and decide from there.",
  primary: "Start free",
  secondary: "See pricing",
};

export const FOOTER = {
  brand: "PaperPath",
  tagline: "One calm revision hub for Edexcel, Cambridge and CBSE.",
  columns: [
    {
      title: "Product",
      links: [
        { label: "Features", target: "features" },
        { label: "How it works", target: "how" },
        { label: "Boards", target: "boards" },
        { label: "Pricing", target: "pricing" },
      ],
    },
    {
      title: "Company",
      links: [
        { label: "FAQ", target: "faq" },
        { label: "Students", target: "testimonials" },
      ],
    },
  ],
  legal: [
    { label: "Privacy", href: "/privacy" },
    { label: "Terms", href: "/terms" },
    { label: "Refunds", href: "/refund" },
    { label: "Trust and security", href: "/trust" },
  ],
  copyright: "© 2026 PaperPath · Built by students, for students",
};
