-- PaperPath — scheduled work
--
-- Run last, after every other migration.
--
-- ---------------------------------------------------------------------------
-- WHAT RUNS ON A SCHEDULE, AND WHY EACH ONE IS NOT OPTIONAL
--
--   purge_expired_data   Retention. A child's conversation kept for ever
--                        because nobody wrote the delete is the most ordinary
--                        way to be non-compliant, and it is invisible until
--                        someone asks.
--
--   expire_grace         Turns an expired payment grace window into a stopped
--                        subscription. Razorpay does send subscription.halted
--                        eventually, but "eventually" has been days — and free
--                        access for days after a mandate died is a bug that
--                        only ever runs in one direction.
--
--   parent reports       An HTTP call out to the app. Postgres cannot build
--                        the message or talk to WhatsApp, so pg_net posts to
--                        the route and the app does the work.
--
-- ---------------------------------------------------------------------------
-- TIMES ARE UTC
--
-- pg_cron schedules in UTC and India is UTC+5:30, which is not a whole number
-- of hours — the commonest scheduling bug in an Indian product. Every entry
-- below states its IST time in a comment, and the offset has been applied.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ---------------------------------------------------------------------------
-- Log of what was sent, so a quiet week is only nudged once
-- ---------------------------------------------------------------------------
create table if not exists public.parent_report_log (
  id         uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users on delete cascade,
  quiet      boolean not null default false,
  channel    text not null default 'whatsapp',
  opened_at  timestamptz,
  sent_at    timestamptz not null default now()
);

create index if not exists parent_report_log_student_idx
  on public.parent_report_log (student_id, sent_at desc);

alter table public.parent_report_log enable row level security;
-- Server-side only.

-- ---------------------------------------------------------------------------
-- Grace expiry
--
-- Separate from the webhook because it is time-based and the webhook is
-- event-based. Nothing arrives to tell us a grace window closed.
-- ---------------------------------------------------------------------------
create or replace function public.expire_grace()
returns int
language plpgsql
security definer set search_path = public
as $$
declare
  v_count int;
begin
  update public.subscriptions
     set status = 'halted', grace_until = null, updated_at = now()
   where status = 'past_due'
     and grace_until is not null
     and grace_until < now();

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Schedules
--
-- unschedule-then-schedule so this file is safe to re-run. pg_cron errors on a
-- duplicate job name rather than replacing it.
-- ---------------------------------------------------------------------------
select cron.unschedule('paperpath-purge')       where exists (select 1 from cron.job where jobname = 'paperpath-purge');
select cron.unschedule('paperpath-grace')       where exists (select 1 from cron.job where jobname = 'paperpath-grace');
select cron.unschedule('paperpath-reports')     where exists (select 1 from cron.job where jobname = 'paperpath-reports');

-- 02:30 UTC = 08:00 IST. Deliberately after the overnight traffic and before
-- the school day, so a long delete never overlaps a busy period.
select cron.schedule(
  'paperpath-purge',
  '30 2 * * *',
  $$ select public.purge_expired_data(); $$
);

-- Hourly. A grace window that expired at 3am should not buy a free morning.
select cron.schedule(
  'paperpath-grace',
  '5 * * * *',
  $$ select public.expire_grace(); $$
);

-- 13:30 UTC Sunday = 19:00 IST Sunday. When Indian families plan the week,
-- which is the only moment the report's "focus next week" line does anything.
--
-- Replace the URL and the secret before running. Both are deliberately literal
-- rather than read from a setting: a cron job that silently posts to the wrong
-- host is worse than one that fails to be created.
select cron.schedule(
  'paperpath-reports',
  '30 13 * * 0',
  $$
  select net.http_post(
    url     := 'https://REPLACE-ME.example.com/api/cron/parent-reports',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer REPLACE-WITH-CRON_SECRET'
               ),
    body    := '{}'::jsonb
  );
  $$
);

-- ---------------------------------------------------------------------------
-- Checking on it
--
--   select jobname, schedule, active from cron.job;
--   select jobname, status, return_message, start_time
--     from cron.job_run_details order by start_time desc limit 20;
--
-- A backup that has never been restored is not a backup, and a cron job whose
-- run history nobody has read is not a schedule. Look at the second query
-- once a month.
-- ---------------------------------------------------------------------------
