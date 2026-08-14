import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertTriangle,
  Armchair,
  Calendar,
  ChevronRight,
  FileText,
  LayoutGrid,
  School,
  Send,
  ShieldCheck,
  Users,
  type LucideIcon,
} from "lucide-react";

import { requireContentAccess } from "@/lib/admin/access";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";
import { BOARDS, boardCoverage, classLabel, countryOfBoard } from "@/lib/syllabus";

/* The admin dashboard.
 *
 * ---------------------------------------------------------------------------
 * WHY IT IS NOT A MENU
 *
 * It was five identical cards, which meant the first thing an admin did every
 * morning was guess which console had something in it. All five look equally
 * urgent when none carries a number, so the honest answer to "is anything
 * wrong" was to open each one — and the one that gets skipped is always the
 * safety queue, because it is the only one where nothing being wrong is the
 * normal case.
 *
 * So the page leads with what needs a person, in the order it needs one, and
 * every row carries the button that clears it. A count with nowhere to go is a
 * count nobody clears.
 *
 * ---------------------------------------------------------------------------
 * EVERY NUMBER ON THIS PAGE IS READ FROM A TABLE
 *
 * Including the chart, which is attempts per day — not a shape drawn to look
 * like growth. If there were no attempts the line would sit flat on zero, and
 * that would be the correct thing for it to show. The one thing here that is
 * not counted is the curriculum, which is read from lib/syllabus.ts: a chapter
 * list existing in the database is not the same as it having been sourced.
 *
 * ---------------------------------------------------------------------------
 * WHAT AN ORG ADMIN SEES
 *
 * Their own school, and nothing about anybody else's. The scoping is applied
 * in the query rather than after it, so another school's rows never cross the
 * wire. Health and the safety queue are vendor-only, including their counts:
 * a number an org admin cannot click through to is worse than no number. */

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Admin · PaperPath",
  robots: { index: false, follow: false },
};

type Task = {
  href: string;
  label: string;
  detail: string;
  cta: string;
  icon: LucideIcon;
  tone: "urgent" | "warn" | "info";
};

/* Literal, light-only. See the note in AdminNav.tsx: the admin area is pinned
   light, and new code here does not add to the pile of `dark:` utilities that
   globals.css has to undo with !important. */
const TONE = {
  urgent: {
    ring: "border-[#fecaca] bg-[#fef4f4]",
    tile: "bg-[#fee2e2] text-[#dc2626]",
    dot: "bg-[#dc2626]",
    title: "text-[#b91c1c]",
    button: "border border-[#fca5a5] text-[#b91c1c] hover:bg-[#fee2e2]",
  },
  warn: {
    ring: "border-[#fde3b8] bg-[#fffbf3]",
    tile: "bg-[#fef0d8] text-[#d97706]",
    dot: "bg-[#f59e0b]",
    title: "text-[#b45309]",
    button: "border border-[#f5c77e] text-[#b45309] hover:bg-[#fef0d8]",
  },
  info: {
    ring: "border-[#d6e4ff] bg-[#f4f8ff]",
    tile: "bg-[#dbeafe] text-[#2563eb]",
    dot: "bg-[#2563eb]",
    title: "text-[#1d4ed8]",
    button: "bg-[#2563eb] text-white hover:bg-[#1d4ed8]",
  },
} as const;

const QUICK_ACTIONS: { href: string; label: string; icon: LucideIcon; vendorOnly?: boolean }[] = [
  { href: "/admin/schools", label: "Add new school", icon: School },
  { href: "/admin/content", label: "Publish content", icon: Send },
  { href: "/admin/safety", label: "View safety queue", icon: AlertTriangle, vendorOnly: true },
  { href: "/admin/audit", label: "Audit trail", icon: ShieldCheck },
];

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

export default async function AdminDashboardPage() {
  const admin = await requireContentAccess();

  if (!admin.ok) {
    if (admin.status === 401) redirect("/login?next=/admin");

    return (
      <main className="max-w-lg py-16">
        <h1 className="text-2xl font-extrabold">Not found</h1>
        {admin.status === 503 && <p className="mt-3 text-[14px] opacity-65">{admin.message}</p>}
      </main>
    );
  }

  const vendor = admin.visibility.superAdmin;
  const mine = admin.visibility.adminOf;
  const configured = isAdminConfigured();

  /* Read once, at the top, and threaded through everything that needs it.
   *
   * The lint rule that objects to Date.now() in render is right about client
   * components and wrong here: this page is `force-dynamic`, so it renders
   * once per request on the server and never re-renders. Reading it once also
   * means every age on the page is measured from the same instant. */
  // eslint-disable-next-line react-hooks/purity -- force-dynamic: one render per request
  const now = Date.now();

  const tasks: Task[] = [];
  let estate = { orgs: 0, sections: 0, students: 0, seatsSold: 0 };
  let published = 0;
  let activity: { day: string; label: string; count: number }[] = [];

  if (configured) {
    const db = createAdminClient();

    /* A sentinel id when they administer nothing, so the filter matches no
       rows. `in("org_id", [])` is the shape that quietly returns everything in
       some clients, and "quietly returns everything" is the one failure mode
       this scoping exists to prevent. */
    const scope = mine.length > 0 ? mine : ["00000000-0000-0000-0000-000000000000"];

    /* Seven days including today, so the chart always has seven points even
       where a day had no attempts — a gap and a zero mean different things. */
    const since = new Date(now - 6 * 86_400_000);
    since.setHours(0, 0, 0, 0);

    const [
      orgRows,
      sectionRows,
      memberRows,
      licenceRows,
      draftRows,
      topicRows,
      yearRows,
      flagRows,
      attemptRows,
    ] = await Promise.all([
      vendor
        ? db.from("orgs").select("id, name, seats")
        : db.from("orgs").select("id, name, seats").in("id", scope),
      vendor
        ? db.from("sections").select("id, org_id")
        : db.from("sections").select("id, org_id").in("org_id", scope),
      vendor
        ? db.from("org_members").select("user_id, org_id, role")
        : db.from("org_members").select("user_id, org_id, role").in("org_id", scope),
      vendor
        ? db.from("licences").select("id, org_id, seats_purchased, expires_on, status")
        : db
            .from("licences")
            .select("id, org_id, seats_purchased, expires_on, status")
            .in("org_id", scope),
      vendor
        ? db.from("content_drafts").select("id, status")
        : db.from("content_drafts").select("id, status").in("org_id", scope),
      db.from("topics").select("id", { count: "exact", head: true }),
      /* The current year is a row in academic_years with is_current set, not a
         column on orgs — the org points at no year, and the year knows which
         org it belongs to. */
      vendor
        ? db.from("academic_years").select("org_id").eq("is_current", true)
        : db.from("academic_years").select("org_id").eq("is_current", true).in("org_id", scope),
      /* Vendor only, deliberately: the queue holds flagged messages from every
         organisation's children. */
      vendor
        ? db
            .from("safety_flags")
            .select("created_at, severity")
            .eq("status", "open")
            .order("created_at")
        : Promise.resolve({ data: [] as { created_at: string; severity: string }[] }),
      db.from("attempts").select("created_at").gte("created_at", since.toISOString()),
    ]);

    const orgs = (orgRows.data ?? []) as { id: string; name: string; seats: number }[];
    const members = memberRows.data ?? [];
    const licences = (licenceRows.data ?? []) as {
      org_id: string;
      expires_on: string;
      status: string;
    }[];
    const draftList = (draftRows.data ?? []) as { status: string }[];
    const flags = (flagRows.data ?? []) as { created_at: string; severity: string }[];
    const withYear = new Set(((yearRows.data ?? []) as { org_id: string }[]).map((r) => r.org_id));

    /* Counted by what a student IS, not by what they are not. `!== "teacher"`
       silently counted every org_admin as a child, and tenancy.sql closes the
       column to ('student', 'teacher', 'org_admin'). */
    const students = members.filter((m) => (m as { role?: string }).role === "student").length;

    estate = {
      orgs: orgs.length,
      sections: (sectionRows.data ?? []).length,
      students,
      /* orgs.seats, which is what the seat guard and the schools console both
         read. The licences table is the billing record and is empty for any
         org created before licensing.sql — taking the cap from there would
         report "0 seats" for a school that is working perfectly well. */
      seatsSold: orgs.reduce((total, org) => total + Number(org.seats ?? 0), 0),
    };

    published = topicRows.count ?? 0;

    /* ---- The chart ----------------------------------------------------- */
    const buckets = new Map<string, number>();
    for (let i = 6; i >= 0; i -= 1) {
      buckets.set(new Date(now - i * 86_400_000).toISOString().slice(0, 10), 0);
    }

    for (const row of (attemptRows.data ?? []) as { created_at: string }[]) {
      const key = row.created_at.slice(0, 10);
      if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }

    activity = [...buckets].map(([day, count]) => ({
      day,
      label: new Date(`${day}T00:00:00`).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
      }),
      count,
    }));

    /* ---- What wants a person, most urgent first ------------------------ */
    if (vendor && flags.length > 0) {
      const urgent = flags.filter((f) => f.severity === "urgent").length;
      const hours = Math.floor((now - new Date(flags[0].created_at).getTime()) / 3_600_000);

      tasks.push({
        href: "/admin/safety",
        icon: AlertTriangle,
        tone: urgent > 0 ? "urgent" : "warn",
        label:
          urgent > 0
            ? `${plural(urgent, "urgent flag")} unreviewed`
            : `${plural(flags.length, "flag")} unreviewed`,
        /* The age, not just the count. A count reads as a workload; an age
           reads as a lapse, and a lapse is the accurate word for a safety
           queue nobody has opened since Tuesday. */
        detail:
          hours >= 24
            ? `Oldest has waited ${Math.floor(hours / 24)} days. These are reviewed the same day.`
            : `Oldest has waited ${hours}h. These are reviewed the same day.`,
        cta: "Review now",
      });
    }

    /* "approved" is not published. It is the state a draft reaches when a
       reviewer has said yes and nobody has pressed the button, which is the
       easiest place in this product for work to be silently lost. */
    const waiting = draftList.filter(
      (d) => d.status === "in_review" || d.status === "approved",
    ).length;

    if (waiting > 0) {
      tasks.push({
        href: "/admin/content",
        icon: FileText,
        tone: "info",
        label: `${plural(waiting, "draft")} awaiting publish`,
        detail: "Nothing reaches a student until somebody presses publish.",
        cta: "Review drafts",
      });
    }

    /* A licence that lapses takes every student in that school offline through
       can_access_chapter, with no warning to them and no error anybody can
       read. Thirty days is enough to get a renewal through a school's accounts
       department, which is the actual constraint. */
    const soon = new Date(now + 30 * 86_400_000);

    for (const licence of licences.filter(
      (l) => l.status === "active" && new Date(l.expires_on) <= soon,
    )) {
      const org = orgs.find((o) => o.id === licence.org_id);
      const days = Math.ceil((new Date(licence.expires_on).getTime() - now) / 86_400_000);

      tasks.push({
        href: "/admin/schools",
        icon: School,
        tone: days <= 7 ? "urgent" : "warn",
        label:
          days < 0
            ? `${org?.name ?? "A school"} — licence expired`
            : `${org?.name ?? "A school"} — licence ends in ${plural(days, "day")}`,
        detail: "Every student there loses access the day it lapses.",
        cta: "Renew",
      });
    }

    for (const org of orgs.filter((o) => !withYear.has(o.id))) {
      tasks.push({
        href: "/admin/schools",
        icon: School,
        tone: "warn",
        label: `${org.name} — no current academic year`,
        detail: "Sections cannot be tied to a year, and promotion has nothing to promote into.",
        cta: "Fix now",
      });
    }

    if (estate.seatsSold > 0 && estate.students >= estate.seatsSold) {
      tasks.push({
        href: "/admin/schools",
        icon: Armchair,
        tone: "warn",
        label: `Seats full — ${estate.students}/${estate.seatsSold}`,
        detail: "The next roster import will be refused.",
        cta: "Add seats",
      });
    }
  }

  /* Derived from lib/syllabus.ts, so it cannot claim a board the product does
     not have. This is the direct answer to "can we sell into Texas yet". */
  const coverage = BOARDS.map((board) => ({ board, ...boardCoverage(board.id) }));
  const openBoards = coverage.filter((row) => row.levels.length > 0).length;

  const today = new Date(now).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <main className="mx-auto max-w-[1180px]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[1.9rem] font-extrabold tracking-[-0.03em] text-[#0d1015]">
            {vendor ? "Platform overview" : "Your organisation"}
          </h1>
          <p className="mt-1.5 text-[14.5px] text-[#4b5565]">
            {vendor
              ? "What is happening across every school today."
              : "What is happening in your school today."}
          </p>
        </div>

        {/* A stamp, not a control. A date picker here would imply the page can
            show yesterday, and it cannot — every number on it is current. */}
        <span className="inline-flex items-center gap-2 rounded-xl border border-[#e4e6ea] bg-white px-3.5 py-2 text-[13.5px] font-medium text-[#4b5565]">
          <Calendar className="h-4 w-4 opacity-60" />
          {today}
        </span>
      </div>

      {!configured && (
        <p className="mt-6 rounded-xl border border-[#fde3b8] bg-[#fffbf3] px-4 py-3 text-[14px] text-[#b45309]">
          <code>SUPABASE_SERVICE_ROLE_KEY</code> is not set, so the numbers below cannot be read.
          The modules still open.
        </p>
      )}

      {/* Absent when there is nothing, rather than a reassuring empty panel. A
          permanent "0 items" box is furniture, and furniture gets ignored along
          with whatever appears in it later. */}
      {configured && tasks.length > 0 && (
        <section className="mt-7">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#667085]">
            Needs your attention
          </h2>

          <div className="mt-3 grid gap-4 lg:grid-cols-2">
            {tasks.map((task, index) => {
              const tone = TONE[task.tone];

              return (
                <div
                  key={`${task.href}-${index}`}
                  className={`flex items-start gap-4 rounded-2xl border p-5 ${tone.ring}`}
                >
                  <span
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tone.tile}`}
                  >
                    <task.icon className="h-5 w-5" />
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className={`flex items-center gap-2 text-[15px] font-bold ${tone.title}`}>
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${tone.dot}`} />
                      <span className="min-w-0">{task.label}</span>
                    </p>
                    <p className="mt-1.5 text-[13.5px] leading-[1.5] text-[#4b5565]">
                      {task.detail}
                    </p>
                  </div>

                  <Link
                    href={task.href}
                    className={`shrink-0 rounded-xl px-4 py-2 text-[13.5px] font-bold transition-colors ${tone.button}`}
                  >
                    {task.cta}
                  </Link>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {configured && tasks.length === 0 && (
        <p className="mt-7 rounded-2xl border border-[#dcf0e3] bg-[#f4fbf6] px-5 py-4 text-[14px] text-[#166534]">
          Nothing waiting. No unreviewed flags, no drafts to publish, and no licence ending within
          a month.
        </p>
      )}

      {configured && (
        <section className="mt-8">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#667085]">
            {vendor ? "Estate overview" : "Your school"}
          </h2>

          <dl className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat
              icon={School}
              tint="bg-[#efeaff] text-[#7c3aed]"
              label="Schools"
              value={estate.orgs}
              hint={vendor ? "Total schools" : "Your organisation"}
            />
            <Stat
              icon={LayoutGrid}
              tint="bg-[#e6f7ec] text-[#16a34a]"
              label="Sections"
              value={estate.sections}
              hint="Total sections"
            />
            <Stat
              icon={Users}
              tint="bg-[#e0edff] text-[#2563eb]"
              label="Students"
              value={estate.students}
              hint="Enrolled on a seat"
            />
            <Stat
              icon={Armchair}
              tint="bg-[#ffeede] text-[#ea580c]"
              label="Seats"
              value={estate.seatsSold > 0 ? `${estate.students}/${estate.seatsSold}` : "—"}
              hint={estate.seatsSold > 0 ? "Occupied / total" : "No seats sold yet"}
            />
          </dl>
        </section>
      )}

      <section className="mt-8 grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <div className="rounded-2xl border border-[#e9eaee] bg-white p-6">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#667085]">
            Curriculum
          </h2>
          <p className="mt-2 text-[14px] text-[#4b5565]">
            {openBoards} of {BOARDS.length} boards open
            {configured && published > 0 ? ` · ${plural(published, "topic")} published` : ""}
          </p>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[520px] text-left">
              <thead>
                <tr className="border-b border-[#eceef1] text-[10.5px] uppercase tracking-[0.12em] text-[#667085]">
                  <th className="pb-2 pr-3 font-bold">Board</th>
                  <th className="pb-2 pr-3 font-bold">Region</th>
                  <th className="pb-2 pr-3 font-bold">Status / details</th>
                  <th className="pb-2 font-bold" />
                </tr>
              </thead>
              <tbody>
                {coverage.map(({ board, levels, subjects }) => {
                  const country = countryOfBoard(board.id);
                  const open = levels.length > 0;

                  return (
                    <tr key={board.id} className="border-b border-[#f2f3f5] last:border-0">
                      <td className="py-3 pr-3 text-[14px] font-bold text-[#0d1015]">
                        {board.name}
                      </td>
                      <td className="py-3 pr-3 text-[13px] text-[#667085]">
                        {country === "us" ? "US" : "IN"}
                      </td>
                      <td className="py-3 pr-3 text-[13.5px] text-[#4b5565]">
                        {open
                          ? `${classLabel(country, levels[0])}–${levels[levels.length - 1]} · ${subjects.join(", ")}`
                          : "No chapters sourced yet"}
                      </td>
                      <td className="py-3">
                        <span
                          className={`inline-block rounded-full px-2.5 py-1 text-[11px] font-bold ${
                            open ? "bg-[#e6f7ec] text-[#15803d]" : "bg-[#f0f1f4] text-[#6b7280]"
                          }`}
                        >
                          {open ? "Open" : "Pending"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-4">
          <ActivityChart points={activity} />

          <div className="rounded-2xl border border-[#e9eaee] bg-white p-6">
            <h2 className="text-[15px] font-bold text-[#0d1015]">Quick actions</h2>

            <ul className="mt-3 space-y-1.5">
              {QUICK_ACTIONS.filter((action) => vendor || !action.vendorOnly).map((action) => (
                <li key={action.href}>
                  <Link
                    href={action.href}
                    className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-medium text-[#14171c] transition-colors hover:bg-[#f5f6f8]"
                  >
                    <action.icon className="h-4 w-4 shrink-0 text-[#2563eb]" />
                    <span className="min-w-0 flex-1 truncate">{action.label}</span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-[#667085]" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </main>
  );
}

function Stat({
  icon: Icon,
  tint,
  label,
  value,
  hint,
}: {
  icon: LucideIcon;
  tint: string;
  label: string;
  value: number | string;
  hint: string;
}) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-[#e9eaee] bg-white p-5">
      <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${tint}`}>
        <Icon className="h-5 w-5" />
      </span>

      <div className="min-w-0">
        <dt className="text-[13px] font-semibold text-[#4b5565]">{label}</dt>
        <dd className="text-[1.6rem] font-extrabold leading-tight tracking-[-0.02em] text-[#0d1015]">
          {value}
        </dd>
        <p className="text-[11.5px] text-[#667085]">{hint}</p>
      </div>
    </div>
  );
}

/* Attempts per day, seven days.
 *
 * Inline SVG rather than a charting library: it is seven points on one series,
 * and the smallest chart library in this space weighs more than the whole
 * admin area. Drawn from the real counts, so a quiet week looks like a quiet
 * week — a dashboard whose line always rises is decoration. */
function ActivityChart({ points }: { points: { day: string; label: string; count: number }[] }) {
  const width = 320;
  const height = 132;
  const pad = { top: 10, right: 6, bottom: 4, left: 26 };

  const counts = points.map((p) => p.count);
  const total = counts.reduce((a, b) => a + b, 0);
  /* Never zero, or every point divides by nothing and lands on the baseline. */
  const peak = Math.max(1, ...counts);

  const x = (i: number) =>
    pad.left + (i * (width - pad.left - pad.right)) / Math.max(1, points.length - 1);
  const y = (v: number) => pad.top + (1 - v / peak) * (height - pad.top - pad.bottom);

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.count)}`).join(" ");
  const area = `${line} L${x(points.length - 1)},${height - pad.bottom} L${x(0)},${height - pad.bottom} Z`;

  return (
    <div className="rounded-2xl border border-[#e9eaee] bg-white p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-bold text-[#0d1015]">Platform activity</h2>
        <span className="text-[12.5px] text-[#667085]">{plural(total, "attempt")} · 7 days</span>
      </div>

      {points.length === 0 ? (
        <p className="mt-4 text-[13.5px] text-[#667085]">No attempts recorded yet.</p>
      ) : (
        <>
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="mt-3 w-full"
            role="img"
            aria-label={`Attempts per day: ${points.map((p) => `${p.label} ${p.count}`).join(", ")}`}
          >
            {/* Two gridlines and their values, so the shape has a scale. A
                sparkline with no numbers can be read as any magnitude. */}
            {[0, peak].map((value) => (
              <g key={value}>
                <line
                  x1={pad.left}
                  x2={width - pad.right}
                  y1={y(value)}
                  y2={y(value)}
                  stroke="#eceef1"
                  strokeWidth={1}
                />
                {/* 9px is already the smallest thing on the page; at the old
                    grey it was 2.5:1 on white and effectively decorative. */}
                <text x={0} y={y(value) + 3.5} fontSize={9} fill="#667085">
                  {value}
                </text>
              </g>
            ))}

            <path d={area} fill="#2563eb" fillOpacity={0.08} />
            <path d={line} fill="none" stroke="#2563eb" strokeWidth={2} strokeLinejoin="round" />

            {points.map((p, i) => (
              <circle key={p.day} cx={x(i)} cy={y(p.count)} r={3} fill="#2563eb" />
            ))}
          </svg>

          <div className="mt-1 flex justify-between text-[10.5px] text-[#667085]">
            <span>{points[0].label}</span>
            <span>{points[points.length - 1].label}</span>
          </div>
        </>
      )}
    </div>
  );
}
