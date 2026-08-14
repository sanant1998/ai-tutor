import type { ReactNode } from "react";
import Link from "next/link";
import { BookOpenCheck, GraduationCap } from "lucide-react";

import { AdminBar } from "@/components/admin/AdminBar";
import { AdminNav, type NavCounts } from "@/components/admin/AdminNav";
import { requireContentAccess } from "@/lib/admin/access";
import { BRAND } from "@/lib/brand";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";

/* The admin panel: one shell, every module inside it.
 *
 * The light surface is argued in globals.css next to `.admin-light`: these are
 * internal tools read in an office, the nine student themes were never checked
 * against them, and on a machine set to dark the page's own tokens and
 * Tailwind's OS-driven `dark:` variants disagreed — dark text on a dark ground,
 * and native select menus with unreadable options.
 *
 * A layout rather than a component each page remembers to render, so a console
 * added later gets the rail, the bar and the counts without anyone thinking
 * about it.
 *
 * ---------------------------------------------------------------------------
 * THE COUNTS ARE READ HERE, ONCE
 *
 * They belong to the rail, and the rail is on every page — so reading them in
 * the layout is the only place they are read once per navigation rather than
 * once per console that happens to want them. Both are `head: true` counts, so
 * neither pulls a row across.
 *
 * They fail quiet. A panel that will not render because a count could not be
 * read is a panel that hides the console you need in order to fix whatever
 * broke the count. */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const admin = await requireContentAccess();

  /* Unauthenticated, or not an admin at all. The page itself redirects or
     shows its own "Not found"; wrapping that in a panel would render a module
     rail around a refusal. */
  if (!admin.ok) return <div className="admin-light">{children}</div>;

  const vendor = admin.visibility.superAdmin;
  const counts: NavCounts = { safety: 0, drafts: 0, urgent: 0, review: 0 };

  if (isAdminConfigured()) {
    try {
      const db = createAdminClient();
      const scope = admin.visibility.adminOf;
      const fallback = scope.length > 0 ? scope : ["00000000-0000-0000-0000-000000000000"];

      const [flags, urgent, drafts] = await Promise.all([
        /* Vendor-only, matching the module itself: the queue holds flagged
           messages from every organisation's children. */
        vendor
          ? db.from("safety_flags").select("id", { count: "exact", head: true }).eq("status", "open")
          : Promise.resolve({ count: 0 }),
        vendor
          ? db
              .from("safety_flags")
              .select("id", { count: "exact", head: true })
              .eq("status", "open")
              .eq("severity", "urgent")
          : Promise.resolve({ count: 0 }),
        vendor
          ? db
              .from("content_drafts")
              .select("id", { count: "exact", head: true })
              .in("status", ["in_review", "approved"])
          : db
              .from("content_drafts")
              .select("id", { count: "exact", head: true })
              .in("status", ["in_review", "approved"])
              .in("org_id", fallback),
      ]);

      counts.safety = flags.count ?? 0;
      counts.urgent = urgent.count ?? 0;
      counts.drafts = drafts.count ?? 0;
      /* The inbox badge is the sum of the two it routes to, so the rail cannot
         say "nothing waiting" while one of the modules below it has three. */
      counts.review = counts.safety + counts.drafts;
    } catch {
      /* Left at zero. A missing badge is a smaller failure than a panel that
         will not open. */
    }
  }

  return (
    <div className="admin-light min-h-screen lg:flex">
      {/* The rail. Fixed on a desk, which is where these screens are read.
          Below `lg` it becomes a scrolling row above the content rather than a
          drawer behind a button — six links do not earn a menu, and a rail you
          have to open is a rail you forget carries the counts. */}
      <aside className="shrink-0 border-[#e9eaee] bg-white lg:sticky lg:top-0 lg:h-screen lg:w-[246px] lg:border-r">
        <div className="flex h-full flex-col">
          {/* A ruled header rather than a logo floating above the list. It
              anchors the rail's top edge to the bar on the right, which starts
              at the same line. */}
          <Link
            href="/admin"
            className="mx-3 flex items-center gap-2.5 border-b border-[#eceef1] px-3 py-5 text-[#0d1015]"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#2563eb]">
              <BookOpenCheck className="h-[18px] w-[18px] text-white" />
            </span>
            <span className="text-[19px] font-extrabold tracking-[-0.02em]">{BRAND.name}</span>
          </Link>

          {/* Scrolls vertically on a desk and horizontally on a phone.
              It had only `overflow-x-auto`, so on a short window the rail's own
              height pushed the help card past the bottom of a `h-screen` column
              with no way to reach it — the card was not missing, it was below a
              fold that could not be scrolled. */}
          <div className="min-w-0 flex-1 overflow-x-auto px-3 lg:overflow-x-visible lg:overflow-y-auto">
            <AdminNav vendor={vendor} counts={counts} />
          </div>

          {/* Internal tooling has no onboarding and no tooltips. One card that
              names where to ask is cheaper than either, and it sits at the
              bottom because it is the last thing you want, not the first. */}
          <div className="hidden shrink-0 p-3 lg:block">
            <div className="rounded-2xl bg-[#f2f6ff] p-4">
              <GraduationCap className="h-[18px] w-[18px] text-[#2563eb]" />
              <p className="mt-2 text-[13.5px] font-bold text-[#0d1015]">Need help?</p>
              <p className="mt-1 text-[12.5px] leading-[1.5] text-[#4b5565]">
                Read the runbook in{" "}
                <span className="font-mono text-[11.5px]">docs/</span>, or ask the platform team.
              </p>
            </div>
          </div>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <AdminBar email={admin.email} />
        <div className="px-5 pb-14 pt-4 sm:px-8">{children}</div>
      </div>
    </div>
  );
}
