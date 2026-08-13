import type { Role } from "@/lib/roles";

export type NavItem = {
  href: string;
  label: string;
  icon:
    | "home"
    | "calendar"
    | "graduation"
    | "trending"
    | "zap"
    | "file"
    | "book"
    | "link"
    | "help"
    | "message"
    | "sparkles"
    | "target"
    | "shield"
    | "users"
    | "school"
    | "clipboard"
    | "notebook"
    | "settings";
  /* Hook the guided tour anchors to the nav without coupling the two. */
  tourId?: string;
};

/* ---------------------------------------------------------------------------
   The sidebar, per role.

   It used to be one list shown to everybody, with a comment explaining that
   /parent and /teacher were left in because both "degrade to a useful empty
   state" and hiding them would mean fetching a role before the nav could
   render. That was true when there was no role to fetch. Now the app shell
   already reads the profile — for the consent gate — so the role is in hand
   before the sidebar renders, and the reasoning has run out.

   What it was costing: a teacher's sidebar offered Today's Plan, Fix Sheet,
   Roadmap and Progress, which are one student's personal revision and are
   empty and meaningless for a teacher. A student's sidebar offered "For
   Teachers", which opens a page telling them they have no classes. Both read
   as a product that has not decided who it is talking to.
   --------------------------------------------------------------------------- */

/* Reachable from every role's sidebar. Account and reference screens, plus the
   question generator — as useful for building a worksheet as for revision. */
const SHARED_TAIL: NavItem[] = [
  { href: "/papers", label: "Past Papers", icon: "link" },
  { href: "/faq", label: "Exam FAQs", icon: "help" },
  { href: "/feedback", label: "Feedback", icon: "message", tourId: "feedback" },
  /* Reachable in one tap from anywhere in the app. Withdrawing consent has to
     be as easy as giving it, and a privacy page three levels down inside
     Settings is the compliance-theatre version of that. */
  { href: "/privacy", label: "Privacy & Data", icon: "shield" },
  { href: "/settings", label: "Settings", icon: "settings" },
];

/* Everything a student's revision runs on. */
export const STUDENT_NAV: NavItem[] = [
  { href: "/dashboard", label: "Today's Plan", icon: "home" },
  /* Second, not last. Teaching is the layer everything else depends on — a
     student who has not been taught a topic has nothing to practise — and nav
     order is how a student decides what this product is for. */
  { href: "/tutor", label: "Learn a Topic", icon: "sparkles", tourId: "tutor" },
  { href: "/roadmap", label: "Roadmap", icon: "calendar", tourId: "roadmap" },
  { href: "/exams", label: "Exams", icon: "graduation" },
  { href: "/progress", label: "Progress", icon: "trending" },
  /* Two practice systems exist and that is a deliberate split, not drift:
     /practice serves the hand-written question bank for topics the tutor has
     taught, and /questions generates fresh questions for chapters that have
     not been seeded yet. The labels say which is which, because "two things
     called Questions" is how a student ends up trusting neither.

     When the curriculum covers a subject completely, this entry should go. */
  { href: "/questions", label: "Extra Questions (AI)", icon: "zap", tourId: "questions" },
  /* Set by a teacher, marked against the whole class, and the score goes on a
     report — which is why it sits apart from the two practice entries above
     and from Mock Papers below. Those are the student's own; this one is the
     school's, and confusing the two is how a student treats a real test as
     practice. Empty for a student whose school has not set one. */
  { href: "/tests", label: "Class Tests", icon: "clipboard" },
  { href: "/homework", label: "Homework", icon: "notebook" },
  { href: "/fix-sheet", label: "Fix Sheet", icon: "target", tourId: "fixsheet" },
  { href: "/mock-papers", label: "Mock Papers", icon: "file", tourId: "mocks" },
  { href: "/notes", label: "Notes", icon: "book", tourId: "notes" },
  { href: "/pricing", label: "Plans", icon: "sparkles" },
  ...SHARED_TAIL,
];

/* A teacher's job is their classes, and then making material for them.
 *
 * Deliberately without Today's Plan, Learn a Topic, Roadmap, Progress, Fix
 * Sheet, Notes and Mock Papers: every one of those is keyed to the signed-in
 * person's own revision, so on a teacher's account they are empty by
 * definition. Extra Questions stays, because generating a set for tomorrow's
 * worksheet is a real thing a teacher does with it. */
export const TEACHER_NAV: NavItem[] = [
  { href: "/teacher", label: "My Classes", icon: "school" },
  { href: "/questions", label: "Question Builder (AI)", icon: "zap" },
  ...SHARED_TAIL,
];

/* The vendor sees the whole product, because they have to be able to look at
   whatever a student or a teacher is looking at when something is reported.
   The admin consoles come first — that is what they signed in for. */
export const SUPER_ADMIN_NAV: NavItem[] = [
  { href: "/admin", label: "Admin", icon: "shield" },
  { href: "/teacher", label: "Classes", icon: "school" },
  ...STUDENT_NAV,
];

export function navFor(role: Role): NavItem[] {
  if (role === "super_admin") return SUPER_ADMIN_NAV;
  if (role === "teacher") return TEACHER_NAV;
  return STUDENT_NAV;
}

/* Every path any role can reach through the sidebar. middleware.ts derives the
   signed-in-only list from this, so a page added to any nav above is guarded
   the moment it appears. */
export const APP_NAV: NavItem[] = [
  ...STUDENT_NAV,
  ...TEACHER_NAV,
  ...SUPER_ADMIN_NAV,
].filter(
  (item, index, all) => all.findIndex((other) => other.href === item.href) === index,
);
