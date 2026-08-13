-- PaperPath — rate limiting
--
-- Run after compliance.sql.
--
-- ---------------------------------------------------------------------------
-- WHY THIS IS NOT ENOUGH ON ITS OWN, AND WHY IT IS STILL WORTH HAVING
--
-- ai_usage in schema.sql already caps what one ACCOUNT can spend in a day.
-- That is the important limit and it holds. What it does not stop is someone
-- creating accounts: sign up, burn the free tutor turns, sign up again. The
-- per-account limit is per account, and accounts are free.
--
-- So this adds a second axis — the caller's IP — to the endpoints that cost
-- money before an account has proved anything: signing up, asking for a
-- consent code, and the first few tutor turns.
--
-- An IP is a blunt instrument in India. A school, a housing society or a
-- mobile carrier's CGNAT can put hundreds of genuine students behind one
-- address, so the limits below are deliberately loose: they are shaped to stop
-- a script, not to ration a computer lab. Anything tighter would break the
-- exact customer we most want.
--
-- ---------------------------------------------------------------------------
-- WHY POSTGRES AND NOT REDIS
--
-- The app is serverless, so an in-memory counter is per-instance and therefore
-- not a limit at all. Redis would be the textbook answer and is a second piece
-- of infrastructure to run, pay for and monitor for a product with no users
-- yet. The database is already there, already has connection pooling, and a
-- counter row per window is a cheap write.
--
-- Revisit when the write volume justifies it. The interface in
-- lib/ratelimit.ts does not change when the store does.
-- ---------------------------------------------------------------------------

create table if not exists public.rate_limits (
  -- The bucket: 'consent_request', 'signup', 'tutor_turn'.
  action     text not null,
  -- The subject: an IP, or a user id where the limit is per account.
  subject    text not null,
  -- Start of the fixed window this row counts.
  --
  -- A fixed window lets twice the limit through across a boundary, which a
  -- sliding window would not. That is an acceptable trade here: the limits are
  -- loose by design, and a sliding window costs a row per request instead of a
  -- row per window.
  window_start timestamptz not null,
  count      int not null default 0,
  primary key (action, subject, window_start)
);

-- Old windows are dead weight. Indexed so the sweep below is cheap.
create index if not exists rate_limits_window_idx on public.rate_limits (window_start);

alter table public.rate_limits enable row level security;
-- No policy: written only by the function below, which runs as definer.

-- ---------------------------------------------------------------------------
-- Take one slot
--
-- Check and increment in one statement, holding the row. Two round trips from
-- the app is racy in exactly the case that matters — a script firing requests
-- in parallel is the thing being limited, and it would read "under the limit"
-- on all of them at once.
-- ---------------------------------------------------------------------------
create or replace function public.take_rate_limit(
  p_action text,
  p_subject text,
  p_limit int,
  p_window_seconds int
)
returns table (allowed boolean, used int, resets_at timestamptz)
language plpgsql
security definer set search_path = public
as $$
declare
  v_start timestamptz;
  v_count int;
begin
  -- Floor the current time to the window, so every caller in the same window
  -- lands on the same row without needing to agree on anything.
  v_start := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into public.rate_limits (action, subject, window_start, count)
  values (p_action, p_subject, v_start, 1)
  on conflict (action, subject, window_start)
    do update set count = public.rate_limits.count + 1
  returning public.rate_limits.count into v_count;

  return query
    select v_count <= p_limit, v_count, v_start + make_interval(secs => p_window_seconds);
end;
$$;

revoke all on function public.take_rate_limit(text, text, int, int) from public;
-- anon as well as authenticated: the sign-up and consent paths are reached
-- before there is a session.
grant execute on function public.take_rate_limit(text, text, int, int) to anon, authenticated;

-- Housekeeping. Called by purge_expired_data via the daily cron.
create or replace function public.purge_rate_limits()
returns int
language plpgsql
security definer set search_path = public
as $$
declare
  v_count int;
begin
  delete from public.rate_limits where window_start < now() - interval '2 days';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
