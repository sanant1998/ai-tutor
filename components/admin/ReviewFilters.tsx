"use client";

/* The two controls at the top of the review queue.
 *
 * They write to the URL rather than to component state. A reviewer who finds
 * something worth a second opinion sends the link, and the person opening it
 * sees the same list; state in a hook is a list only the first person can see.
 * It also means the page stays a server component and the rows never reach the
 * browser as JSON. */

import { useRouter, useSearchParams } from "next/navigation";
import { BadgeCheck, ChevronDown } from "lucide-react";

const VIEWS = [
  { id: "all", label: "All" },
  { id: "unreviewed", label: "Unreviewed" },
  { id: "reviewed", label: "Reviewed" },
] as const;

export function ViewTabs({ view }: { view: string }) {
  const router = useRouter();
  const params = useSearchParams();

  const go = (next: string) => {
    const query = new URLSearchParams(params.toString());
    query.set("view", next);
    router.push(`/admin/review?${query.toString()}`);
  };

  return (
    <div
      role="tablist"
      aria-label="Which items to show"
      className="flex items-center gap-0.5 rounded-xl border border-[#e4e6ea] bg-white p-1"
    >
      {VIEWS.map((option) => {
        const active = option.id === view;

        return (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => go(option.id)}
            className={`rounded-lg px-4 py-1.5 text-[13.5px] font-semibold transition-colors ${
              active ? "bg-[#eff4ff] text-[#2563eb]" : "text-[#4b5565] hover:bg-black/[0.035]"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function OrgPicker({
  orgs,
  orgId,
}: {
  orgs: { id: string; name: string }[];
  orgId: string;
}) {
  const router = useRouter();
  const params = useSearchParams();

  const chosen = orgs.find((org) => org.id === orgId);

  const go = (next: string) => {
    const query = new URLSearchParams(params.toString());
    if (next) query.set("org", next);
    else query.delete("org");
    router.push(`/admin/review?${query.toString()}`);
  };

  return (
    <div className="relative rounded-2xl border border-[#e9eaee] bg-[#fafbfc] px-5 py-4">
      <p className="text-[13px] text-[#4b5565]">Managing queue for</p>

      <p className="mt-0.5 flex items-center gap-1.5 text-[16px] font-bold text-[#0d1015]">
        {chosen?.name ?? "Every organisation"}
        {chosen && <BadgeCheck className="h-4 w-4 text-[#2563eb]" />}
      </p>

      <ChevronDown className="pointer-events-none absolute right-5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#667085]" />

      {/* The real control, laid over the card. A styled div that opens a menu
          would be a second implementation of a <select> — this keeps the
          keyboard behaviour and the native picker on a phone. */}
      <select
        aria-label="Organisation"
        value={orgId}
        onChange={(event) => go(event.target.value)}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      >
        <option value="">Every organisation</option>
        {orgs.map((org) => (
          <option key={org.id} value={org.id}>
            {org.name}
          </option>
        ))}
      </select>
    </div>
  );
}
