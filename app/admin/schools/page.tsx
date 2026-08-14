import { redirect } from "next/navigation";

import { SchoolsConsole } from "@/components/admin/SchoolsConsole";
import { requireContentAccess } from "@/lib/admin/access";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Schools · PaperPath",
  robots: { index: false, follow: false },
};

export default async function AdminSchoolsPage() {
  const admin = await requireContentAccess();

  if (!admin.ok) {
    if (admin.status === 401) redirect("/login?next=/admin/schools");

    return (
      <main className="max-w-lg">
        <h1 className="font-display text-2xl font-extrabold">Not found</h1>
        {admin.status === 503 && (
          <p className="mt-3 text-[14px] opacity-65">{admin.message}</p>
        )}
      </main>
    );
  }

  return <SchoolsConsole canCreateOrg={admin.visibility.superAdmin} />;
}
