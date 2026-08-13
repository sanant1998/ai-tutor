-- PaperPath schema
--
-- Run this in the Supabase SQL editor. Every table is keyed by auth.uid() and
-- protected by row-level security, so a signed-in student can only ever read
-- and write their own row.
--
-- The app works without this — it falls back to localStorage — but nothing
-- survives a device change until these tables exist.

-- ---------------------------------------------------------------------------
-- profiles: one row per user, created on first sign-in
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users on delete cascade,
  first_name   text not null default '',
  last_name    text not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles are self-service" on public.profiles;
create policy "profiles are self-service" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

-- Create the profile row automatically, carrying over whatever the sign-up
-- form or the OAuth provider gave us.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, first_name, last_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'first_name',
             split_part(coalesce(new.raw_user_meta_data ->> 'full_name', ''), ' ', 1),
             ''),
    coalesce(new.raw_user_meta_data ->> 'last_name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- onboarding: the answers the five steps collect
-- ---------------------------------------------------------------------------
create table if not exists public.onboarding (
  user_id          uuid primary key references auth.users on delete cascade,
  board_id         text,
  subject_ids      text[] not null default '{}',
  unit_ids         text[] not null default '{}',
  deadline         date,
  rest_days        text[] not null default '{}',
  daily_hours      int  not null default 2,
  target_grades    jsonb not null default '{}'::jsonb,
  predicted_grades jsonb not null default '{}'::jsonb,
  updated_at       timestamptz not null default now()
);

alter table public.onboarding enable row level security;

drop policy if exists "onboarding is self-service" on public.onboarding;
create policy "onboarding is self-service" on public.onboarding
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- progress: completed topics, the streak and the study log
-- ---------------------------------------------------------------------------
create table if not exists public.progress (
  user_id          uuid primary key references auth.users on delete cascade,
  done_topic_ids   text[] not null default '{}',
  -- Scheduled session ids: a topic is learned once and reviewed twice, and
  -- each of those three sessions is completed separately.
  done_session_ids text[] not null default '{}',
  skipped_topic_ids text[] not null default '{}',
  last_active_date date,
  streak           int not null default 0,
  updated_at       timestamptz not null default now()
);

-- Added after the first cut; safe to re-run.
alter table public.progress
  add column if not exists done_session_ids text[] not null default '{}';

alter table public.progress enable row level security;

drop policy if exists "progress is self-service" on public.progress;
create policy "progress is self-service" on public.progress
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- One row per day studied, which is what the daily-minutes chart plots.
create table if not exists public.study_log (
  user_id  uuid not null references auth.users on delete cascade,
  day      date not null,
  minutes  int  not null default 0,
  primary key (user_id, day)
);

alter table public.study_log enable row level security;

drop policy if exists "study log is self-service" on public.study_log;
create policy "study log is self-service" on public.study_log
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- exams: board exams, mocks, term tests
-- ---------------------------------------------------------------------------
create table if not exists public.exams (
  id         text not null,
  user_id    uuid not null references auth.users on delete cascade,
  kind       text not null default 'board',
  subject_id text not null,
  unit_id    text not null default '',
  exam_date  date not null,
  primary key (user_id, id)
);

alter table public.exams enable row level security;

drop policy if exists "exams are self-service" on public.exams;
create policy "exams are self-service" on public.exams
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- feedback tickets
-- ---------------------------------------------------------------------------
create table if not exists public.tickets (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users on delete cascade,
  kind       text not null,
  subject    text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.ticket_messages (
  id         uuid primary key default gen_random_uuid(),
  ticket_id  uuid not null references public.tickets on delete cascade,
  user_id    uuid not null references auth.users on delete cascade,
  author     text not null check (author in ('you', 'team')),
  body       text not null,
  created_at timestamptz not null default now()
);

alter table public.tickets enable row level security;
alter table public.ticket_messages enable row level security;

drop policy if exists "tickets are self-service" on public.tickets;
create policy "tickets are self-service" on public.tickets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "ticket messages are self-service" on public.ticket_messages;
create policy "ticket messages are self-service" on public.ticket_messages
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- generated_questions: the question sets the AI writes for a student
--
-- Marking looks a question up by id rather than taking its text from the
-- request, so the marking endpoint can only ever grade a question this app
-- generated — it cannot be used as an open-ended model proxy.
-- ---------------------------------------------------------------------------
create table if not exists public.generated_questions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users on delete cascade,
  subject_id text not null,
  unit_id    text not null,
  topic_id   text not null,
  kind       text not null,
  prompt     text not null,
  marks      int  not null default 1,
  options    text[],
  created_at timestamptz not null default now()
);

create index if not exists generated_questions_user_topic_idx
  on public.generated_questions (user_id, topic_id, created_at desc);

alter table public.generated_questions enable row level security;

drop policy if exists "generated questions are self-service" on public.generated_questions;
create policy "generated questions are self-service" on public.generated_questions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- plan: which tier a student is on. No billing yet, so everyone is 'free'
-- until a row is changed by hand or by a future webhook.
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists plan text not null default 'free';

-- ---------------------------------------------------------------------------
-- ai_usage: one row per user, per day, per action
--
-- Generation costs real money, so the count has to be authoritative. Checking
-- and incrementing in two round trips from the app is racy — two tabs pressing
-- Generate together would both read "under the limit" and both proceed. The
-- function below does check-and-increment inside one transaction, holding the
-- row, so the limit actually holds.
-- ---------------------------------------------------------------------------
create table if not exists public.ai_usage (
  user_id uuid not null references auth.users on delete cascade,
  day     date not null default current_date,
  action  text not null,
  count   int  not null default 0,
  primary key (user_id, day, action)
);

alter table public.ai_usage enable row level security;

-- Read-only to the student: the count is written by the function below, which
-- runs as definer precisely so a client cannot reset its own usage.
drop policy if exists "usage is readable by its owner" on public.ai_usage;
create policy "usage is readable by its owner" on public.ai_usage
  for select using (auth.uid() = user_id);

create or replace function public.consume_ai_quota(p_action text, p_limit int)
returns table (allowed boolean, used int, quota int)
language plpgsql
security definer set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_used int;
begin
  if v_user is null then
    return query select false, 0, p_limit;
    return;
  end if;

  insert into public.ai_usage (user_id, day, action, count)
  values (v_user, current_date, p_action, 0)
  on conflict (user_id, day, action) do nothing;

  -- FOR UPDATE holds the row for the rest of this transaction, so a second
  -- concurrent call waits here rather than reading a stale count.
  select ai_usage.count into v_used
    from public.ai_usage
   where user_id = v_user and day = current_date and action = p_action
     for update;

  if v_used >= p_limit then
    return query select false, v_used, p_limit;
    return;
  end if;

  update public.ai_usage set count = ai_usage.count + 1
   where user_id = v_user and day = current_date and action = p_action;

  return query select true, v_used + 1, p_limit;
end;
$$;

-- Hands a slot back when generation fails after the slot was taken, so a
-- provider outage does not eat the student's daily allowance.
create or replace function public.release_ai_quota(p_action text)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then return; end if;

  update public.ai_usage set count = greatest(0, ai_usage.count - 1)
   where user_id = v_user and day = current_date and action = p_action;
end;
$$;

revoke all on function public.consume_ai_quota(text, int) from public;
revoke all on function public.release_ai_quota(text) from public;
grant execute on function public.consume_ai_quota(text, int) to authenticated;
grant execute on function public.release_ai_quota(text) to authenticated;

-- ---------------------------------------------------------------------------
-- topic_explainers: the narrated diagram for one topic
--
-- Cached per student, because generating the script and the diagram costs a
-- model call and the narration audio costs another. A student who reopens a
-- topic pays nothing the second time.
-- ---------------------------------------------------------------------------
create table if not exists public.topic_explainers (
  user_id    uuid not null references auth.users on delete cascade,
  topic_id   text not null,
  board_id   text not null default '',
  headline   text not null default '',
  narration  jsonb not null default '[]'::jsonb,
  diagram    text not null default '',
  audio_path text,
  created_at timestamptz not null default now(),
  primary key (user_id, topic_id, board_id)
);

alter table public.topic_explainers enable row level security;

drop policy if exists "explainers are self-service" on public.topic_explainers;
create policy "explainers are self-service" on public.topic_explainers
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Narration audio. Private: files are served through short-lived signed URLs,
-- so one student's cached audio is never a public asset.
insert into storage.buckets (id, name, public)
values ('topic-audio', 'topic-audio', false)
on conflict (id) do nothing;

drop policy if exists "own topic audio: read" on storage.objects;
create policy "own topic audio: read" on storage.objects
  for select using (
    bucket_id = 'topic-audio'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "own topic audio: write" on storage.objects;
create policy "own topic audio: write" on storage.objects
  for insert with check (
    bucket_id = 'topic-audio'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "own topic audio: replace" on storage.objects;
create policy "own topic audio: replace" on storage.objects
  for update using (
    bucket_id = 'topic-audio'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- ---------------------------------------------------------------------------
-- attempts: one row per answered question
--
-- The readiness score and the fix sheet both need to know not just whether an
-- answer was right, but at which level it sat and what kind of mistake it was.
-- progress.answers only ever stored a boolean, which cannot support either.
-- ---------------------------------------------------------------------------
create table if not exists public.attempts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  board_id    text not null default '',
  class_level int  not null default 0,
  subject_id  text not null,
  chapter_id  text not null,
  question_id uuid references public.generated_questions on delete set null,
  level       text not null default 'L2',
  correct     boolean not null default false,
  marks       int not null default 0,
  max_marks   int not null default 1,
  -- none | concept | formula | application | calculation | careless | incomplete | blank
  error_type  text not null default 'none',
  created_at  timestamptz not null default now()
);

create index if not exists attempts_user_chapter_idx
  on public.attempts (user_id, subject_id, chapter_id, created_at desc);

create index if not exists attempts_user_error_idx
  on public.attempts (user_id, error_type, created_at desc);

alter table public.attempts enable row level security;

drop policy if exists "attempts are self-service" on public.attempts;
create policy "attempts are self-service" on public.attempts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- The generated_questions row needs to remember which level it was written at,
-- so an attempt can be filed against the right band without the browser
-- asserting it.
alter table public.generated_questions
  add column if not exists level text not null default 'L2';
alter table public.generated_questions
  add column if not exists class_level int not null default 0;
alter table public.generated_questions
  add column if not exists board_id text not null default '';
