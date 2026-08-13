-- PaperPath — school operations
--
-- Run after tenancy.sql. It reads orgs, sections, org_members and is_org_admin,
-- and it replaces teaches_section — so anything that runs before it will be
-- overwritten by the version in tenancy.sql if the order is wrong.
--
-- ---------------------------------------------------------------------------
-- WHAT WAS MISSING, AND WHY EACH PIECE IS HERE
--
-- schools.sql gave an org sections, students and one teacher per section. That
-- is enough to pilot with one class. It is not enough to run a school for a
-- year, and the gaps are all the same gap: nothing in the database knows what
-- a school year IS.
--
--   A section has no year, so 8-A in 2026-27 and 8-A in 2027-28 are the same
--   row. Last year's results silently reattach to this year's children.
--
--   A student has no admission number, so the only identifier the school
--   actually uses in its own registers — the one written on the fee receipt
--   and the report card — cannot be searched here.
--
--   A teacher is scoped by sections.teacher_id, which is one teacher per
--   section. A real timetable is many: the Maths teacher and the Science
--   teacher both teach 8-A, and neither should see the other's subject.
--
-- ---------------------------------------------------------------------------
-- THE ONE THAT IS A SECURITY FIX, NOT A FEATURE
--
-- teacher_assignments closes the hole named at the bottom of this file. Until
-- now a section had a single teacher_id and everyone else in the org with the
-- org_admin role could see everything; a subject teacher had no way to be
-- given one section without being given the whole school. Scope now comes from
-- an assignment row, which is the shape the timetable already has on paper.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Run in the right order?
--
-- Pasting one migration on its own is the ordinary mistake. Said here, once,
-- rather than as whichever constraint happens to fail first.
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.is_org_admin(uuid)') is null then
    raise exception 'supabase/tenancy.sql has not been run'
      using hint = 'Paste supabase/all.sql — every migration, already in dependency order.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Masters: boards and grades
--
-- subjects.board and subjects.class_level have always been loose text and int,
-- validated only by lib/syllabus.ts — which the server trusts and the database
-- has never seen. A typo'd board in an import writes a subject nobody can find
-- and nothing rejects it.
--
-- These two tables are small, shared by every org, and exist mainly so the
-- foreign keys at the bottom of this section can. There is no org_id: a board
-- is not a tenant's property.
-- ---------------------------------------------------------------------------
create table if not exists public.boards (
  code      text primary key,           -- cbse | icse | upboard, matching lib/syllabus.ts
  name      text not null,
  is_active boolean not null default true
);

-- Stream is deliberately NOT modelled.
--
-- The blueprint keyed grades on (rank, stream) so that Class 11 Commerce and
-- Class 11 Science could differ. Here they already do, one level down: the
-- subject list for a class is (board, class_level, subject_id), and
-- accountancy simply does not exist for the science stream. Adding a stream
-- column would give two places to answer the same question, and they would
-- disagree the first time somebody edited one of them.
create table if not exists public.grades (
  class_level int primary key,          -- 8, matching subjects.class_level
  label       text not null,            -- 'Class 8'
  is_active   boolean not null default true
);

insert into public.boards (code, name) values
  ('cbse',    'CBSE'),
  ('icse',    'ICSE'),
  ('upboard', 'UP Board')
on conflict (code) do nothing;

-- Anything already in the curriculum that this file did not anticipate. Without
-- it the foreign key below fails on a database that has been seeded with a
-- board added after this migration was written, which is a migration that
-- refuses to run for a reason nobody can see from the error.
insert into public.boards (code, name)
  select distinct s.board, upper(s.board)
    from public.subjects s
   where s.board is not null and s.board <> ''
on conflict (code) do nothing;

-- 1 to 12, not the 5-12 the blueprint assumed.
--
-- lib/syllabus.ts types ClassLevel as 1..10 and CLASSES offers all ten, with
-- classBand() treating 1-5 as a different product read by a parent — so a
-- school CAN have a Class 3 section today. Seeding only 5-12 would leave the
-- foreign key on subjects.class_level rejecting Class 3 content the moment
-- somebody authored it, and the error would name a constraint rather than the
-- gap in this list. 11 and 12 are here because a coaching centre sells to them
-- even though no curriculum exists for them yet.
insert into public.grades (class_level, label)
  select g, 'Class ' || g from generate_series(1, 12) g
on conflict (class_level) do nothing;

insert into public.grades (class_level, label)
  select distinct s.class_level, 'Class ' || s.class_level
    from public.subjects s
   where s.class_level is not null
on conflict (class_level) do nothing;

-- Added after the seed, and guarded, because `add constraint if not exists`
-- does not exist in Postgres and a second run of this file must not fail.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'subjects_board_fkey'
  ) then
    alter table public.subjects
      add constraint subjects_board_fkey
      foreign key (board) references public.boards(code);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'subjects_class_level_fkey'
  ) then
    alter table public.subjects
      add constraint subjects_class_level_fkey
      foreign key (class_level) references public.grades(class_level);
  end if;
end $$;

alter table public.boards enable row level security;
alter table public.grades enable row level security;

-- Readable by everyone signed in: a board list is not a secret, and every
-- picker in the app needs it.
drop policy if exists "boards are readable" on public.boards;
create policy "boards are readable" on public.boards
  for select to authenticated using (true);

drop policy if exists "grades are readable" on public.grades;
create policy "grades are readable" on public.grades
  for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- Which board a school teaches
--
-- The one fact about a school that every student in it shares, and until now
-- the only place it existed was in each child's own onboarding answers — so
-- four hundred students at one CBSE school each told the app, separately, that
-- they were CBSE, and any of them could say ICSE by mistake and be believed.
--
-- Nullable, because a coaching centre that prepares children from three boards
-- is a real customer and null means "ask the student", which is what the app
-- does today.
-- ---------------------------------------------------------------------------
alter table public.orgs
  add column if not exists board text references public.boards(code);

-- ---------------------------------------------------------------------------
-- The academic year
--
-- Per org, not per platform. Indian school years mostly start in April, but a
-- coaching centre running a one-year crash course starts when it sells the
-- batch, and a database that assumes April tells that customer their year is
-- wrong.
-- ---------------------------------------------------------------------------
create table if not exists public.academic_years (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.orgs on delete cascade,
  label      text not null,                        -- '2026-27'
  starts_on  date not null,
  ends_on    date not null,
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  unique (org_id, label),
  check (ends_on > starts_on)
);

-- One current year per org, enforced by the database rather than by whichever
-- console last wrote to it. Two current years is not a display bug: promotion
-- picks the wrong source class and moves the whole school into the wrong rooms.
create unique index if not exists academic_years_current_idx
  on public.academic_years (org_id) where is_current;

-- ---------------------------------------------------------------------------
-- Sections gain a year
--
-- Nullable, because every section that exists today predates this column and
-- guessing a year for it would be inventing history. Null reads as "the
-- section this org was piloting with", and new ones get a year.
-- ---------------------------------------------------------------------------
alter table public.sections
  add column if not exists academic_year_id uuid references public.academic_years on delete set null;

create index if not exists sections_year_idx
  on public.sections (org_id, academic_year_id);

-- ---------------------------------------------------------------------------
-- The school's own record of a student
--
-- Named student_records and not student_profiles, because `profiles` already
-- means something in this database — the account-level row every user has,
-- self-service under RLS, holding the name, language, dob and consent state.
-- This is the other thing: what the SCHOOL knows about the child, which is a
-- different owner and a different lifetime. A student who leaves the school
-- keeps their profile and loses this.
--
-- dob is deliberately not repeated here. compliance.sql put it on profiles and
-- is_minor() reads it to decide whether parental consent is required; a second
-- copy that a school admin can edit is a second answer to "is this child under
-- 18", and the wrong one would be the editable one.
-- ---------------------------------------------------------------------------
create table if not exists public.student_records (
  org_id           uuid not null references public.orgs on delete cascade,
  student_id       uuid not null references auth.users on delete cascade,
  admission_number text not null,
  roll_number      text,
  section_id       uuid references public.sections on delete set null,
  admission_date   date,
  created_at       timestamptz not null default now(),
  primary key (org_id, student_id),
  unique (org_id, admission_number)
);

create index if not exists student_records_section_idx
  on public.student_records (section_id);

-- ---------------------------------------------------------------------------
-- Who teaches what, where
--
-- The table the teacher screens should have been reading from the start.
-- sections.teacher_id stays: it is the class teacher, a real and separate role
-- in an Indian school — the one who takes attendance and talks to the parent.
-- Subject teaching is this table.
-- ---------------------------------------------------------------------------
create table if not exists public.teacher_assignments (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.orgs on delete cascade,
  teacher_id       uuid not null references auth.users on delete cascade,
  section_id       uuid not null references public.sections on delete cascade,
  subject_ref      text not null references public.subjects on delete cascade,
  academic_year_id uuid references public.academic_years on delete cascade,
  created_at       timestamptz not null default now(),
  unique (teacher_id, section_id, subject_ref, academic_year_id)
);

create index if not exists teacher_assignments_section_idx
  on public.teacher_assignments (section_id, subject_ref);

create index if not exists teacher_assignments_teacher_idx
  on public.teacher_assignments (teacher_id);

-- ---------------------------------------------------------------------------
-- Where a student sat, each year
--
-- section_students is the present tense and stays that way — every query that
-- asks "who is in this class" reads it and should not have to filter by year.
-- This is the past, written once at promotion.
--
-- Without it, a report card from Class 8 is indistinguishable from one from
-- Class 9 the moment the child moves up, because the only link between a
-- student and a class is a membership row that promotion overwrites.
-- ---------------------------------------------------------------------------
create table if not exists public.student_section_history (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.orgs on delete cascade,
  student_id       uuid not null references auth.users on delete cascade,
  academic_year_id uuid not null references public.academic_years on delete cascade,
  section_id       uuid not null references public.sections on delete cascade,
  -- active | promoted | repeated | transferred | left
  status           text not null default 'active'
                   check (status in ('active', 'promoted', 'repeated', 'transferred', 'left')),
  created_at       timestamptz not null default now(),
  unique (student_id, academic_year_id)
);

create index if not exists student_section_history_section_idx
  on public.student_section_history (section_id);

-- ---------------------------------------------------------------------------
-- Bulk imports
--
-- The existing roster import in app/api/admin/schools/route.ts posts a list of
-- addresses and returns the failures in its response. That is fine for forty
-- and useless for five hundred: the tab gets closed, the response is gone, and
-- nobody can answer "which twelve did not go in".
--
-- No file_url. The blueprint stored an uploaded spreadsheet and an error report
-- as two more URLs in object storage; this repository already treats every
-- stored artefact as something that has to be purged on erasure
-- (compliance.sql), and a school roster is the single most identifying file in
-- the product. The rows come in over the request and there is nothing at rest
-- to forget about.
--
-- And the errors are row numbers, not values. The route that writes them
-- already refuses to store the addresses of children who have not signed up —
-- "a list of children's email addresses held for a purpose nobody consented
-- to" is the note it was written with — and a failed row is one of those
-- addresses with a typo in it. The person fixing the import has the
-- spreadsheet open in front of them, so "row 14" is the whole fix.
-- ---------------------------------------------------------------------------
create table if not exists public.import_jobs (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.orgs on delete cascade,
  uploaded_by  uuid references auth.users on delete set null,
  kind         text not null check (kind in ('students', 'teachers', 'parents')),
  source_name  text,                              -- 'class-8-a.csv', for the console only
  total_rows   int not null default 0,
  success_rows int not null default 0,
  failed_rows  int not null default 0,
  -- [{"row": 14, "reason": "not an email address"}] — positions and reasons.
  errors       jsonb not null default '[]'::jsonb,
  status       text not null default 'queued'
               check (status in ('queued', 'processing', 'completed', 'failed')),
  created_at   timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists import_jobs_org_idx
  on public.import_jobs (org_id, created_at desc);

-- ---------------------------------------------------------------------------
-- org_id must agree with what the row points at
--
-- Every table above carries org_id AND a reference to a section or an academic
-- year, and until now nothing checked that the two agreed. A row could name
-- School A's section and carry School B's org_id, and no constraint would
-- object — the section FK is satisfied, the org FK is satisfied, and the pair
-- is nonsense.
--
-- That is not a theoretical tidiness problem. Every policy on these tables
-- reads org_id: `is_org_admin(org_id)` on student_records, `my_org_ids()` on
-- academic_years. So a mismatched row is handed to whichever school the org_id
-- names, carrying another school's data — the cross-tenant leak this codebase
-- is otherwise careful about, arriving through the back door of a denormalised
-- column rather than a missing WHERE clause.
--
-- One trigger function rather than composite foreign keys, because a composite
-- FK on (section_id, org_id) collides with the single-column FK already there:
-- both fire on delete, one wants SET NULL and the other NO ACTION, and the
-- column-list form of ON DELETE SET NULL is PostgreSQL 15+. A trigger says the
-- same thing in one place and works everywhere.
-- ---------------------------------------------------------------------------
create or replace function public.assert_row_org()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_ref uuid := (to_jsonb(new) ->> tg_argv[0])::uuid;
  v_org uuid := (to_jsonb(new) ->> 'org_id')::uuid;
  v_owner uuid;
begin
  -- Nothing to check: an unset reference, or a platform-level row on one of
  -- the tables where org_id is nullable and null means "the vendor's".
  if v_ref is null or v_org is null then
    return new;
  end if;

  execute format('select org_id from public.%I where id = $1', tg_argv[1])
    into v_owner using v_ref;

  if v_owner is distinct from v_org then
    raise exception 'that % belongs to another organisation', tg_argv[1]
      using hint = 'org_id must match the row it points at.';
  end if;

  return new;
end;
$$;

drop trigger if exists teacher_assignments_org on public.teacher_assignments;
create trigger teacher_assignments_org
  before insert or update of section_id, org_id on public.teacher_assignments
  for each row execute function public.assert_row_org('section_id', 'sections');

drop trigger if exists teacher_assignments_year_org on public.teacher_assignments;
create trigger teacher_assignments_year_org
  before insert or update of academic_year_id, org_id on public.teacher_assignments
  for each row execute function public.assert_row_org('academic_year_id', 'academic_years');

drop trigger if exists student_records_org on public.student_records;
create trigger student_records_org
  before insert or update of section_id, org_id on public.student_records
  for each row execute function public.assert_row_org('section_id', 'sections');

drop trigger if exists student_section_history_org on public.student_section_history;
create trigger student_section_history_org
  before insert or update of section_id, org_id on public.student_section_history
  for each row execute function public.assert_row_org('section_id', 'sections');

drop trigger if exists student_section_history_year_org on public.student_section_history;
create trigger student_section_history_year_org
  before insert or update of academic_year_id, org_id on public.student_section_history
  for each row execute function public.assert_row_org('academic_year_id', 'academic_years');

-- ---------------------------------------------------------------------------
-- Import errors do not live for ever
--
-- Belt and braces. As written, the route stores row numbers and reasons and no
-- values at all, so there should be nothing here that names anybody — but this
-- is a jsonb column on the one table a school fills in about children who do
-- not have accounts yet, and "should be nothing" is a property of the current
-- version of one route.
--
-- The counts stay, which is what the console shows a month later. The detail
-- goes at ninety days, long enough for the office to fix the rows that failed,
-- which is the only thing it is for.
-- ---------------------------------------------------------------------------
create or replace function public.purge_import_errors()
returns int
language plpgsql
security definer set search_path = public
as $$
declare
  v_rows int;
begin
  update public.import_jobs
     set errors = '[]'::jsonb
   where created_at < now() - interval '90 days'
     and errors <> '[]'::jsonb;

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row-level security
--
-- Reads only. Every table here is written by the admin console with the
-- service-role key, which RLS does not apply to — so an insert policy would
-- describe a path nothing takes, and the only thing it could do is let a
-- student take it. The console's own authorisation is lib/admin/access.ts.
-- ---------------------------------------------------------------------------
alter table public.academic_years          enable row level security;
alter table public.student_records         enable row level security;
alter table public.teacher_assignments     enable row level security;
alter table public.student_section_history enable row level security;
alter table public.import_jobs             enable row level security;

drop policy if exists "members can see their org's years" on public.academic_years;
create policy "members can see their org's years" on public.academic_years
  for select using (org_id = any(public.my_org_ids()));

-- A student sees their own record. A teacher does not read the register this
-- way — admission numbers for the whole school through one policy is exactly
-- the broad grant schools.sql refused to write — they get the roster through
-- section_roster() below, which re-checks the assignment every time.
drop policy if exists "students can see their own record" on public.student_records;
create policy "students can see their own record" on public.student_records
  for select using (
    student_id = auth.uid() or public.is_org_admin(org_id)
  );

drop policy if exists "teachers can see their own assignments" on public.teacher_assignments;
create policy "teachers can see their own assignments" on public.teacher_assignments
  for select using (
    teacher_id = auth.uid() or public.is_org_admin(org_id)
  );

drop policy if exists "students can see their own history" on public.student_section_history;
create policy "students can see their own history" on public.student_section_history
  for select using (
    student_id = auth.uid() or public.is_org_admin(org_id)
  );

-- Import jobs name other people's children in their error rows. Org admins
-- only, and no student policy at all.
drop policy if exists "org admins can see their imports" on public.import_jobs;
create policy "org admins can see their imports" on public.import_jobs
  for select using (public.is_org_admin(org_id));

-- ---------------------------------------------------------------------------
-- Teacher scope, corrected
--
-- The version in tenancy.sql answered yes for the class teacher and for every
-- org_admin. A subject teacher assigned to 8-A for Maths got nothing, so the
-- only way to give them their own class was to make them an org admin — which
-- hands them every class in the school and the ability to publish curriculum.
--
-- That is the failure mode the blueprint's "Rule #2" describes, and it was
-- live here: scope has to come from the assignment, not from the role.
-- ---------------------------------------------------------------------------
create or replace function public.teaches_section(p_section uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1
      from public.sections s
      join public.org_members m on m.org_id = s.org_id and m.user_id = auth.uid()
     where s.id = p_section
       and (s.teacher_id = auth.uid() or m.role = 'org_admin')
  )
  or exists (
    select 1
      from public.teacher_assignments ta
     where ta.section_id = p_section
       and ta.teacher_id = auth.uid()
  );
$$;

grant execute on function public.teaches_section(uuid) to authenticated;

-- The same hole, in the one policy that inlined its own version of the check.
--
-- schools.sql wrote "or the section's teacher_id is me" directly into the
-- assignments policy instead of calling the function, so correcting the
-- function above would have left this one behind — a subject teacher who could
-- not see the homework set for their own class, and could not see it come back
-- either, because assignment_submissions reads through this policy.
--
-- This is the argument for the function existing at all: a check that is
-- written twice is a check that gets fixed once.
drop policy if exists "students see assignments set for them" on public.assignments;
create policy "students see assignments set for them" on public.assignments
  for select using (
    exists (select 1 from public.section_students ss
             where ss.section_id = assignments.section_id and ss.student_id = auth.uid())
    or public.teaches_section(section_id)
  );

-- ---------------------------------------------------------------------------
-- The roster, for whoever actually teaches the class
--
-- A function rather than a policy, for the reason schools.sql gives at length:
-- a policy is written once and read never, and one that says "teachers may see
-- students" keeps saying it after the teacher leaves. This checks at the
-- moment of asking.
--
-- It returns the register — name, admission number, roll number — and nothing
-- about how the child is doing. Performance is section_overview(), already
-- written, and keeping the two apart means the school-office view and the
-- teaching view can be granted separately later without splitting a function.
-- ---------------------------------------------------------------------------
create or replace function public.section_roster(p_section uuid)
returns table (
  student_id       uuid,
  name             text,
  admission_number text,
  roll_number      text
)
language plpgsql
stable
security definer set search_path = public
as $$
begin
  if not public.teaches_section(p_section) then
    raise exception 'not your section';
  end if;

  return query
  select
    ss.student_id,
    coalesce(nullif(trim(p.first_name || ' ' || p.last_name), ''), 'Student') as name,
    sr.admission_number,
    sr.roll_number
  from public.section_students ss
  left join public.profiles p on p.id = ss.student_id
  left join public.student_records sr on sr.student_id = ss.student_id
   and sr.org_id = (select s.org_id from public.sections s where s.id = p_section)
  where ss.section_id = p_section
  -- Roll numbers are text and a register sorted as text puts 10 before 2.
  -- The digits decide; anything without digits, and anyone with no record
  -- yet, falls to the bottom under their name. Ordinal 2 rather than `name`
  -- because that is also this function's OUT parameter, and a name that is
  -- both is one PostgreSQL version away from resolving to the wrong one.
  order by nullif(regexp_replace(coalesce(sr.roll_number, ''), '\D', '', 'g'), '')::int
             nulls last,
           2;
end;
$$;

grant execute on function public.section_roster(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Promotion
--
-- The year-end job, as one transaction, because the half-done version is a
-- school where some children are in Class 9 and some are still in Class 8 and
-- no screen tells you which.
--
-- It writes history first and moves memberships second, so a failure leaves
-- the school where it started rather than mid-move. Students already recorded
-- for the target year are skipped, which makes a second run after a partial
-- failure safe — the operator's instinct is to press it again, and that has to
-- be the harmless choice.
-- ---------------------------------------------------------------------------
create or replace function public.promote_section(
  p_from_section uuid,
  p_to_section uuid,
  p_academic_year uuid
)
returns int
language plpgsql
security definer set search_path = public
as $$
declare
  v_org uuid;
  v_moved int := 0;
begin
  select org_id into v_org from public.sections where id = p_from_section;

  if v_org is null then
    raise exception 'no such section';
  end if;

  if not public.is_org_admin(v_org) then
    raise exception 'not your organisation';
  end if;

  -- Both ends in the same org, or promotion becomes a way to move a child into
  -- another customer's school.
  if not exists (
    select 1 from public.sections where id = p_to_section and org_id = v_org
  ) then
    raise exception 'sections belong to different organisations';
  end if;

  if not exists (
    select 1 from public.academic_years where id = p_academic_year and org_id = v_org
  ) then
    raise exception 'that academic year belongs to another organisation';
  end if;

  insert into public.student_section_history (org_id, student_id, academic_year_id, section_id, status)
    select v_org, ss.student_id, p_academic_year, p_from_section, 'promoted'
      from public.section_students ss
     where ss.section_id = p_from_section
  on conflict (student_id, academic_year_id) do nothing;

  insert into public.section_students (section_id, student_id)
    select p_to_section, ss.student_id
      from public.section_students ss
     where ss.section_id = p_from_section
  on conflict do nothing;

  get diagnostics v_moved = row_count;

  delete from public.section_students where section_id = p_from_section;

  update public.student_records
     set section_id = p_to_section
   where org_id = v_org and section_id = p_from_section;

  return v_moved;
end;
$$;

grant execute on function public.promote_section(uuid, uuid, uuid) to authenticated;
