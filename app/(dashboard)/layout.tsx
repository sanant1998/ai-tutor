import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/app/AppShell";
import { isMinorFromDob } from "@/lib/consent/age";
import { REQUIRED_PURPOSES } from "@/lib/consent/purposes";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Your revision desk | PaperPath",
  robots: { index: false, follow: false },
};

/* The consent gate for the whole app shell.
 *
 * ---------------------------------------------------------------------------
 * WHY HERE AND NOT IN MIDDLEWARE
 *
 * Middleware runs on every request including static assets, and answering
 * "has this child's parent consented" needs a database round trip. Putting it
 * there would add that trip to every navigation in the app for a check whose
 * answer changes once, ever.
 *
 * The layout runs once per navigation into the shell, which is exactly the
 * granularity the check needs. The API routes gate independently — this is the
 * UI half, and neither is load-bearing on its own.
 *
 * Signed-out visitors are already handled by middleware.ts; this only decides
 * between "into the app" and "to the consent screen". */

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  /* Without the compliance migration there is nothing to check and no consent
     to be missing. The app stays usable rather than locking every account out
     of a deployment that has not run one SQL file — the routes that actually
     process a child's words fail closed on their own. */
  if (isAdminConfigured()) {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();

    if (auth.user) {
      const admin = createAdminClient();

      const [{ data: profile }, { data: consents }] = await Promise.all([
        admin
          .from("profiles")
          .select("dob, account_state")
          .eq("id", auth.user.id)
          .maybeSingle(),
        admin
          .from("consents")
          .select("purpose, granted, withdrawn_at, granted_at")
          .eq("student_id", auth.user.id)
          .order("granted_at", { ascending: false }),
      ]);

      /* Computed from dob, never read from a column. is_minor cannot BE a
         column: a stored value would still say "minor" on the morning the
         student turns 18. See lib/consent/age.ts. */
      const minor = isMinorFromDob(profile?.dob as string | null);

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

        /* read_only is deliberately NOT redirected. A parent who withdrew
           consent stopped the processing, not the child's access to work they
           have already done — and bouncing them to a consent screen every time
           they open their own notes would make withdrawal feel like a
           punishment for using the control. */
        if (!satisfied && profile?.account_state !== "read_only") {
          redirect("/parent-consent");
        }
      }
    }
  }

  return <AppShell>{children}</AppShell>;
}
