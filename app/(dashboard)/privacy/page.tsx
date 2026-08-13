import { redirect } from "next/navigation";

import { PrivacyView } from "@/components/app/PrivacyView";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Privacy · PaperPath",
  robots: { index: false, follow: false },
};

export default async function PrivacyPage() {
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
