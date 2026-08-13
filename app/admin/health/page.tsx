import Link from "next/link";
import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/admin/guard";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";

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
      <main className="mx-auto max-w-lg px-5 py-20">
        <h1 className="font-display text-2xl font-extrabold">Not found</h1>
      </main>
    );
  }

  if (!isAdminConfigured()) {
    return (
      <main className="mx-auto max-w-lg px-5 py-20">
        <p className="text-[15px] opacity-70">
          Set <code>SUPABASE_SERVICE_ROLE_KEY</code>.
        </p>
      </main>
    );
  }

  const { days } = await searchParams;
  const window = Math.min(90, Math.max(1, Number(days) || 7));

  const db = createAdminClient();

  const [{ data, error }, { data: cohorts }] = await Promise.all([
    db.rpc("health_snapshot", { p_days: window }),
    /* Eight weeks is enough to see a trend and short enough that a change made
       last month is still visible at the top rather than averaged away. */
    db.rpc("activation_by_cohort", { p_weeks: 8 }),
  ]);

  if (error) {
    return (
      <main className="mx-auto max-w-lg px-5 py-20">
        <h1 className="font-display text-2xl font-extrabold">Not set up</h1>
        <p className="mt-3 text-[15px] opacity-70">
          Run <code>supabase/analytics.sql</code>. ({error.message})
        </p>
      </main>
    );
  }

  const snapshot = data as unknown as Snapshot;

  const activation = (cohorts ?? []) as {
    cohort_week: string;
    signed_up: number;
    activated: number;
    rate: number | null;
  }[];

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <nav className="mb-6">
        <Link href="/admin" className="text-[14px] underline opacity-60">
          ← Admin
        </Link>
      </nav>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] opacity-50">
            Health
          </p>
          <h1 className="font-display mt-1 text-[1.8rem] font-extrabold tracking-[-0.03em]">
            Last {snapshot.days} days
          </h1>
        </div>

        <div className="flex gap-2 text-[13px]">
          {[1, 7, 30].map((option) => (
            <Link
              key={option}
              href={`/admin/health?days=${option}`}
              className={`rounded-lg px-3 py-1.5 ${
                window === option ? "bg-black/10 dark:bg-white/15" : "opacity-60"
              }`}
            >
              {option}d
            </Link>
          ))}
        </div>
      </div>

      <p className="mt-3 text-[14px] opacity-65">
        {snapshot.activeStudents} active student
        {snapshot.activeStudents === 1 ? "" : "s"} · {snapshot.teachingTurns} teaching
        turns
      </p>

      <div className="mt-8 space-y-4">
        <Metric
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
      <section className="mt-10">
        <h2 className="font-display text-[19px] font-extrabold tracking-[-0.02em]">
          Activation
        </h2>

        <p className="mt-1.5 text-[14px] opacity-70">
          Students reaching Developing (40+) on at least one topic within 48
          hours of signing up. Below 40 they have watched a lesson; above it they
          have been taught a topic and shown they can do the ordinary questions
          on it — and the ones who feel that on day one are the ones who come
          back on day three.
        </p>

        <p className="mt-1.5 text-[13px] opacity-55">
          By weekly cohort, because a single lifetime number goes up and to the
          right whatever happens. Onboarding should be designed backwards from
          this column and nothing else.
        </p>

        {activation.length === 0 ? (
          <p className="mt-4 text-[14px] opacity-55">
            No sign-ups yet in the window.
          </p>
        ) : (
          <table className="mt-4 w-full text-[14px]">
            <thead>
              <tr className="text-left opacity-55">
                <th className="pb-2 font-medium">Week</th>
                <th className="pb-2 font-medium">Signed up</th>
                <th className="pb-2 font-medium">Activated</th>
                <th className="pb-2 text-right font-medium">Rate</th>
              </tr>
            </thead>
            <tbody>
              {activation.map((row) => (
                <tr key={row.cohort_week} className="border-t border-black/5 dark:border-white/10">
                  <td className="py-2">{row.cohort_week}</td>
                  <td className="py-2">{row.signed_up}</td>
                  <td className="py-2">{row.activated}</td>
                  <td className="py-2 text-right font-semibold">
                    {row.rate === null ? "—" : `${Math.round(Number(row.rate) * 100)}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <p className="mt-8 text-[13px] opacity-55">
        Nothing alerts on these yet. Until something does, this page is the
        monitoring and someone has to open it — a dashboard is not an alert, and
        pretending otherwise is how a cost spike runs for a fortnight.
      </p>
    </main>
  );
}

function Metric({
  label,
  value,
  detail,
  threshold,
  bad,
}: {
  label: string;
  value: string;
  detail: string;
  threshold: string;
  bad: boolean;
}) {
  return (
    <div
      className="rounded-xl border p-5"
      style={{
        borderColor: bad ? "rgb(220 38 38 / 0.5)" : "rgb(128 128 128 / 0.2)",
      }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-semibold">{label}</h2>
        <span
          className="font-display text-2xl font-extrabold"
          style={{ color: bad ? "#dc2626" : undefined }}
        >
          {value}
        </span>
      </div>

      <p className="mt-1 text-[13px] opacity-55">{detail}</p>
      <p className="mt-2 text-[13px] opacity-70">{threshold}</p>
    </div>
  );
}
