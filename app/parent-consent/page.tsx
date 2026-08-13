import { redirect } from "next/navigation";

import { AgeGate } from "@/components/consent/AgeGate";
import { RequestConsent } from "@/components/consent/RequestConsent";
import { isMinorFromDob } from "@/lib/consent/age";
import { REQUIRED_PURPOSES } from "@/lib/consent/purposes";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/* Where a locked account lands.
 *
 * Server-rendered so the decision is made once, before anything paints. A
 * client-side check would flash the app shell at a student who is not allowed
 * into it, and that flash is exactly the moment the screenshot gets taken. */

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Parent ki anumati · PaperPath",
  robots: { index: false, follow: false },
};

export default async function ParentConsentPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();

  if (!auth.user) redirect("/login?next=/parent-consent");

  /* Without the compliance migration there is no consent to check. Sending the
     student to the app would be the wrong failure — this page says what is
     missing instead. */
  if (!isAdminConfigured()) {
    return (
      <main className="mx-auto max-w-lg px-5 py-16">
        <h1 className="font-display text-2xl font-extrabold">Not configured</h1>
        <p className="mt-3 text-[15px] opacity-70">
          Set <code>SUPABASE_SERVICE_ROLE_KEY</code> and run{" "}
          <code>supabase/compliance.sql</code>.
        </p>
      </main>
    );
  }

  const admin = createAdminClient();

  const [{ data: profile }, { data: consents }, { data: onboarding }] = await Promise.all([
    admin
      .from("profiles")
      .select("first_name, dob, account_state, role")
      .eq("id", auth.user.id)
      .maybeSingle(),
    admin
      .from("consents")
      .select("purpose, granted, withdrawn_at, granted_at")
      .eq("student_id", auth.user.id)
      .order("granted_at", { ascending: false }),
    /* Whether this account has actually been set up. A student who has just
       been consented for has not, and sending them to a dashboard that says
       "finish onboarding" with nothing to click is a dead end. */
    admin
      .from("onboarding")
      .select("board_id, subject_ids")
      .eq("user_id", auth.user.id)
      .maybeSingle(),
  ]);

  const current = new Map<string, boolean>();
  for (const row of consents ?? []) {
    if (current.has(row.purpose as string)) continue;
    current.set(row.purpose as string, Boolean(row.granted) && row.withdrawn_at === null);
  }

  const satisfied = REQUIRED_PURPOSES.every((purpose) => current.get(purpose));

  /* An adult, or a student whose parent has already consented, has no business
     on this page. */
  if (!isMinorFromDob(profile?.dob as string | null) || satisfied) {
    if (profile?.role === "parent") redirect("/parent");
    if (profile?.role === "teacher") redirect("/teacher");

    /* One place decides where a consented student goes, so the consent screen,
       the read-the-code path and the polling redirect cannot each guess
       differently. A brand-new student has no board, no subjects and no plan;
       the dashboard would show them an empty week. */
    const onboarded =
      Boolean(onboarding?.board_id) &&
      ((onboarding?.subject_ids as string[] | null)?.length ?? 0) > 0;

    redirect(onboarded ? "/dashboard" : "/onboarding");
  }

  const firstName = (profile?.first_name as string) ?? "";

  /* No date of birth yet means we do not know which of three products this
     account is. The age gate asks; only a self-declared minor reaches the
     parental screen, and a teacher or parent never sees it at all. */
  if (!profile?.dob) return <AgeGate firstName={firstName} />;

  return <RequestConsent firstName={firstName} dobAlreadyGiven />;
}
