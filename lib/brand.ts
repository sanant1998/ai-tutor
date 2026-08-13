/* Product name lives here alone. Changing these three strings renames the
   whole site — nav, footer, auth, onboarding, metadata and structured data
   all read from this module.

   Shortlisted alternatives if PaperPath does not land:
     Revly      — shortest, most brandable, weakest meaning
     MarkWise   — leads on the marking, undersells the planner
     StudyPath  — clearest, most generic */
export const BRAND = {
  name: "PaperPath",
  /* The wordmark is set in two tones, the second in the accent colour with a
     hand-drawn underline, as in the design. */
  wordmark: { lead: "Paper", accent: "Path" },
  domain: "paperpath.com",
  tagline: "One calm revision hub for CBSE, ICSE and UP Board.",
} as const;
