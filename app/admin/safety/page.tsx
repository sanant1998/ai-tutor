import Link from "next/link";
import { redirect } from "next/navigation";

import { SafetyQueue } from "@/components/admin/SafetyQueue";
import { requireAdmin } from "@/lib/admin/guard";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Safety · PaperPath",
  robots: { index: false, follow: false },
};

export default async function AdminSafetyPage() {
  const admin = await requireAdmin();

  if (!admin.ok) {
    if (admin.status === 401) redirect("/login?next=/admin/safety");

    return (
      <main className="mx-auto max-w-lg px-5 py-20">
        <h1 className="font-display text-2xl font-extrabold">Not found</h1>
        {admin.status === 503 && (
          <p className="mt-3 text-[14px] opacity-65">{admin.message}</p>
        )}
      </main>
    );
  }

  return (
    <>
      <div className="mx-auto max-w-3xl px-5 pt-8">
        <Link href="/admin" className="text-[14px] underline opacity-60">
          ← Admin
        </Link>
      </div>
      <SafetyQueue />
    </>
  );
}
