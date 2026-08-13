import { redirect } from "next/navigation";

import { PageHeader, Panel } from "@/components/app/ui";
import { PrivacyView } from "@/components/app/PrivacyView";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Privacy · PaperPath",
  robots: { index: false, follow: false },
};

export default async function PrivacyPage() {
  /* This screen exports and erases a student's data, so it has nothing to
     offer without a database. It says so rather than throwing: a 500 on the
     page a parent opens to exercise a DPDP right is the worst place in the app
     to show one. */
  if (!isSupabaseConfigured()) {
    return (
      <div className="space-y-6">
        <PageHeader kicker="Privacy" title="Your data" />
        <Panel className="p-6">
          <p className="text-[15px] opacity-70">
            This deployment is not connected to a database yet, so there is no data to
            show, export or delete.
          </p>
        </Panel>
      </div>
    );
  }

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();

  if (!data.user) redirect("/login?next=/privacy");

  /* The id is passed from the server rather than read in the browser: the
     export and delete endpoints are scoped by it, and a client-supplied id on
     those routes would be the kind of parameter someone eventually edits. They
     check authorisation server-side too — this is belt and braces on the one
     screen that can destroy a student's work. */
  return <PrivacyView userId={data.user.id} />;
}
