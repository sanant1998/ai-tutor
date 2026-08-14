"use client";

/* The module rail.
 *
 * ---------------------------------------------------------------------------
 * WHY A PANEL RATHER THAN FIVE PAGES
 *
 * The consoles were five separate screens joined by a "← Admin" link back to
 * an index. Everything an admin did was therefore three navigations — index,
 * console, index — and nothing on screen ever said what else existed or
 * whether any of it wanted attention. That is a set of tools, not a panel.
 *
 * The rail is persistent, says which module you are in, and carries the counts
 * that decide which module you should be in. A queue with three unreviewed
 * flags is visible from inside the content console, which is the whole point:
 * the module you are not looking at is the one that goes unread.
 *
 * ---------------------------------------------------------------------------
 * GROUPED, BECAUSE THE MODULES ARE NOT PEERS
 *
 * Running a school day to day (schools, content) is a different job from
 * watching the platform (safety, health, audit) and is usually a different
 * person. Flat, the safety queue sat between "Content" and "Schools" as though
 * reviewing a flagged message from a child were the same kind of errand as
 * adding a section.
 *
 * ---------------------------------------------------------------------------
 * LITERAL COLOURS, AND NO `dark:` VARIANTS
 *
 * The admin area is pinned light by `.admin-light`, which exists precisely
 * because the older consoles carry sixty inline `dark:` utilities that fight
 * it — globals.css has to undo them with `!important`. New admin UI does not
 * add to that pile: the surface is light, so the colours are light, written
 * out rather than taken from the theme tokens a student picked. */

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  BookOpen,
  Inbox,
  LayoutDashboard,
  School,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

export type NavCounts = { safety: number; drafts: number; urgent: number; review: number };

type Item = {
  href: string;
  label: string;
  icon: LucideIcon;
  vendorOnly?: boolean;
  badge?: keyof Omit<NavCounts, "urgent">;
};

const GROUPS: { title: string; items: Item[] }[] = [
  {
    title: "Overview",
    items: [{ href: "/admin", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    title: "Operations",
    items: [
      { href: "/admin/schools", label: "Schools", icon: School },
      { href: "/admin/content", label: "Content", icon: BookOpen, badge: "drafts" },
    ],
  },
  {
    title: "Oversight",
    items: [
      {
        href: "/admin/safety",
        label: "Safety queue",
        icon: AlertTriangle,
        vendorOnly: true,
        badge: "safety",
      },
      { href: "/admin/health", label: "Health", icon: Activity, vendorOnly: true },
      { href: "/admin/audit", label: "Audit trail", icon: ShieldCheck },
      /* Last, because it is where you START and the rail is read top-down —
         but it is an inbox over the two modules above it, so it belongs after
         the things it routes to rather than before them. */
      {
        href: "/admin/review",
        label: "Review queue",
        /* An inbox, not a second shield. Audit trail already owns ShieldCheck,
           and two identical icons stacked in the rail is two rows you have to
           read the label of every time. */
        icon: Inbox,
        vendorOnly: true,
        badge: "review",
      },
    ],
  },
];

export function AdminNav({ vendor, counts }: { vendor: boolean; counts: NavCounts }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Admin modules" className="text-[14px]">
      {GROUPS.map((group) => {
        const items = group.items.filter((item) => vendor || !item.vendorOnly);
        if (items.length === 0) return null;

        return (
          <div key={group.title} className="mb-5">
            <p className="px-3 pb-1.5 text-[10.5px] font-bold uppercase tracking-[0.14em] text-[#667085]">
              {group.title}
            </p>

            <ul className="space-y-0.5">
              {items.map((item) => {
                /* Exact match for the dashboard, prefix for the rest —
                   otherwise "/admin" is highlighted on every child route and
                   the rail never tells you where you are. */
                const active =
                  item.href === "/admin"
                    ? pathname === "/admin"
                    : pathname.startsWith(item.href);

                const count = item.badge ? counts[item.badge] : 0;
                /* Red only when a child is waiting on it. A grey pill for four
                   drafts and a red one for four flagged messages is the whole
                   difference between a workload and a duty. */
                const loud = item.badge === "safety" && counts.urgent > 0;

                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] focus-visible:ring-offset-1 ${
                        active
                          ? "bg-[#eff4ff] font-semibold text-[#2563eb]"
                          : "text-[#4b5565] hover:bg-black/[0.035] hover:text-[#14171c]"
                      }`}
                    >
                      {/* A bar on the edge as well as a tint. The tint alone is
                          a pale blue block that a tired eye reads as "one of
                          these is slightly different"; the bar is a position,
                          and position is what you track peripherally while
                          reading the page next to it. */}
                      {active && (
                        <span
                          aria-hidden="true"
                          className="absolute inset-y-1.5 left-0 w-[3px] rounded-r-full bg-[#2563eb]"
                        />
                      )}

                      <item.icon
                        className={`h-[18px] w-[18px] shrink-0 transition-opacity ${
                          active ? "" : "opacity-60 group-hover:opacity-100"
                        }`}
                      />
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>

                      {count > 0 && (
                        <span
                          /* The number alone announces as "Content 1", which
                             means nothing read aloud. */
                          aria-label={`${count} waiting`}
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ${
                            loud
                              ? "bg-[#dc2626] text-white"
                              : active
                                ? "bg-[#d6e4ff] text-[#1d4ed8]"
                                : "bg-[#eaecf0] text-[#4b5565]"
                          }`}
                        >
                          {count}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}
