import { redirect } from "next/navigation";
import {
  Brain,
  CalendarDays,
  Code2,
  Flag,
  Headphones,
  IndianRupee,
  Info,
  Zap,
  type LucideIcon,
} from "lucide-react";

import { RangePicker } from "@/components/admin/RangePicker";
import { requireAdmin } from "@/lib/admin/guard";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";

const RANGES = [
  { days: 1, label: "Today" },
  { days: 7, label: "Last 7 days" },
  { days: 30, label: "Last 30 days" },
];

/* "8 – 14 Aug 2026" rather than "7d".
 *
 * Rendered on the server, where `dynamic = "force-dynamic"` means it is
 * computed once per request — the same instant the numbers beside it were read,
 * so the label and the data can never describe different weeks. */
function rangeLabel(days: number) {
  // eslint-disable-next-line react-hooks/purity -- force-dynamic: one render per request
  const end = new Date();
  const start = new Date(end.getTime() - (days - 1) * 86_400_000);

  const fmt = (date: Date, withMonth: boolean) =>
    date.toLocaleDateString("en-GB", {
      day: "numeric",
      ...(withMonth ? { month: "short" } : {}),
    });

  if (days === 1) return `${fmt(end, true)} ${end.getFullYear()}`;

  /* The month is dropped from the start date only when both ends share it —
     "8 – 14 Aug" reads better than "8 Aug – 14 Aug", but "28 Jul – 3 Aug" needs
     both or it is unreadable. */
  const sameMonth = start.getMonth() === end.getMonth();
  return `${fmt(start, !sameMonth)} – ${fmt(end, true)} ${end.getFullYear()}`;
}

/* The four numbers, and what each one means when it moves.
 *
 * ---------------------------------------------------------------------------
 * WHY A THRESHOLD IS PRINTED NEXT TO EVERY NUMBER
 *
 * A dashboard of bare numbers is a dashboard nobody acts on. "Cost per student
 * ₹47" means nothing to whoever opens this at 9am; "₹47, and the alert is at
 * ₹60" means something immediately.
 *
 * These are also the numbers an alert should be wired to. Until one is, this
 * page is the alert, and someone has to look at it — which is worth saying out
 * loud rather than pretending a dashboard is monitoring. */

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Health · PaperPath",
  robots: { index: false, follow: false },
};

type Snapshot = {
  days: number;
  activeStudents: number;
  costInr: number;
  costPerStudentInr: number | null;
  teachingTurns: number;
  verdictParseFailures: number;
  verdictFailureRate: number | null;
  providerFallbacks: number;
  diagnosesFromModel: number;
  diagnosesTotal: number;
  modelDiagnosisShare: number | null;
  p95LatencyMs: number;
};

export default async function HealthPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const admin = await requireAdmin();

  if (!admin.ok) {
    if (admin.status === 401) redirect("/login?next=/admin/health");
    return (
      <main className="max-w-lg">
        <h1 className="font-display text-2xl font-extrabold">Not found</h1>
      </main>
    );
  }

  if (!isAdminConfigured()) {
    return (
      <main className="max-w-lg">
        <p className="text-[15px] opacity-70">
          Set <code>SUPABASE_SERVICE_ROLE_KEY</code>.
        </p>
      </main>
    );
  }

  const { days } = await searchParams;
  const window = Math.min(90, Math.max(1, Number(days) || 7));

  const db = createAdminClient();

  const [{ data, error }, { data: cohorts }, { data: openFlags }] = await Promise.all([
    db.rpc("health_snapshot", { p_days: window }),
    /* Eight weeks is enough to see a trend and short enough that a change made
       last month is still visible at the top rather than averaged away. */
    db.rpc("activation_by_cohort", { p_weeks: 8 }),
    /* The safety queue, unreviewed.
       Every other number on this page is about cost or latency. This one is
       about whether anybody is doing the job — the queue at /admin/safety has
       a tool and no owner, and an unread queue is indistinguishable from an
       empty one until somebody opens it. A number with an age next to it is
       the smallest thing that makes the silence visible, and the only part of
       that problem code can do anything about. */
    db
      .from("safety_flags")
      .select("created_at, severity")
      .eq("status", "open")
      .order("created_at"),
  ]);

  if (error) {
    return (
      <main className="max-w-lg">
        <h1 className="font-display text-2xl font-extrabold">Not set up</h1>
        <p className="mt-3 text-[15px] opacity-70">
          Run <code>supabase/analytics.sql</code>. ({error.message})
        </p>
      </main>
    );
  }

  const snapshot = data as unknown as Snapshot;

  const flags = (openFlags ?? []) as { created_at: string; severity: string }[];
  const urgent = flags.filter((flag) => flag.severity === "urgent").length;

  /* Hours since the oldest unreviewed flag arrived. The count alone reads as a
     workload; the age reads as a lapse, which is the accurate one. */
  const oldestHours = flags[0]
    ? Math.floor((Date.now() - new Date(flags[0].created_at).getTime()) / 3_600_000)
    : 0;

  const activation = (cohorts ?? []) as {
    cohort_week: string;
    signed_up: number;
    activated: number;
    rate: number | null;
  }[];

  return (
    <main className="mx-auto max-w-[1180px]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#e0edff] text-[#2563eb]">
            <CalendarDays className="h-5 w-5" />
          </span>

          <div>
            <h1 className="text-[1.9rem] font-extrabold leading-tight tracking-[-0.03em] text-[#0d1015]">
              Last {snapshot.days} days
            </h1>
            <p className="mt-0.5 text-[14px] text-[#4b5565]">
              {snapshot.activeStudents} active student
              {snapshot.activeStudents === 1 ? "" : "s"} · {snapshot.teachingTurns} teaching turns
            </p>
          </div>
        </div>

        <RangePicker days={window} label={rangeLabel(window)} options={RANGES} />
      </div>

      {/* Two columns from `xl`. Five metrics in one narrow stack meant the
          bottom two were below the fold on a laptop, and the whole argument for
          this page is that somebody reads all of it in one glance. */}
      <div className="mt-7 grid gap-4 xl:grid-cols-2">
        {/* First, above cost and latency. Everything below this is about money
            or speed; this one is about whether a flagged child has been looked
            at, and it is the only number here that can be a safeguarding
            failure rather than a bill. */}
        <Metric
          icon={Flag}
          tint="bg-[#e0edff] text-[#2563eb]"
          label="Safety flags waiting for a human"
          value={String(flags.length)}
          detail={
            flags.length === 0
              ? "queue clear"
              : `${urgent} urgent · oldest ${oldestHours}h old`
          }
          threshold="Any urgent flag older than a few hours is the alert. This queue has a tool and no named owner — until it has one, this number is the only thing standing between a flagged message and nobody reading it."
          bad={urgent > 0 || oldestHours > 24}
        />

        <Metric
          icon={IndianRupee}
          tint="bg-[#e6f7ec] text-[#16a34a]"
          label="Cost per active student"
          value={
            snapshot.costPerStudentInr === null
              ? "—"
              : `₹${snapshot.costPerStudentInr.toFixed(2)}`
          }
          detail={`₹${Number(snapshot.costInr).toFixed(2)} total`}
          threshold="Alert at 50% above your own baseline. A buggy retry loop can eat a month's budget in one night, and this is the only place it shows before the invoice."
          bad={Boolean(snapshot.costPerStudentInr && snapshot.costPerStudentInr > 60)}
        />

        <Metric
          icon={Code2}
          tint="bg-[#ffeede] text-[#ea580c]"
          label="Verdict parse failures"
          value={
            snapshot.verdictFailureRate === null
              ? "—"
              : `${(snapshot.verdictFailureRate * 100).toFixed(1)}%`
          }
          detail={`${snapshot.verdictParseFailures} of ${snapshot.teachingTurns} turns`}
          threshold="Above 5% the model has quietly stopped emitting the verdict block. Every transition then falls back to 'did not understand', and students get reteaches they did not earn. Usually means the model was changed to a weaker one."
          bad={Boolean(snapshot.verdictFailureRate && snapshot.verdictFailureRate > 0.05)}
        />

        <Metric
          icon={Brain}
          tint="bg-[#efeaff] text-[#7c3aed]"
          label="Diagnoses coming from a model"
          value={
            snapshot.modelDiagnosisShare === null
              ? "—"
              : `${(snapshot.modelDiagnosisShare * 100).toFixed(0)}%`
          }
          detail={`${snapshot.diagnosesFromModel} of ${snapshot.diagnosesTotal}`}
          threshold="Above 25% the distractor maps are too thin. The fix is more content, not a better model — a mapped distractor is free, instant and right every time, and a model's guess is none of those."
          bad={Boolean(snapshot.modelDiagnosisShare && snapshot.modelDiagnosisShare > 0.25)}
        />

        <Metric
          icon={Headphones}
          tint="bg-[#e0edff] text-[#2563eb]"
          label="p95 latency, teaching calls"
          value={`${(snapshot.p95LatencyMs / 1000).toFixed(1)}s`}
          detail={`${snapshot.providerFallbacks} provider fallback${snapshot.providerFallbacks === 1 ? "" : "s"}`}
          threshold="Total call latency, which is the closest proxy we record for first-token latency — the thing a student actually feels. Above 8s the tutor reads as broken."
          bad={snapshot.p95LatencyMs > 8000}
        />
      </div>

      {/* --- Activation ------------------------------------------------------
          The one number, and it sits below the health metrics rather than above
          them for a reason: if the tutor is broken, activation is a measurement
          of a broken product. Fix the four above first, then read this. */}
      <section className="mt-4 rounded-2xl border border-[#e9eaee] bg-white p-6">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#efeaff] text-[#7c3aed]">
            <Zap className="h-[18px] w-[18px]" />
          </span>
          <h2 className="text-[1.15rem] font-extrabold tracking-[-0.02em] text-[#0d1015]">
            Activation
          </h2>
        </div>

        <p className="mt-3 text-[13.5px] leading-[1.6] text-[#4b5565]">
          Students reaching Developing (40+) on at least one topic within 48 hours of signing up.
          Below 40 they have watched a lesson; above it they have been taught a topic and shown
          they can do the ordinary questions on it — and the ones who feel that on day one are the
          ones who come back on day three.
        </p>

        <p className="mt-2 text-[13px] leading-[1.6] text-[#667085]">
          By weekly cohort, because a single lifetime number goes up and to the right whatever
          happens. Onboarding should be designed backwards from this column and nothing else.
        </p>

        <div className="mt-5 overflow-x-auto">
          {activation.length === 0 ? (
            <p className="text-[14px] text-[#667085]">No sign-ups yet in the window.</p>
          ) : (
            <table className="w-full min-w-[460px] text-[14px]">
              <thead>
                <tr className="border-b border-[#eceef1] text-left text-[12.5px] font-semibold text-[#4b5565]">
                  <th className="pb-2.5 pr-4 font-semibold">Week</th>
                  <th className="pb-2.5 pr-4 font-semibold">Signed up</th>
                  <th className="pb-2.5 pr-4 font-semibold">Activated</th>
                  <th className="pb-2.5 text-right font-semibold">Rate</th>
                </tr>
              </thead>
              <tbody>
                {activation.map((row) => {
                  const rate = row.rate === null ? null : Math.round(Number(row.rate) * 100);

                  return (
                    <tr key={row.cohort_week} className="border-b border-[#f2f3f5] last:border-0">
                      <td className="py-3 pr-4 text-[#14171c]">{row.cohort_week}</td>
                      <td className="py-3 pr-4 text-[#4b5565]">{row.signed_up}</td>
                      <td className="py-3 pr-4 text-[#4b5565]">{row.activated}</td>
                      <td className="py-3 text-right">
                        {rate === null ? (
                          <span className="text-[#667085]">—</span>
                        ) : (
                          /* Green above 30, amber below. The threshold is on
                             the pill rather than in a footnote, because a bare
                             "33%" tells a reader nothing about whether that is
                             a good week or a bad one. */
                          <span
                            className={`inline-block rounded-full px-2.5 py-1 text-[12px] font-bold ${
                              rate >= 30
                                ? "bg-[#e6f7ec] text-[#15803d]"
                                : "bg-[#fef0d8] text-[#b45309]"
                            }`}
                          >
                            {rate}%
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="mt-5 flex items-start gap-3 rounded-xl border border-[#d6e4ff] bg-[#f4f8ff] px-4 py-3 text-[13px] leading-[1.55] text-[#1e40af]">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Nothing alerts on these yet. Until something does, this page is the monitoring and
            someone has to open it — a dashboard is not an alert, and pretending otherwise is how
            a cost spike runs for a fortnight.
          </span>
        </div>
      </section>
    </main>
  );
}

function Metric({
  icon: Icon,
  tint,
  label,
  value,
  detail,
  threshold,
  bad,
}: {
  icon: LucideIcon;
  tint: string;
  label: string;
  value: string;
  detail: string;
  threshold: string;
  bad: boolean;
}) {
  return (
    <div
      className={`flex h-full flex-col rounded-2xl border bg-white p-5 ${
        bad ? "border-[#fecaca]" : "border-[#e9eaee]"
      }`}
    >
      <div className="flex items-start gap-3.5">
        {/* The tile is colour-coded by what the metric is ABOUT — money, model,
            latency, safeguarding — not by whether it is currently bad. The
            border and the number carry the alarm, so a healthy page still reads
            as five distinguishable things rather than five grey boxes. */}
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tint}`}
        >
          <Icon className="h-[18px] w-[18px]" />
        </span>

        <div className="min-w-0 flex-1">
          <h2 className="text-[14.5px] font-bold text-[#0d1015]">{label}</h2>
          <p className="mt-0.5 text-[12.5px] text-[#667085]">{detail}</p>
        </div>

        <span
          className={`shrink-0 text-[1.75rem] font-extrabold leading-none tracking-[-0.02em] ${
            bad ? "text-[#dc2626]" : "text-[#0d1015]"
          }`}
        >
          {value}
        </span>
      </div>

      {/* The threshold, not just the number. "₹47" means nothing to whoever
          opens this at 9am; "₹47, and the alert is at ₹60" means something
          immediately. Kept at the bottom of the card so the numbers line up
          across a row whatever length the explanation runs to. */}
      <p className="mt-3 border-t border-[#f2f3f5] pt-3 text-[12.5px] leading-[1.55] text-[#4b5565]">
        {threshold}
      </p>
    </div>
  );
}
