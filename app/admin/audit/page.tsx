import { redirect } from "next/navigation";

import { AuditTrail } from "@/components/admin/AuditTrail";
import { requireContentAccess } from "@/lib/admin/access";

/* Open to an org admin as well as the vendor, unlike health and the safety
   queue. A school asking "who changed this child's section" is asking about
   its own data, and being unable to answer that without emailing the vendor is
   the thing enterprise buyers object to. The route filters to their own org;
   the RLS policy says the same in case anything ever reaches this table
   without going through here. */

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Audit trail · PaperPath",
  robots: { index: false, follow: false },
};

export default async function AuditPage() {
  const admin = await requireContentAccess();

  if (!admin.ok) {
    if (admin.status === 401) redirect("/login?next=/admin/audit");
    redirect("/");
  }

  return <AuditTrail />;
}
