import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/app/AppShell";
import { isAllowlistedEmail } from "@/lib/admin/guard";
import { isMinorFromDob } from "@/lib/consent/age";
import { REQUIRED_PURPOSES } from "@/lib/consent/purposes";
import { canOpen, homeFor, PATH_HEADER, roleFrom, type Role } from "@/lib/roles";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Your revision desk | PaperPath",
  robots: { index: false, follow: false },
};

/* The consent gate and the role gate for the whole app shell.
 *
 * ---------------------------------------------------------------------------
 * WHY HERE AND NOT IN MIDDLEWARE
 *
 * Middleware runs on every request including static assets, and answering
 * either question needs a database round trip. Putting them there would add
 * that trip to every navigation in the app, for answers that change once.
 *
 * The layout runs once per navigation into the shell, which is exactly the
 * granularity both checks need, and it was already loading the profile for the
 * consent gate — so the role costs nothing extra. The API routes gate
 * independently through lib/consent/gate.ts; this is the UI half.
 *
 * Signed-out visitors are already handled by middleware.ts. This decides
 * between "into the app", "to the consent screen", and "not your half of the
 * product".
 *
 * ---------------------------------------------------------------------------
 * WHY THE ROLE GATE REDIRECTS RATHER THAN 404s
 *
 * /admin refuses with a 404, because a console that confirms its own existence
 * to a signed-in student is one somebody keeps poking at. This is different: a
 * student on /teacher is a stale bookmark or a pasted link, not an attempt at
 * anything, and there is nothing secret about the product having a teacher
 * side. Sending them to their own home is the useful answer.
 *
 * Either way this is about not showing somebody a shell that will only ever be
 * empty for them. The data behind these screens is protected by row-level
 * security, not by this.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  /* Without the compliance migration there is nothing to check and no consent
     to be missing. The app stays usable rather than locking every account out
     of a deployment that has not run one SQL file — the routes that actually
     process a child's words fail closed on their own. */
  if (!isAdminConfigured()) return <AppShell role="student">{children}</AppShell>;

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();

  /* Signed out. Middleware bounces the guarded paths; anything else rendering
     the shell does so as a student, which is the least it can be. */
  if (!auth.user) return <AppShell role="student">{children}</AppShell>;

  const admin = createAdminClient();

  const [{ data: profile }, { data: consents }] = await Promise.all([
    admin
      .from("profiles")
      .select("dob, account_state, role")
      .eq("id", auth.user.id)
      .maybeSingle(),
    admin
      .from("consents")
      .select("purpose, granted, withdrawn_at, granted_at")
      .eq("student_id", auth.user.id)
      .order("granted_at", { ascending: false }),
  ]);

  const role: Role = roleFrom({
    stored: profile?.role as string | null,
    /* Compared against ADMIN_EMAILS, never read from a column. lib/roles.ts
       explains why the vendor's role is the one that is not in the database. */
    isSuperAdmin: isAllowlistedEmail(auth.user.email),
  });

  /* --- Role -------------------------------------------------------------- */
  const pathname = (await headers()).get(PATH_HEADER);

  if (pathname && !canOpen(role, pathname)) {
    redirect(homeFor(role));
  }

  /* --- Consent ------------------------------------------------------------
     Students only. A teacher is an adult member of staff, and a screen asking
     them for a parent's phone number is the product mistaking who it is
     talking to.

     `minor` is computed from dob and never read from a column: a stored value
     would still say "minor" on the morning the student turns 18. See
     lib/consent/age.ts. */
  const minor = role === "student" && isMinorFromDob(profile?.dob as string | null);

  if (minor) {
    const current = new Map<string, boolean>();
    for (const row of consents ?? []) {
      if (current.has(row.purpose as string)) continue;
      current.set(
        row.purpose as string,
        Boolean(row.granted) && row.withdrawn_at === null,
      );
    }

    const satisfied = REQUIRED_PURPOSES.every((purpose) => current.get(purpose));

    /* read_only is deliberately NOT redirected. A parent who withdrew consent
       stopped the processing, not the child's access to work they have already
       done — and bouncing them to a consent screen every time they open their
       own notes would make withdrawal feel like a punishment for using the
       control. */
    if (!satisfied && profile?.account_state !== "read_only") {
      redirect("/parent-consent");
    }
  }

  return <AppShell role={role}>{children}</AppShell>;
}
