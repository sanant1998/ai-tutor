-- PaperPath — the tutoring layer
--
-- Run this AFTER supabase/schema.sql. It adds two things that file does not
-- have: a seeded curriculum, and the runtime state of a teaching session.
--
-- ---------------------------------------------------------------------------
-- WHY A SEEDED CURRICULUM AND NOT MORE GENERATION
--
-- Everything in schema.sql is generated per student: the model writes the
-- questions, marks them, and writes the notes. That works for revision, where
-- the student already knows the material and wants volume.
--
-- Teaching is a different job. A tutor that invents its own explanation each
-- time cannot be checked, cannot be corrected once, and drifts off the board's
-- syllabus in ways nobody notices until a parent does. So the teaching content
-- is written once, by hand, and stored here. The model's job shrinks to
-- delivering material it did not choose — which is the part it is reliably
-- good at.
--
-- The tables below are therefore of two kinds, with opposite access rules:
--
--   CURRICULUM  subjects, chapters, topics, concepts, bank_questions.
--               Global, not per-student. Written by the seed script running
--               with the service-role key. Students read the teaching content;
--               they must never read the answers.
--
--   RUNTIME     learning_sessions, session_turns, error_events, topic_mastery,
--               llm_calls, credit_ledger. Per-student, row-level secured
--               exactly like the rest of the app.
-- ---------------------------------------------------------------------------

-- ===========================================================================
-- CURRICULUM
-- ===========================================================================

-- Ids are slugs, not sequences ('cbse-8-maths-ch1-t2-c1'). The content lives in
-- JSON files under content/ and is pushed by scripts/seed-content.mjs; a stable
-- textual id makes that push idempotent and makes a diff of the seed readable.

create table if not exists public.subjects (
  id          text primary key,
  board       text not null,                 -- cbse | icse | upboard
  class_level int  not null,
  subject_id  text not null,                 -- maths | science | ... (lib/syllabus.ts)
  name        text not null,
  language    text not null default 'en-IN',
  unique (board, class_level, subject_id, language)
);

create table if not exists public.chapters (
  id          text primary key,
  subject_ref text not null references public.subjects on delete cascade,
  chapter_no  int  not null,
  title       text not null,
  ncert_ref   text,
  est_minutes int  not null default 45,
  -- The first chapter of a subject is free. It is the only honest way to let a
  -- parent judge the teaching before paying for it.
  is_free     boolean not null default false,
  unique (subject_ref, chapter_no)
);

create table if not exists public.topics (
  id               text primary key,
  chapter_ref      text not null references public.chapters on delete cascade,
  topic_no         int  not null,
  title            text not null,
  -- Unlock gating. A topic opens when every id listed here has a mastery score
  -- of at least 60. Empty means it is open from the start.
  prereq_topic_ids text[] not null default '{}',
  unique (chapter_ref, topic_no)
);

-- The most important table in the database.
--
-- `misconceptions` is the column that earns its keep. Handed the list, the
-- model probes for mistakes we already know Class 8 students make; left to
-- find them itself it invents plausible ones, and a tutor chasing an imagined
-- error is worse than one that stays quiet.
create table if not exists public.concepts (
  id              text primary key,
  topic_ref       text not null references public.topics on delete cascade,
  seq             int  not null,
  title           text not null,
  statement       text not null,
  hook            text,
  analogies       jsonb not null default '[]'::jsonb,
  -- [{id, wrong_belief, why_wrong, correction, probe}]
  misconceptions  jsonb not null default '[]'::jsonb,
  -- [{id, problem, steps[], answer}]
  worked_examples jsonb not null default '[]'::jsonb,
  -- [{id, latex, note}]
  formulas        jsonb not null default '[]'::jsonb,
  unique (topic_ref, seq)
);

-- Named bank_questions, not questions: generated_questions already exists and
-- holds a completely different thing (per-student, model-written, discarded
-- after marking). Two tables called some flavour of "questions" is how the
-- wrong one gets joined at 2am.
create table if not exists public.bank_questions (
  id             text primary key,
  topic_ref      text not null references public.topics on delete cascade,
  concept_ref    text references public.concepts on delete set null,
  qtype          text not null check (qtype in ('mcq', 'msq', 'nvt', 'subjective')),
  level          text not null check (level in ('L1', 'L2', 'L3', 'L4')),
  stem           text not null,               -- LaTeX between $...$
  options        jsonb,                       -- [{key, text}]
  correct        jsonb not null,              -- ["A"] | {value, tol} | {rubric[]}
  solution       text not null,
  -- {"B": "m1"} — every wrong option mapped to the misconception it comes from.
  --
  -- This is what makes most marking free. When a student picks B we know which
  -- wrong belief produced it without asking a model, which means the diagnosis
  -- costs nothing, arrives instantly, and is right every time. The model is
  -- only needed for the subjective questions.
  distractor_map jsonb not null default '{}'::jsonb,
  marks          numeric(4,2) not null default 4,
  negative_marks numeric(4,2) not null default 1,
  source         text
);

create index if not exists bank_questions_topic_level_idx
  on public.bank_questions (topic_ref, level);

create index if not exists bank_questions_concept_idx
  on public.bank_questions (concept_ref);

-- --- Curriculum access -----------------------------------------------------
--
-- Teaching content is readable by any signed-in student. Answers are not
-- readable by anyone through the API at all.

alter table public.subjects       enable row level security;
alter table public.chapters       enable row level security;
alter table public.topics         enable row level security;
alter table public.concepts       enable row level security;
alter table public.bank_questions enable row level security;

drop policy if exists "subjects are readable" on public.subjects;
create policy "subjects are readable" on public.subjects
  for select to authenticated using (true);

drop policy if exists "chapters are readable" on public.chapters;
create policy "chapters are readable" on public.chapters
  for select to authenticated using (true);

drop policy if exists "topics are readable" on public.topics;
create policy "topics are readable" on public.topics
  for select to authenticated using (true);

drop policy if exists "concepts are readable" on public.concepts;
create policy "concepts are readable" on public.concepts
  for select to authenticated using (true);

-- bank_questions deliberately has NO select policy. With RLS on and no policy,
-- PostgREST returns nothing to a signed-in student however they ask — which is
-- the point. A student who opens DevTools on the practice screen finds the
-- stem and the options and nothing else.
--
-- Server routes reach the answers through the service-role key
-- (lib/supabase/admin.ts), which bypasses RLS and never reaches the browser.
--
-- There was a `bank_question_prompts` view here, exposing every column except
-- the answers so a browser could read questions directly. It is dropped, and
-- the reasoning is worth keeping:
--
--   Nothing used it. Every question the app serves goes through
--   /api/tutor/practice/next, which reads with the service-role key and
--   chooses its columns explicitly. The view was a second, unused path to the
--   same table whose safety rested on a subtlety — that a view runs as its
--   owner and therefore bypasses the RLS on what it selects.
--
--   That subtlety is exactly the kind that stops being true. A future
--   Postgres default, a changed owner, or someone adding `security_invoker` to
--   tidy things up, and a table whose whole design is "no client may read this"
--   quietly becomes readable. A door nobody walks through is still a door.
--
-- If a direct client read is ever wanted, add it back deliberately and write a
-- test that asserts an anon key cannot select `correct` through it.
drop view if exists public.bank_question_prompts;

-- ===========================================================================
-- RUNTIME
-- ===========================================================================

-- --- Sessions --------------------------------------------------------------
--
-- current_beat is written by the server and only by the server. The model
-- reports whether the student understood; it does not get to decide what
-- happens next. Keeping the transition here is what stops a session from
-- looping forever or skipping the check when the model feels agreeable.

create table if not exists public.learning_sessions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users on delete cascade,
  topic_ref     text not null references public.topics on delete cascade,
  concept_ref   text not null references public.concepts on delete cascade,
  current_beat  text not null default 'HOOK'
                check (current_beat in ('HOOK','TEACH','CHECK','RETEACH','SUMMARY','DONE')),
  turns_used    int  not null default 0,
  reteach_count int  not null default 0,
  status        text not null default 'active'
                check (status in ('active', 'paused', 'completed')),
  started_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists learning_sessions_user_idx
  on public.learning_sessions (user_id, started_at desc);

create table if not exists public.session_turns (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.learning_sessions on delete cascade,
  -- Denormalised so the row-level policy is one comparison rather than a join
  -- on every insert of every turn.
  user_id    uuid not null references auth.users on delete cascade,
  seq        int  not null,
  beat       text not null,
  role       text not null check (role in ('tutor', 'student')),
  content    text not null,
  verdict    jsonb,
  provider   text,
  model      text,
  tokens_in  int,
  tokens_out int,
  latency_ms int,
  created_at timestamptz not null default now(),
  unique (session_id, seq)
);

alter table public.learning_sessions enable row level security;
alter table public.session_turns     enable row level security;

drop policy if exists "sessions are self-service" on public.learning_sessions;
create policy "sessions are self-service" on public.learning_sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "session turns are self-service" on public.session_turns;
create policy "session turns are self-service" on public.session_turns
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- --- Handing out turn numbers ----------------------------------------------
--
-- `unique (session_id, seq)` above is the constraint that makes a transcript
-- ordered and gapless, and it is also the one the application kept losing to.
-- The route did `select max(seq)` and then inserted `max + 1`, which is a
-- read-modify-write across two round trips: a double tap, a retry after a slow
-- reply, or two tabs on the same session, and both requests read the same
-- maximum and both write it. One insert wins, the other violates the
-- constraint — and the error was being discarded, so the losing turn simply
-- vanished from the transcript with nothing logged.
--
-- Doing the arithmetic inside one statement, behind a lock on the session row,
-- removes the window. The lock is on learning_sessions rather than on the
-- turns, because that is the thing being serialised: one turn at a time per
-- session is exactly the intended behaviour, and it is a row nobody else
-- contends for.
--
-- A LOCK WOULD NOT HAVE BEEN ENOUGH
--
-- The obvious repair is `select max(seq) ... for update` inside a function.
-- It does not work here: PostgREST runs each RPC in its own transaction, so
-- the lock is released the moment the function returns — which is before the
-- application inserts anything. The window closes and reopens in the same
-- round trip.
--
-- So the sequence is a counter that is advanced by the reservation itself. A
-- single UPDATE ... RETURNING is atomic on its own; concurrent callers
-- serialise on the row and each one leaves with a distinct block. Nothing has
-- to stay locked between statements because nothing after the UPDATE can hand
-- out the same numbers again.
alter table public.learning_sessions
  add column if not exists seq_cursor int not null default 0;

-- Returns the FIRST number of a reserved run of p_count, so a caller writing
-- the student's message and the tutor's reply gets both in one round trip.
create or replace function public.reserve_turn_seq(p_session uuid, p_count int default 2)
returns int
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  v_owner uuid;
  v_first int;
begin
  if p_count < 1 then
    raise exception 'p_count must be at least 1';
  end if;

  update public.learning_sessions
     set seq_cursor =
           -- greatest(...) is the migration path. Sessions that already have
           -- turns start with seq_cursor at 0, and handing out 1 again would
           -- collide with rows written before this function existed.
           greatest(
             seq_cursor,
             coalesce(
               (select max(seq) from public.session_turns where session_id = p_session),
               0
             )
           ) + p_count
   where id = p_session
   returning user_id, seq_cursor - p_count + 1
   into v_owner, v_first;

  if v_owner is null then
    raise exception 'no such session';
  end if;

  -- security definer, so ownership is this function's problem. service_role
  -- has no auth.uid() and is trusted; a signed-in caller must own the session.
  if auth.uid() is not null and auth.uid() <> v_owner then
    raise exception 'not your session';
  end if;

  return v_first;
end;
$$;

grant execute on function public.reserve_turn_seq(uuid, int) to authenticated, service_role;

-- --- Attempts against the bank ---------------------------------------------
--
-- schema.sql already has `attempts`, keyed to generated_questions. A second
-- attempts table would split the readiness score across two places, so the
-- bank's columns are added to the existing one instead.

alter table public.attempts
  add column if not exists topic_ref text references public.topics on delete set null;
alter table public.attempts
  add column if not exists concept_ref text references public.concepts on delete set null;
alter table public.attempts
  add column if not exists bank_question_id text references public.bank_questions on delete set null;
alter table public.attempts
  add column if not exists session_id uuid references public.learning_sessions on delete set null;
alter table public.attempts
  add column if not exists answer jsonb;
alter table public.attempts
  add column if not exists time_taken_ms int;

create index if not exists attempts_user_topic_idx
  on public.attempts (user_id, topic_ref, created_at desc);

-- --- Error events ----------------------------------------------------------
--
-- One row per diagnosed mistake. `source` is the column to watch in production:
-- if 'llm' is more than a small minority of rows, the distractor maps are too
-- thin and the fix is more content, not a better model.

create table if not exists public.error_events (
  id          uuid primary key default gen_random_uuid(),
  attempt_id  uuid references public.attempts on delete cascade,
  user_id     uuid not null references auth.users on delete cascade,
  topic_ref   text references public.topics on delete set null,
  concept_ref text references public.concepts on delete set null,
  -- The taxonomy in lib/mastery.ts, unchanged:
  -- concept | formula | application | calculation | careless | incomplete |
  -- blank | guess
  etype           text not null,
  misconception_id text,
  confidence      numeric(3,2),
  evidence        text,
  source          text not null check (source in ('distractor_map', 'rule', 'llm')),
  created_at      timestamptz not null default now()
);

create index if not exists error_events_user_type_idx
  on public.error_events (user_id, etype, created_at desc);

create index if not exists error_events_user_concept_idx
  on public.error_events (user_id, concept_ref, created_at desc);

alter table public.error_events enable row level security;

drop policy if exists "error events are self-service" on public.error_events;
create policy "error events are self-service" on public.error_events
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- --- Mastery and spaced repetition -----------------------------------------
--
-- Bands use the vocabulary already in lib/mastery.ts rather than a second set,
-- so the tutor and the revision side of the app describe a student the same
-- way.

create table if not exists public.topic_mastery (
  user_id       uuid not null references auth.users on delete cascade,
  topic_ref     text not null references public.topics on delete cascade,
  teach_done    boolean not null default false,
  practice_acc  numeric(5,2) not null default 0,
  test_score    numeric(5,2),
  score         numeric(5,2) not null default 0,
  band          text not null default 'Not started',
  -- SM-2
  ease_factor   numeric(4,2) not null default 2.5,
  interval_days int not null default 0,
  next_review_at date,
  updated_at    timestamptz not null default now(),
  primary key (user_id, topic_ref)
);

create index if not exists topic_mastery_due_idx
  on public.topic_mastery (user_id, next_review_at);

alter table public.topic_mastery enable row level security;

drop policy if exists "mastery is self-service" on public.topic_mastery;
create policy "mastery is self-service" on public.topic_mastery
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- --- Parent links ----------------------------------------------------------
--
-- In this market the parent pays and the student uses. A product with nothing
-- for the parent renews badly.
--
-- The link is deliberately not a read grant on the student's tables: the
-- report route checks this table and then reads through the service-role key,
-- so a parent gets the weekly digest and never gets a session transcript.

create table if not exists public.parent_links (
  parent_id  uuid not null references auth.users on delete cascade,
  student_id uuid not null references auth.users on delete cascade,
  relation   text not null default 'parent',
  -- The student's account confirms the link. Without this a phone number typo
  -- sends one family's report to another.
  confirmed  boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (parent_id, student_id)
);

alter table public.parent_links enable row level security;

drop policy if exists "parent links are visible to both sides" on public.parent_links;
create policy "parent links are visible to both sides" on public.parent_links
  for select using (auth.uid() = parent_id or auth.uid() = student_id);

drop policy if exists "a parent may request a link" on public.parent_links;
create policy "a parent may request a link" on public.parent_links
  for insert with check (auth.uid() = parent_id);

drop policy if exists "a student may confirm a link" on public.parent_links;
create policy "a student may confirm a link" on public.parent_links
  for update using (auth.uid() = student_id) with check (auth.uid() = student_id);

-- --- Unit economics --------------------------------------------------------
--
-- Put in on day one, not when the bill arrives. Without a per-call row there
-- is no way to answer "what does one taught concept cost" — and that number
-- decides whether the subscription price works.

create table if not exists public.llm_calls (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users on delete set null,
  session_id uuid references public.learning_sessions on delete set null,
  purpose    text not null,              -- teach | check | classify | solve | summary
  provider   text not null,
  model      text not null,
  tokens_in  int not null default 0,
  tokens_out int not null default 0,
  cost_inr   numeric(10,4),
  latency_ms int,
  -- True when the primary provider failed and the fallback served the call.
  fell_back  boolean not null default false,
  ok         boolean not null default true,
  error      text,
  created_at timestamptz not null default now()
);

create index if not exists llm_calls_created_idx on public.llm_calls (created_at desc);
create index if not exists llm_calls_user_idx on public.llm_calls (user_id, created_at desc);

alter table public.llm_calls enable row level security;

-- Written by the server with the service-role key. A student may read their own
-- spend and may not write a row.
drop policy if exists "llm calls are readable by their owner" on public.llm_calls;
create policy "llm calls are readable by their owner" on public.llm_calls
  for select using (auth.uid() = user_id);

-- Free-tier abuse control. ai_usage in schema.sql counts actions per day; this
-- counts money, which is what actually needs a ceiling once one student can
-- hold a conversation rather than press a button.
create table if not exists public.credit_ledger (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users on delete cascade,
  delta      numeric(10,4) not null,       -- + granted, - spent
  reason     text not null,
  ref        text,
  created_at timestamptz not null default now()
);

create index if not exists credit_ledger_user_idx
  on public.credit_ledger (user_id, created_at desc);

alter table public.credit_ledger enable row level security;

drop policy if exists "credit ledger is readable by its owner" on public.credit_ledger;
create policy "credit ledger is readable by its owner" on public.credit_ledger
  for select using (auth.uid() = user_id);

-- ===========================================================================
-- Session start, atomically
--
-- Two tabs pressing Start on the same topic must not open two sessions: the
-- turn counter is the only thing standing between a stuck student and an
-- unbounded bill, and it does not work if there are two of it.
-- ===========================================================================
create or replace function public.start_learning_session(
  p_topic_ref text,
  p_concept_ref text
)
returns public.learning_sessions
language plpgsql
security definer set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_row public.learning_sessions;
begin
  if v_user is null then
    raise exception 'not signed in';
  end if;

  select * into v_row
    from public.learning_sessions
   where user_id = v_user
     and topic_ref = p_topic_ref
     and status = 'active'
   order by started_at desc
   limit 1
   for update;

  if found then
    return v_row;
  end if;

  insert into public.learning_sessions (user_id, topic_ref, concept_ref)
  values (v_user, p_topic_ref, p_concept_ref)
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.start_learning_session(text, text) from public;
grant execute on function public.start_learning_session(text, text) to authenticated;
