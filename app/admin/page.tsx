import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, Activity, BookOpen, School } from "lucide-react";

import { requireContentAccess } from "@/lib/admin/access";

/* The index. It exists so the four consoles are reachable from each other and
   from one bookmark — before this they were four URLs somebody had to
   remember, which is how an internal tool stops being used.

   Two audiences now share it. The vendor sees all four; an institute that has
   bought the platform sees the two that are about its own students and its own
   material. Health and the safety queue are vendor-only — health is the whole
   platform's cost and latency, and the safety queue holds flagged messages
   from every organisation's children. */

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Admin · PaperPath",
  robots: { index: false, follow: false },
};

const CONSOLES = [
  {
    href: "/admin/health",
    vendorOnly: true,
    icon: Activity,
    title: "Health",
    blurb:
      "Cost per active student, verdict parse failures, how much diagnosis is coming from a model, latency. The four numbers with alerts behind them.",
  },
  {
    href: "/admin/safety",
    vendorOnly: true,
    icon: AlertTriangle,
    title: "Safety queue",
    blurb:
      "Flagged messages awaiting review. This one needs a person, not a feature — an unread queue is the same as no queue.",
  },
  {
    href: "/admin/content",
    icon: BookOpen,
    title: "Content",
    blurb:
      "Draft, review, publish. Nothing reaches the curriculum without a human clicking publish.",
  },
  {
    href: "/admin/schools",
    icon: School,
    title: "Schools",
    blurb: "Organisations, sections, teachers, roster import.",
  },
];

export default async function AdminIndexPage() {
  const admin = await requireContentAccess();

  if (!admin.ok) {
    if (admin.status === 401) redirect("/login?next=/admin");

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
    <main className="mx-auto max-w-3xl px-5 py-10">
      <p className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] opacity-50">
        Admin
      </p>
      <h1 className="font-display mt-1 text-[1.8rem] font-extrabold tracking-[-0.03em]">
        Consoles
      </h1>
      <p className="mt-1 text-[13px] opacity-55">
        Signed in as {admin.email}
        {!admin.visibility.superAdmin && " · your organisation"}
      </p>

      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {CONSOLES.filter(
          (console) => admin.visibility.superAdmin || !console.vendorOnly,
        ).map((console) => (
          <Link
            key={console.href}
            href={console.href}
            className="rounded-xl border border-black/10 p-5 transition-opacity hover:opacity-80 dark:border-white/10"
          >
            <console.icon className="h-5 w-5 opacity-60" />
            <h2 className="mt-3 text-[16px] font-bold">{console.title}</h2>
            <p className="mt-1.5 text-[13px] opacity-65">{console.blurb}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}
