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
    | "settings";
  /* Hook the guided tour anchors to the nav without coupling the two. */
  tourId?: string;
};

/* Paths mirror the live app exactly, so links copied between the two always
   resolve. */
export const APP_NAV: NavItem[] = [
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
  { href: "/fix-sheet", label: "Fix Sheet", icon: "target", tourId: "fixsheet" },
  /* Reachable in one tap from anywhere in the app. Withdrawing consent has to
     be as easy as giving it, and a privacy page three levels down inside
     Settings is the compliance-theatre version of that. */
  { href: "/privacy", label: "Privacy & Data", icon: "shield" },
  /* Both degrade to a useful empty state — /parent offers the link form, and
     /teacher explains that classes are assigned by a school admin — so they
     are shown to everyone rather than hidden behind a role the nav would have
     to fetch before it could render. */
  { href: "/parent", label: "For Parents", icon: "users" },
  { href: "/teacher", label: "For Teachers", icon: "school" },
  { href: "/mock-papers", label: "Mock Papers", icon: "file", tourId: "mocks" },
  { href: "/notes", label: "Notes", icon: "book", tourId: "notes" },
  { href: "/papers", label: "Past Papers", icon: "link" },
  { href: "/faq", label: "Exam FAQs", icon: "help" },
  { href: "/feedback", label: "Feedback", icon: "message", tourId: "feedback" },
  { href: "/pricing", label: "Plans", icon: "sparkles" },
  { href: "/settings", label: "Settings", icon: "settings" },
];
