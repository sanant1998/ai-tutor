"use client";

/* The window this page is reporting on.
 *
 * It shows the dates rather than "7d". A reviewer comparing this against an
 * invoice or a support thread needs to know which days are in it, and "7d"
 * makes them work that out from today's date every time.
 *
 * The control underneath is a real <select> laid transparently over the chip —
 * the same trick as the org picker. A styled div plus a menu would be a second
 * implementation of a native control, and would lose the keyboard behaviour and
 * the system picker on a phone for nothing. */

import { useRouter } from "next/navigation";
import { CalendarDays, ChevronDown } from "lucide-react";

export function RangePicker({
  days,
  label,
  options,
}: {
  days: number;
  label: string;
  /* Rendered by the server, which is the only side that knows what "30 days"
     spans without disagreeing with the numbers already on the page. */
  options: { days: number; label: string }[];
}) {
  const router = useRouter();

  return (
    <div className="relative inline-flex items-center gap-2.5 rounded-xl border border-[#e4e6ea] bg-white py-2.5 pl-3.5 pr-9 text-[13.5px] font-medium text-[#14171c]">
      <CalendarDays className="h-4 w-4 shrink-0 text-[#667085]" />
      {label}
      <ChevronDown className="pointer-events-none absolute right-3 h-4 w-4 text-[#667085]" />

      <select
        aria-label="Reporting window"
        value={days}
        onChange={(event) => router.push(`/admin/health?days=${event.target.value}`)}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      >
        {options.map((option) => (
          <option key={option.days} value={option.days}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
