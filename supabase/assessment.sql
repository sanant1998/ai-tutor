-- PaperPath — homework and tests
--
-- Run after schoolops.sql (teaches_section is the corrected version there) and
-- after tutor.sql, which owns bank_questions.
--
-- ---------------------------------------------------------------------------
-- WHAT WAS HALF-BUILT
--
-- schools.sql gave a teacher assignments: a chapter or a topic, a section, a
-- due date. What it never gave them was the other half — the work coming back.
-- A teacher could set homework and then had no screen, table or endpoint that
-- said who had done it. In a B2B pilot that is the first thing asked for and
-- the first thing missing.
--
-- Tests are the second. `attempts` records practice, one question at a time,
-- as the student works through a topic. A test is a different object: a fixed
-- set of questions, a window it can be taken in, a number of attempts, and a
-- score that goes on a report. Bending the practice table into that shape
-- would mean every practice query learning to exclude test rows, and one that
-- forgot would put an exam question into the spaced-repetition queue.
--
-- ---------------------------------------------------------------------------
-- THE RULE THAT DIFFERS FROM EVERY OTHER TABLE HERE
--
-- `attempts` is self-service: the student's browser writes its own practice
-- rows, and that is fine, because the only person a student can mislead by
-- faking practice is themselves.
--
-- Nothing on this page is self-service. A test score is read by a teacher and
-- sent to a parent, so a row the student can write is a grade the student can
-- award themselves. Marking happens on the server with the service-role key;
-- the policies below are select-only, and that is deliberate rather than
-- unfinished.
-- ---------------------------------------------------------------------------

-- Run in the right order? The policies below call the corrected
-- teaches_section, and the tables reference bank_questions.
do $$
begin
  if to_regclass('public.bank_questions') is null then
    raise exception 'supabase/tutor.sql has not been run'
      using hint = 'Paste supabase/all.sql — every migration, already in dependency order.';
  end if;

  if to_regprocedure('public.assert_row_org()') is null then
    raise exception 'supabase/schoolops.sql has not been run'
      using hint = 'Paste supabase/all.sql — every migration, already in dependency order.';
  end if;
end $$;

-- Homework has a mark out of something. Nullable, because most of the
-- assignments this repository can already create are "read this chapter", and
-- a default of 100 would put a mark scheme on all of them.
alter table public.assignments
  add column if not exists max_marks int check (max_marks > 0);

-- ---------------------------------------------------------------------------
-- Work coming back
-- ---------------------------------------------------------------------------
create table if not exists public.assignment_submissions (
  id             uuid primary key default gen_random_uuid(),
  assignment_id  uuid not null references public.assignments on delete cascade,
  student_id     uuid not null references auth.users on delete cascade,
  content        text,
  submitted_at   timestamptz,
  marks_obtained numeric(5,2),
  feedback       text,
  graded_by      uuid references auth.users on delete set null,
  graded_at      timestamptz,
  status         text not null default 'pending'
                 check (status in ('pending', 'submitted', 'late', 'graded')),
  created_at     timestamptz not null default now(),
  unique (assignment_id, student_id)
);

create index if not exists assignment_submissions_student_idx
  on public.assignment_submissions (student_id);

create index if not exists assignment_submissions_grading_idx
  on public.assignment_submissions (assignment_id, status);

-- ---------------------------------------------------------------------------
-- Tests
--
-- org_id nullable, matching how curriculum already works in tenancy.sql: null
-- is the vendor's ready-made test, visible to everyone; a uuid is the school's
-- own, visible to that school. section_id nullable for the same reason — a
-- ready-made test belongs to no class until a teacher sets it.
-- ---------------------------------------------------------------------------
create table if not exists public.tests (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid references public.orgs on delete cascade,
  section_id       uuid references public.sections on delete cascade,
  chapter_ref      text references public.chapters on delete set null,
  topic_ref        text references public.topics on delete set null,
  created_by       uuid references auth.users on delete set null,
  title            text not null,
  kind             text not null default 'practice'
                   check (kind in ('practice', 'quiz', 'exam')),
  duration_minutes int,
  total_marks      int,
  passing_marks    int,
  attempts_allowed int not null default 1 check (attempts_allowed > 0),
  opens_at         timestamptz,
  closes_at        timestamptz,
  status           text not null default 'draft'
                   check (status in ('draft', 'published', 'closed')),
  created_at       timestamptz not null default now(),
  check (closes_at is null or opens_at is null or closes_at > opens_at)
);

create index if not exists tests_section_idx on public.tests (section_id, status);
create index if not exists tests_org_idx on public.tests (org_id) where org_id is not null;

-- Same rule as everywhere else org_id sits next to a section: the two must
-- name the same school. Not enforced when org_id is null, which is the
-- vendor's ready-made test before a teacher has set it for anyone.
drop trigger if exists tests_org on public.tests;
create trigger tests_org
  before insert or update of section_id, org_id on public.tests
  for each row execute function public.assert_row_org('section_id', 'sections');

-- The paper. marks here rather than on the question, because the same bank
-- question is worth one mark in a quiz and four in an exam.
create table if not exists public.test_questions (
  id           uuid primary key default gen_random_uuid(),
  test_id      uuid not null references public.tests on delete cascade,
  question_ref text not null references public.bank_questions on delete cascade,
  sort_order   int  not null,
  marks        int  not null default 1 check (marks > 0),
  unique (test_id, question_ref),
  unique (test_id, sort_order) deferrable initially deferred
);

-- ---------------------------------------------------------------------------
-- A sitting
-- ---------------------------------------------------------------------------
create table if not exists public.test_attempts (
  id             uuid primary key default gen_random_uuid(),
  test_id        uuid not null references public.tests on delete cascade,
  student_id     uuid not null references auth.users on delete cascade,
  attempt_no     int  not null default 1,
  started_at     timestamptz not null default now(),
  submitted_at   timestamptz,
  score          numeric(6,2),
  max_score      numeric(6,2),
  time_taken_sec int,
  status         text not null default 'in_progress'
                 check (status in ('in_progress', 'submitted', 'evaluated', 'abandoned')),
  unique (test_id, student_id, attempt_no)
);

create index if not exists test_attempts_student_idx
  on public.test_attempts (student_id, submitted_at desc);

create table if not exists public.test_answers (
  id            uuid primary key default gen_random_uuid(),
  attempt_id    uuid not null references public.test_attempts on delete cascade,
  question_ref  text not null references public.bank_questions on delete cascade,
  given         jsonb,
  is_correct    boolean,
  marks_awarded numeric(5,2) not null default 0,
  -- The wrong belief behind the wrong answer, taken from the question's
  -- distractor_map. Written here as well as in error_events so that a test
  -- paper can be handed back with the diagnosis on it, and so section_heatmap
  -- keeps working off one vocabulary of misconception ids.
  misconception_id text,
  time_spent_sec int,
  unique (attempt_id, question_ref)
);

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.assignment_submissions enable row level security;
alter table public.tests                  enable row level security;
alter table public.test_questions         enable row level security;
alter table public.test_attempts          enable row level security;
alter table public.test_answers           enable row level security;

-- A student reads their own submission; whoever teaches the section reads the
-- lot, because collecting homework is the entire job.
drop policy if exists "submissions are visible to the student and the teacher" on public.assignment_submissions;
create policy "submissions are visible to the student and the teacher" on public.assignment_submissions
  for select using (
    student_id = auth.uid()
    or exists (
      select 1 from public.assignments a
       where a.id = assignment_submissions.assignment_id
         and public.teaches_section(a.section_id)
    )
  );

-- Submitting is the one write a browser makes on this page.
drop policy if exists "students submit their own work" on public.assignment_submissions;
create policy "students submit their own work" on public.assignment_submissions
  for insert with check (
    student_id = auth.uid()
    and exists (
      select 1
        from public.assignments a
        join public.section_students ss on ss.section_id = a.section_id
       where a.id = assignment_id and ss.student_id = auth.uid()
    )
  );

-- Editing before it is marked. The policy limits WHICH ROWS, the grant below
-- limits WHICH COLUMNS — both are needed, and the policy alone is the version
-- of this that lets a student award themselves full marks with one PATCH.
drop policy if exists "students may edit work that is not yet marked" on public.assignment_submissions;
create policy "students may edit work that is not yet marked" on public.assignment_submissions
  for update using (student_id = auth.uid() and graded_at is null)
          with check (student_id = auth.uid() and graded_at is null);

revoke update on public.assignment_submissions from authenticated;
grant update (content, submitted_at, status) on public.assignment_submissions to authenticated;

-- A published test, to the class it was set for. Drafts stay invisible: a
-- teacher building tomorrow's paper is doing it in the same table.
drop policy if exists "students see published tests set for them" on public.tests;
create policy "students see published tests set for them" on public.tests
  for select using (
    (
      status = 'published'
      and (
        section_id is null
        or exists (
          select 1 from public.section_students ss
           where ss.section_id = tests.section_id and ss.student_id = auth.uid()
        )
      )
      and public.can_see_content(org_id)
    )
    or (section_id is not null and public.teaches_section(section_id))
  );

-- test_questions has NO select policy, exactly as bank_questions has none.
-- The paper is assembled on the server, which strips `correct` before it goes
-- to a browser; a readable join table is a list of question ids that can then
-- be asked for one at a time.

drop policy if exists "attempts are visible to the student and the teacher" on public.test_attempts;
create policy "attempts are visible to the student and the teacher" on public.test_attempts
  for select using (
    student_id = auth.uid()
    or exists (
      select 1 from public.tests t
       where t.id = test_attempts.test_id
         and t.section_id is not null
         and public.teaches_section(t.section_id)
    )
  );

-- Only after submission. Mid-attempt, is_correct on a row the student can read
-- is a marking key delivered one question at a time.
drop policy if exists "answers are visible once the attempt is in" on public.test_answers;
create policy "answers are visible once the attempt is in" on public.test_answers
  for select using (
    exists (
      select 1 from public.test_attempts a
       where a.id = test_answers.attempt_id
         and a.student_id = auth.uid()
         and a.submitted_at is not null
    )
    or exists (
      select 1
        from public.test_attempts a
        join public.tests t on t.id = a.test_id
       where a.id = test_answers.attempt_id
         and t.section_id is not null
         and public.teaches_section(t.section_id)
    )
  );

-- ---------------------------------------------------------------------------
-- How the class did
--
-- The teacher's screen after a test, and the one place the individual answers
-- are aggregated. Same shape as section_heatmap: the question everyone got
-- wrong is a lesson plan, and the child who got it wrong alone is a
-- conversation.
-- ---------------------------------------------------------------------------
create or replace function public.test_results(p_test uuid)
returns table (
  student_id  uuid,
  name        text,
  score       numeric,
  max_score   numeric,
  submitted_at timestamptz,
  status      text
)
language plpgsql
stable
security definer set search_path = public
as $$
declare
  v_section uuid;
begin
  select section_id into v_section from public.tests where id = p_test;

  if v_section is null or not public.teaches_section(v_section) then
    raise exception 'not your test';
  end if;

  return query
  select
    a.student_id,
    coalesce(nullif(trim(p.first_name || ' ' || p.last_name), ''), 'Student'),
    a.score,
    a.max_score,
    a.submitted_at,
    a.status
  from public.test_attempts a
  left join public.profiles p on p.id = a.student_id
  where a.test_id = p_test
  order by a.score asc nulls first;
end;
$$;

grant execute on function public.test_results(uuid) to authenticated;

-- Which questions the class fell over. Question text included because a list
-- of ids is not a lesson plan; the answer is not, because this is readable by
-- a teacher over the wire and there is no reason for it to carry one.
create or replace function public.test_question_breakdown(p_test uuid)
returns table (
  question_ref text,
  stem         text,
  attempted    int,
  correct      int,
  top_misconception text
)
language plpgsql
stable
security definer set search_path = public
as $$
declare
  v_section uuid;
begin
  select section_id into v_section from public.tests where id = p_test;

  if v_section is null or not public.teaches_section(v_section) then
    raise exception 'not your test';
  end if;

  return query
  select
    tq.question_ref,
    q.stem,
    count(ta.id)::int,
    count(*) filter (where ta.is_correct)::int,
    (
      select ta2.misconception_id
        from public.test_answers ta2
        join public.test_attempts att2 on att2.id = ta2.attempt_id
       where att2.test_id = p_test
         and ta2.question_ref = tq.question_ref
         and ta2.misconception_id is not null
       group by ta2.misconception_id
       order by count(*) desc
       limit 1
    )
  from public.test_questions tq
  join public.bank_questions q on q.id = tq.question_ref
  left join public.test_answers ta on ta.question_ref = tq.question_ref
   and ta.attempt_id in (select id from public.test_attempts where test_id = p_test)
  where tq.test_id = p_test
  group by tq.question_ref, q.stem, tq.sort_order
  order by tq.sort_order;
end;
$$;

grant execute on function public.test_question_breakdown(uuid) to authenticated;
