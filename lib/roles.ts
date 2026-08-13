/* Who is signed in, and what the app is for them.
 *
 * ---------------------------------------------------------------------------
 * THREE ROLES, AND THEY DO NOT ALL LIVE IN THE SAME PLACE
 *
 *   super_admin   an address in ADMIN_EMAILS. Not a database row.
 *   teacher       profiles.role = 'teacher'
 *   student       profiles.role = 'student'  (the default)
 *
 * The split is deliberate and is argued in full in lib/admin/guard.ts: a super
 * admin can change what every student in the product is taught, and a role
 * COLUMN granting that is one bad UPDATE — a mis-scoped policy, a support
 * script, a bug in an onboarding route — away from someone granting it to
 * themselves. An environment allowlist cannot be escalated to from inside the
 * database at all. The cost is a redeploy per admin, which at this size is the
 * right trade.
 *
 * `role` is already unwritable from a browser: supabase/compliance.sql revokes
 * update on profiles and grants back only first_name, last_name and language.
 * So a student cannot promote themselves to teacher either.
 *
 * ---------------------------------------------------------------------------
 * WHY PARENT IS NOT ON THAT LIST
 *
 * It used to be a fourth value of profiles.role, and it never needed to be.
 * A parent is not a user of this app — app/api/consent/grant/route.ts says so
 * at the top and has always worked that way. They are a person holding a phone
 * that received a link, and every parent-facing thing the product does reaches
 * them without an account:
 *
 *   consent          an OTP to the number the student named
 *   weekly report    WhatsApp, keyed off the phone on the consent row
 *
 * Keeping 'parent' as a role meant a login, a password and a dashboard for
 * people who mostly never signed in twice, and a fourth branch in every place
 * that asks "what kind of account is this". supabase/roles.sql migrates any
 * row that still says 'parent' to 'student'.
 *
 * ---------------------------------------------------------------------------
 * THIS FILE IS THE ONLY PLACE THE ANSWER IS DECIDED
 *
 * Before it, the answer was decided nowhere: sign-in sent everybody to
 * /dashboard, so a teacher landed on a student's revision plan; the sidebar
 * showed one list to all three; and /teacher relied on a row-level policy
 * returning nothing to a student, which renders an empty teacher screen rather
 * than refusing. */

/* middleware.ts stamps the request path here so the app shell's layout can
   read it. A layout is never told which page is rendering inside it, and the
   role gate belongs in the layout because that is the one place the role is
   already loaded — the alternative is the same check copied into a dozen
   pages, which is the version that eventually misses one.

   Request header only. It never reaches the browser, and nothing trusts it for
   anything but choosing where to redirect a person who is already signed in. */
export const PATH_HEADER = "x-paperpath-path";

export type Role = "student" | "teacher" | "super_admin";

/* What may be stored in profiles.role. super_admin is absent on purpose — see
   above — so this is the closed set the database CHECK constraint enforces. */
export type StoredRole = "student" | "teacher";

export const STORED_ROLES: StoredRole[] = ["student", "teacher"];

export function isStoredRole(value: unknown): value is StoredRole {
  return typeof value === "string" && STORED_ROLES.includes(value as StoredRole);
}

/* Anything unrecognised — null, a legacy 'parent', a typo — reads as a
   student. The least privileged of the three, which is the only safe direction
   for a default to fall. */
export function roleFrom(input: {
  stored: string | null | undefined;
  isSuperAdmin: boolean;
}): Role {
  if (input.isSuperAdmin) return "super_admin";
  return input.stored === "teacher" ? "teacher" : "student";
}

/* ---------------------------------------------------------------------------
   Where each role lands

   Sign-in used to push everyone at /dashboard. For a teacher that is a page
   of somebody else's homework with their own name on it, and the first thing
   they have to do is work out that the product has a different half. */
export const HOME_FOR: Record<Role, string> = {
  student: "/dashboard",
  teacher: "/teacher",
  super_admin: "/admin",
};

export function homeFor(role: Role): string {
  return HOME_FOR[role];
}

/* ---------------------------------------------------------------------------
   What each role may open

   Expressed as path prefixes rather than as a list of pages, so a new page
   under an existing area is covered the moment it exists. `middleware.ts`
   decides signed-in versus signed-out; this decides which signed-in person.

   Ordered most specific first: /teacher must be tested before / would be. */
const STUDENT_ONLY = [
  "/dashboard",
  "/tutor",
  "/practice",
  "/roadmap",
  "/exams",
  "/progress",
  "/fix-sheet",
  /* Sitting a test set by the teacher. Student-only rather than shared: a
     teacher opening it would get the list of tests set for THEM, which is
     empty by definition — the teacher's own view of a test is the results on
     their class screen, and it is a different screen because it answers a
     different question. */
  "/tests",
  "/homework",
  "/mock-papers",
  "/notes",
  "/pricing",
  "/onboarding",
];

const TEACHER_ONLY = ["/teacher"];

const ADMIN_ONLY = ["/admin"];

/* Open to any signed-in person: account screens, and the reference material
   that is as useful to the person teaching as to the person revising. */
const SHARED = ["/papers", "/faq", "/feedback", "/privacy", "/settings", "/questions"];

export function canOpen(role: Role, pathname: string): boolean {
  /* Everything. A super admin who cannot open a student's screen cannot see
     what a student is complaining about, and the whole point of the role is
     that it is the vendor looking at their own product. */
  if (role === "super_admin") return true;

  const under = (prefixes: string[]) =>
    prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

  if (under(SHARED)) return true;
  if (under(ADMIN_ONLY)) return false;

  if (role === "teacher") return under(TEACHER_ONLY);

  /* Student. */
  return under(STUDENT_ONLY);
}
