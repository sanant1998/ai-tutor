-- PaperPath — the built-in event store
--
-- Run after compliance.sql.
--
-- ---------------------------------------------------------------------------
-- WHY THE APP COLLECTS ITS OWN EVENTS
--
-- The alternative was an analytics SDK, and for this product that is a bad
-- trade: a dependency, a script on the client, and — with most vendors —
-- third-party cookies on pages used by children, which is the exact thing the
-- consent design exists to avoid.
--
-- The four numbers that say whether the thing is working (cost per student,
-- verdict parse failures, the share of diagnoses coming from a model, p95
-- first-token latency) are all answerable from Postgres. So they are.
--
-- NEXT_PUBLIC_ANALYTICS_URL can still point somewhere else. This is the
-- default so that an unconfigured deployment can still tell it is broken,
-- which was the previous state's real failing.
--
-- ---------------------------------------------------------------------------
-- WHAT MAY NEVER GO IN HERE
--
-- No message text, no answers, no names, no phone numbers. lib/analytics
-- rejects property names that look like free text, and this table is the
-- reason that check is worth having: it is the one store whose whole purpose
-- is being queried in bulk later by someone who was not there when it was
-- written.
-- ---------------------------------------------------------------------------

create table if not exists public.analytics_events (
  id         bigserial primary key,
  event      text not null,
  -- Nullable on purpose: client-side UI events arrive without one, and an
  -- event that cannot be tied to a person is the better default.
  user_id    uuid references auth.users on delete set null,
  properties jsonb not null default '{}'::jsonb,
  at         timestamptz not null default now()
);

create index if not exists analytics_events_at_idx on public.analytics_events (at desc);
create index if not exists analytics_events_name_idx on public.analytics_events (event, at desc);

alter table public.analytics_events enable row level security;
-- No policy. Written by the collector with the service-role key, read by the
-- health dashboard the same way. A student can neither read nor write it.

-- ---------------------------------------------------------------------------
-- The four numbers, as one query
--
-- Written here rather than in the dashboard so that "cost per active student"
-- means one thing in the product and in any spreadsheet someone builds later.
-- ---------------------------------------------------------------------------
create or replace function public.health_snapshot(p_days int default 7)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  v_since timestamptz := now() - make_interval(days => p_days);
  v_cost numeric;
  v_students int;
  v_verdict_fail int;
  v_turns int;
  v_llm_diagnoses int;
  v_all_diagnoses int;
  v_p95 int;
  v_fallbacks int;
begin
  select coalesce(sum(cost_inr), 0), count(*) filter (where purpose in ('teach','check'))
    into v_cost, v_turns
    from public.llm_calls where created_at >= v_since;

  select count(distinct user_id) into v_students
    from public.learning_sessions where started_at >= v_since;

  select count(*) into v_verdict_fail
    from public.analytics_events
   where event = 'verdict_parse_failed' and at >= v_since;

  select count(*) into v_fallbacks
    from public.llm_calls where fell_back and created_at >= v_since;

  select count(*) filter (where source = 'llm'), count(*)
    into v_llm_diagnoses, v_all_diagnoses
    from public.error_events where created_at >= v_since;

  -- p95 first-token latency is not recorded directly; total call latency is
  -- the closest honest proxy and is labelled as such on the dashboard.
  select coalesce(
           percentile_disc(0.95) within group (order by latency_ms), 0
         )::int
    into v_p95
    from public.llm_calls
   where created_at >= v_since and purpose in ('teach','check') and latency_ms is not null;

  return jsonb_build_object(
    'days', p_days,
    'activeStudents', v_students,
    'costInr', round(v_cost, 2),
    'costPerStudentInr',
      case when v_students > 0 then round(v_cost / v_students, 2) else null end,
    'teachingTurns', v_turns,
    'verdictParseFailures', v_verdict_fail,
    'verdictFailureRate',
      case when v_turns > 0 then round(v_verdict_fail::numeric / v_turns, 4) else null end,
    'providerFallbacks', v_fallbacks,
    'diagnosesFromModel', v_llm_diagnoses,
    'diagnosesTotal', v_all_diagnoses,
    'modelDiagnosisShare',
      case when v_all_diagnoses > 0
        then round(v_llm_diagnoses::numeric / v_all_diagnoses, 4) else null end,
    'p95LatencyMs', v_p95
  );
end;
$$;

revoke all on function public.health_snapshot(int) from public;

-- ---------------------------------------------------------------------------
-- Activation
--
-- The one number. lib/analytics/events.ts has defined it since the taxonomy
-- was written and nothing computed it, which made "design onboarding backwards
-- from activation" advice nobody could act on.
--
--   A student is activated when they reach the Developing band (40+) on at
--   least one topic within 48 hours of signing up.
--
-- Why that definition: below 40 a student has watched a lesson; above it they
-- have been taught a topic AND shown they can do the ordinary questions on it.
-- And 48 hours because the students who come back on day three are almost
-- entirely the ones who felt the thing work on day one.
--
-- Reported as a cohort so it can be read as a trend. A single lifetime number
-- goes up and to the right whatever happens and tells nobody anything.
-- ---------------------------------------------------------------------------
create or replace function public.activation_by_cohort(p_weeks int default 8)
returns table (
  cohort_week date,
  signed_up   int,
  activated   int,
  rate        numeric
)
language sql
stable
security definer set search_path = public
as $$
  with cohorts as (
    select
      u.id,
      date_trunc('week', u.created_at)::date as week,
      u.created_at
    from auth.users u
    where u.created_at >= now() - make_interval(weeks => p_weeks)
  ),
  first_hit as (
    select
      c.id,
      c.week,
      min(m.updated_at) filter (where m.score >= 40) as reached_at,
      c.created_at
    from cohorts c
    left join public.topic_mastery m on m.user_id = c.id
    group by c.id, c.week, c.created_at
  )
  select
    week as cohort_week,
    count(*)::int as signed_up,
    count(*) filter (
      where reached_at is not null
        and reached_at <= created_at + interval '48 hours'
    )::int as activated,
    round(
      count(*) filter (
        where reached_at is not null
          and reached_at <= created_at + interval '48 hours'
      )::numeric / nullif(count(*), 0),
      3
    ) as rate
  from first_hit
  group by week
  order by week desc;
$$;

revoke all on function public.activation_by_cohort(int) from public;

-- ---------------------------------------------------------------------------
-- Retention for the event store
--
-- Flagged in docs/legal-review.md and not implemented at the time. The table
-- holds no free text — property names matching message/content/answer/name/
-- phone/email/transcript/excerpt are rejected at both the client and the
-- collector — but it is still per-student behavioural data, and behavioural
-- data about children with no expiry is exactly what the rest of this schema
-- exists to avoid.
--
-- 13 months, matching llm_calls, so a year-on-year comparison still works.
-- ---------------------------------------------------------------------------
create or replace function public.purge_analytics()
returns int
language plpgsql
security definer set search_path = public
as $$
declare
  v_count int;
begin
  delete from public.analytics_events where at < now() - interval '13 months';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Errors, when nothing else is collecting them
--
-- lib/observability.ts posts to ERROR_REPORT_URL when one is set and falls back
-- to this table when it is not. That fallback is the point: before it, every
-- failure path called console.error and stopped, which on a serverless host is
-- a line nobody reads, rotated out in a week. The first sign a route was 500ing
-- was a student saying so — and students do not say so, they close the tab.
--
-- Carries no student text. lib/observability.ts drops context keys matching
-- message/content/answer/name/phone/email/transcript/excerpt/body/prompt, and
-- anything longer than 120 characters, because a catch block is exactly where
-- someone attaches a student's words without thinking about it.
-- ---------------------------------------------------------------------------
create table if not exists public.error_reports (
  id         bigserial primary key,
  where_     text not null,
  kind       text,
  message    text,
  stack      text,
  context    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- PostgREST maps the column name directly, and `where` is reserved — hence the
-- trailing underscore in the column and the alias below, so the app can insert
-- `where` and read `where` without either side knowing.
create or replace view public.error_reports_view as
  select id, where_ as where, kind, message, stack, context, created_at
    from public.error_reports;

create index if not exists error_reports_at_idx on public.error_reports (created_at desc);
create index if not exists error_reports_where_idx on public.error_reports (where_, created_at desc);

alter table public.error_reports enable row level security;
-- No policy. Written and read with the service-role key only.

create or replace function public.purge_error_reports()
returns int
language plpgsql
security definer set search_path = public
as $$
declare
  v_count int;
begin
  -- 90 days. Long enough to see a pattern, short enough that a stack trace
  -- naming an internal path does not sit around for a year.
  delete from public.error_reports where created_at < now() - interval '90 days';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
