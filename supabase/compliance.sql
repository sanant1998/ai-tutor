-- PaperPath — consent, retention and safety
--
-- Run after schema.sql and tutor.sql.
--
-- ---------------------------------------------------------------------------
-- WHY THIS FILE EXISTS BEFORE THE PRODUCT DOES
--
-- Almost every user of this app is a child, and India's Digital Personal Data
-- Protection Act treats a child's data as a separate category with its own
-- rules: verifiable parental consent before processing, no behavioural
-- advertising or tracking of children at all, and a real route for a parent to
-- see and delete what has been collected.
--
-- Consent is also the one thing that cannot be added later. It has to be
-- recorded at the moment it is given, against the policy version the parent
-- actually read, with evidence of how it was verified — and none of that can be
-- reconstructed six months afterwards from a signup date. A product that ships
-- first and adds consent later has no lawful basis for the data it already
-- holds, and its only honest fix is to delete it.
--
-- So: DOB at signup, account locked until a parent consents, one row per
-- purpose, and a purge job that runs whether or not anyone remembers it.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Who the account holder is
-- ---------------------------------------------------------------------------

-- An actual date of birth, not an age band. The band is what we show; the date
-- is what an audit needs, and it is also the only way to know when a student
-- turns 18 and the parental consent stops being required.
alter table public.profiles add column if not exists dob date;

-- is_minor is NOT a column, and the first attempt at one is worth recording.
--
-- It was a stored generated column over (dob > current_date - 18 years).
-- Postgres refuses that outright — a generated expression must be IMMUTABLE —
-- and it is right to: a value computed once at write time would still say
-- "minor" the morning the student turns eighteen, and would go on saying it
-- for ever.
--
-- So age is derived at read time, from dob, by the function below and by
-- isMinorFromDob() in lib/consent/age.ts. Two implementations of one rule is
-- a smell; they exist because PostgREST cannot select a function as a column,
-- and the app needs the answer in TypeScript while the policies need it in
-- SQL. Change one, change both.
create or replace function public.is_minor(p_dob date)
returns boolean
language sql
stable
as $$
  -- Unknown date of birth counts as a minor. The population is overwhelmingly
  -- under 18, and the cost of guessing wrong in the other direction is
  -- processing a child's data with no lawful basis.
  select p_dob is null or p_dob > (current_date - interval '18 years');
$$;

grant execute on function public.is_minor(date) to authenticated;

-- pending_consent | active | read_only | suspended
--
-- read_only is the state after a parent withdraws consent. The account is not
-- deleted — a withdrawal is not a deletion request, and treating it as one
-- destroys a student's work over a checkbox — but nothing new is processed.
alter table public.profiles
  add column if not exists account_state text not null default 'pending_consent';

alter table public.profiles
  add column if not exists role text not null default 'student';   -- student | parent

-- Which language the tutor teaches in: hinglish | hi-IN | en-IN.
--
-- The column existed on `subjects` from the first migration and was read into
-- the prompt as a bare string that nothing acted on — a student set to hi-IN
-- got the same Hinglish as everyone else. It belongs on the profile, because
-- it is a property of the reader and not of the syllabus.
alter table public.profiles
  add column if not exists language text not null default 'hinglish';

-- ---------------------------------------------------------------------------
-- WHICH COLUMNS A STUDENT MAY WRITE
--
-- schema.sql gives profiles one policy: `for all using (auth.uid() = id)`.
-- Row-level, which is what it says on the tin — and it means a signed-in
-- student could UPDATE ANY COLUMN of their own row straight from the browser.
--
-- Including account_state. Setting that to 'active' skips the parental consent
-- gate completely. Including dob, which decides whether consent is required at
-- all. Including role, and plan.
--
-- The generated is_minor column was written to stop exactly this and never
-- could have: a student who can write dob can declare themselves an adult, and
-- the derived column would faithfully agree.
--
-- RLS has no column granularity, so the fix is a GRANT. Revoke the blanket
-- update and hand back only the three fields that are genuinely the student's:
-- their name, and the language they want to be taught in.
--
-- Everything else is written by the server with the service-role key. That is
-- the distinction that was missing.
-- ---------------------------------------------------------------------------
revoke update on public.profiles from authenticated;
grant update (first_name, last_name, language) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Email on the profile
--
-- auth.users has it, and the admin API can list users — but only a page at a
-- time. Looking a student up by email through auth.admin.listUsers() finds the
-- first fifty accounts and silently misses everyone else, which is invisible
-- in development and breaks the moment a school imports a roster of 200.
--
-- So it is denormalised here, kept in step by the trigger below, and every
-- lookup by email goes through this column with a real index behind it.
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists email text;

create unique index if not exists profiles_email_idx
  on public.profiles (lower(email)) where email is not null;

-- Backfill anyone who signed up before this column existed.
update public.profiles p
   set email = u.email
  from auth.users u
 where u.id = p.id and p.email is distinct from u.email;

-- Replaces the trigger function in schema.sql, carrying the email across as
-- well as the name. Safe to re-run; schema.sql can be re-run after this
-- without losing it only if this file is run again, so run them in order.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, first_name, last_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'first_name',
             split_part(coalesce(new.raw_user_meta_data ->> 'full_name', ''), ' ', 1),
             ''),
    coalesce(new.raw_user_meta_data ->> 'last_name', '')
  )
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

-- An email change in auth has to reach the profile, or a lookup finds the old
-- address for ever.
create or replace function public.sync_profile_email()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function public.sync_profile_email();

-- ---------------------------------------------------------------------------
-- Consent
--
-- One row per purpose, per grant. Rows are never updated in place and never
-- deleted: a withdrawal sets withdrawn_at, so the history of what was
-- permitted when is intact. That history is the entire evidentiary value of
-- the table.
-- ---------------------------------------------------------------------------
create table if not exists public.consents (
  id             uuid primary key default gen_random_uuid(),
  student_id     uuid not null references auth.users on delete cascade,
  parent_id      uuid references auth.users on delete set null,
  -- account | ai_processing | voice | analytics
  --
  -- There is deliberately no 'marketing' purpose for a minor. Under the DPDP
  -- Act, behavioural advertising and tracking of children is prohibited
  -- outright — so the safe design is not an unticked box, it is the absence of
  -- the box.
  purpose        text not null,
  granted        boolean not null,
  -- parent_otp | parent_payment | school_authority | self_adult
  method         text not null,
  -- Which privacy policy the parent actually saw. A consent recorded against
  -- "the privacy policy" means nothing once the policy changes.
  policy_version text not null,
  evidence       jsonb not null default '{}'::jsonb,   -- {otp_ref, txn_id, ...}
  ip             inet,
  user_agent     text,
  granted_at     timestamptz not null default now(),
  withdrawn_at   timestamptz
);

create index if not exists consents_student_idx
  on public.consents (student_id, purpose, granted_at desc);

alter table public.consents enable row level security;

-- Both sides may read; neither may write. Consent rows are written by the
-- server after it has verified the OTP, because a row a client can insert is
-- not evidence of anything.
drop policy if exists "consent is visible to both sides" on public.consents;
create policy "consent is visible to both sides" on public.consents
  for select using (auth.uid() = student_id or auth.uid() = parent_id);

-- Current state of one purpose: the newest row wins, and a withdrawn row does
-- not count however recently it was granted.
create or replace function public.has_consent(p_student uuid, p_purpose text)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select coalesce(
    (select c.granted and c.withdrawn_at is null
       from public.consents c
      where c.student_id = p_student and c.purpose = p_purpose
      order by c.granted_at desc
      limit 1),
    false
  );
$$;

grant execute on function public.has_consent(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- OTP challenges
--
-- How a parent proves they are the parent. The DPDP Act asks for VERIFIABLE
-- consent, and a checkbox on the child's own screen verifies nothing — the
-- child ticks it.
--
-- Only a hash is stored. A support engineer reading the table must not be able
-- to complete a consent, and an exported backup must not be a list of live
-- codes.
-- ---------------------------------------------------------------------------
create table if not exists public.otp_challenges (
  id           uuid primary key default gen_random_uuid(),
  -- Who the code is about, not who receives it.
  student_id   uuid not null references auth.users on delete cascade,
  purpose      text not null default 'parent_consent',
  phone        text not null,
  code_hash    text not null,
  attempts     int  not null default 0,
  -- Five minutes. Long enough for an SMS on a bad network, short enough that a
  -- code seen over a shoulder is useless by the time it is typed.
  expires_at   timestamptz not null default (now() + interval '5 minutes'),
  consumed_at  timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists otp_challenges_student_idx
  on public.otp_challenges (student_id, created_at desc);

alter table public.otp_challenges enable row level security;
-- No policy: written and read only by the server with the service-role key.

-- ---------------------------------------------------------------------------
-- Voice
--
-- Recordings are the most sensitive thing this app could hold — a child's
-- voice, identifiable, in their own home. So: separate consent purpose,
-- private storage, and a 30-day life whatever else happens. The transcript
-- survives; the audio does not.
-- ---------------------------------------------------------------------------
create table if not exists public.voice_blobs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  session_id  uuid references public.learning_sessions on delete set null,
  storage_path text not null,
  duration_ms int,
  transcript  text,
  created_at  timestamptz not null default now()
);

create index if not exists voice_blobs_created_idx on public.voice_blobs (created_at);

alter table public.voice_blobs enable row level security;

drop policy if exists "voice is self-service" on public.voice_blobs;
create policy "voice is self-service" on public.voice_blobs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

insert into storage.buckets (id, name, public)
values ('voice-notes', 'voice-notes', false)
on conflict (id) do nothing;

drop policy if exists "own voice: read" on storage.objects;
create policy "own voice: read" on storage.objects
  for select using (
    bucket_id = 'voice-notes'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "own voice: write" on storage.objects;
create policy "own voice: write" on storage.objects
  for insert with check (
    bucket_id = 'voice-notes'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- ---------------------------------------------------------------------------
-- Erasure requests
--
-- A parent asking for deletion gets an immediate stop and a scheduled hard
-- delete, not an instant one: a mis-tapped button should be recoverable for a
-- few days, and there are records (payment, tax) that cannot lawfully go at
-- all. Soft first, hard on a timer, with the reason for anything retained
-- written down.
-- ---------------------------------------------------------------------------
create table if not exists public.erasure_requests (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references auth.users on delete cascade,
  requested_by  uuid references auth.users on delete set null,
  scope         text not null default 'all',    -- all | transcripts | voice
  status        text not null default 'pending', -- pending | done | refused
  -- What is kept and why. Empty means everything went.
  retained_note text,
  requested_at  timestamptz not null default now(),
  -- 30 days. Long enough to undo a mistake, short enough to be a real promise.
  execute_after timestamptz not null default (now() + interval '30 days'),
  completed_at  timestamptz
);

alter table public.erasure_requests enable row level security;

drop policy if exists "erasure requests are visible to the student" on public.erasure_requests;
create policy "erasure requests are visible to the student" on public.erasure_requests
  for select using (auth.uid() = student_id or auth.uid() = requested_by);

-- ---------------------------------------------------------------------------
-- Retention
--
-- Point pg_cron at this nightly. Keeping a child's conversation for ever
-- because nobody wrote the delete is the most ordinary way to be
-- non-compliant.
--
-- Aggregates survive: mastery is a number about a student, not a record of
-- what they said, and deleting it would throw away the learning without
-- reducing anyone's exposure.
-- ---------------------------------------------------------------------------
create or replace function public.purge_expired_data()
returns table (what text, rows_removed bigint)
language plpgsql
security definer set search_path = public
as $$
declare
  v_turns bigint;
  v_flags bigint;
  v_calls bigint;
  v_erased bigint;
begin
  -- Conversation transcripts: 24 months.
  delete from public.session_turns where created_at < now() - interval '24 months';
  get diagnostics v_turns = row_count;

  -- Moderation flags: 12 months. A flag is about an incident, and an incident
  -- that has not mattered in a year should not follow a child around.
  delete from public.safety_flags
   where created_at < now() - interval '12 months' and status <> 'open';
  get diagnostics v_flags = row_count;

  -- Per-call model logs: 13 months, so a year-on-year cost comparison still
  -- works. These carry no student text — only counts.
  delete from public.llm_calls where created_at < now() - interval '13 months';
  get diagnostics v_calls = row_count;

  -- Voice: 30 days, and the row goes with it. The storage object is removed by
  -- the same job in scripts/purge-storage.ts — Postgres cannot reach the
  -- bucket, and a row deleted without its file is the worse of the two
  -- failures because nothing then points at the file to delete it.
  delete from public.voice_blobs where created_at < now() - interval '30 days';

  -- Spent and expired one-time codes. No reason to keep a hash of a code that
  -- can no longer be used.
  delete from public.otp_challenges
   where created_at < now() - interval '7 days';

  -- Closed rate-limit windows. Harmless to keep and pointless to; the table
  -- grows a row per subject per window otherwise.
  begin
    perform public.purge_rate_limits();
  exception when undefined_function then
    -- supabase/ratelimit.sql has not been run on this project. Not a reason to
    -- abort the retention job, which is the part that matters legally.
    null;
  end;

  -- Behavioural events, 13 months. No free text in them, but still per-student
  -- data about a child, and unbounded retention of that is the thing the rest
  -- of this file exists to prevent.
  begin
    perform public.purge_analytics();
  exception when undefined_function then
    null;
  end;

  -- Erasure requests that have matured.
  with due as (
    select student_id from public.erasure_requests
     where status = 'pending' and execute_after <= now()
  )
  delete from public.session_turns t using due where t.user_id = due.student_id;

  update public.erasure_requests
     set status = 'done', completed_at = now()
   where status = 'pending' and execute_after <= now();
  get diagnostics v_erased = row_count;

  return query
    select 'session_turns', v_turns
    union all select 'safety_flags', v_flags
    union all select 'llm_calls', v_calls
    union all select 'erasures_completed', v_erased;
end;
$$;

-- ---------------------------------------------------------------------------
-- Safety flags
--
-- Written by the gate in lib/safety/gate.ts. A student can never read this
-- table: someone who knows they were flagged learns how to phrase it so they
-- are not, and the self-harm path is the one where that matters most.
-- ---------------------------------------------------------------------------
create table if not exists public.safety_flags (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users on delete cascade,
  session_id uuid references public.learning_sessions on delete set null,
  -- self_harm | sexual | violence | harassment | injection | off_topic
  category   text not null,
  severity   text not null default 'review',   -- review | urgent
  -- Kept because a human has to be able to judge the flag. Purged at 12 months
  -- by purge_expired_data.
  excerpt    text,
  score      numeric(3,2),
  -- blocklist | classifier | output_check | parent_alert
  --
  -- parent_alert is a record of the escalation OUTPUT, not of an input that
  -- was flagged. It lives in the same table because the once-a-day guard in
  -- lib/safety/escalate.ts has to read it, and a separate table for one
  -- column would be a join nobody remembers to make.
  source     text not null,
  status     text not null default 'open',     -- open | actioned | dismissed
  handled_by uuid references auth.users on delete set null,
  handled_at timestamptz,
  -- What the reviewer concluded. Its own column rather than appended to the
  -- excerpt: what was said and what a reviewer made of it are different
  -- things, and overwriting the first with the second destroys the only
  -- evidence of why the decision was made.
  review_note text,
  created_at timestamptz not null default now()
);

alter table public.safety_flags add column if not exists review_note text;

create index if not exists safety_flags_open_idx
  on public.safety_flags (status, severity, created_at desc);

alter table public.safety_flags enable row level security;
-- No policy at all: server-side, service-role only, by design.

-- ---------------------------------------------------------------------------
-- Content drafts — the authoring pipeline
--
-- The model drafts, a human approves, and only then does anything reach the
-- curriculum tables. There is no publish path that skips the human, and the
-- absence of that path is the feature.
--
-- Published content is immutable; an edit is a new version. Sessions store the
-- version they were taught from, so editing a concept cannot rewrite what a
-- student was told last week.
-- ---------------------------------------------------------------------------
create table if not exists public.content_drafts (
  id           uuid primary key default gen_random_uuid(),
  entity_type  text not null check (entity_type in ('concept', 'question')),
  entity_id    text,                       -- null when it is new
  payload      jsonb not null,
  status       text not null default 'draft'
               check (status in ('draft', 'in_review', 'approved', 'published', 'rejected')),
  author_id    uuid references auth.users on delete set null,
  reviewer_id  uuid references auth.users on delete set null,
  review_notes text,
  -- 'human' | 'llm:<model>'. Needed to answer "how much of the curriculum was
  -- written by a model", which is a question schools do ask.
  generated_by text not null default 'human',
  -- What the validator said at draft time. A draft that failed validation
  -- never reaches in_review.
  issues       jsonb not null default '[]'::jsonb,
  version      int not null default 1,
  created_at   timestamptz not null default now(),
  published_at timestamptz
);

create index if not exists content_drafts_status_idx
  on public.content_drafts (status, entity_type, created_at desc);

alter table public.content_drafts enable row level security;
-- Internal tooling only; reached with the service-role key.

-- Which version of a concept a session was taught from.
alter table public.learning_sessions
  add column if not exists content_version int not null default 1;

-- Which prompt wrote a turn. Without this, a regression found next month
-- cannot be traced to the change that caused it.
alter table public.session_turns
  add column if not exists prompt_version text;

-- ---------------------------------------------------------------------------
-- Tutor speech
--
-- Synthesised audio of the tutor's own messages. NOT under a student folder and
-- NOT on the 30-day voice purge: this is our content read aloud, not a
-- recording of a child. Two students hearing the same worked example share one
-- file, which is what makes speech affordable at all — the tutor teaches from
-- a fixed content pack, so its sentences genuinely repeat.
--
-- Private anyway. A signed URL is short-lived and unguessable; a public bucket
-- would make every spoken explanation in the curriculum a scrapeable asset.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('tutor-audio', 'tutor-audio', false)
on conflict (id) do nothing;

-- Read only through the server's signed URLs. No client-side policy: the app
-- never lets a browser list or fetch from this bucket directly.
