-- PaperPath — schools and coaching centres
--
-- Run after tutor.sql, and before billing.sql (can_access_chapter reads
-- org_members).
--
-- ---------------------------------------------------------------------------
-- WHY B2B IS A DIFFERENT SHAPE, NOT A BIGGER PLAN
--
-- A school does not buy a subscription per child; it buys seats, and it needs
-- one person to see forty students at once. That is a different access model
-- from anything else in this database: every other table answers "may this
-- user see their own row", and a teacher's whole job is seeing someone else's.
--
-- The temptation is to give teachers a broad RLS policy over student data.
-- That is how a leak happens — a teacher who leaves keeps the row, a section
-- that is deleted leaves the membership behind, and nobody notices because the
-- policy is written once and never read again.
--
-- So teachers get aggregates, computed by security-definer functions that
-- check the membership every time. A teacher can see that eleven students in
-- 8-A are stuck on additive inverse. They cannot read a session transcript,
-- and there is no endpoint that would let them.
-- ---------------------------------------------------------------------------

create table if not exists public.orgs (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  kind        text not null default 'school',   -- school | coaching
  plan        text not null default 'seats',
  seats       int  not null default 0,
  expires_at  date,
  created_at  timestamptz not null default now()
);

create table if not exists public.org_members (
  org_id   uuid not null references public.orgs on delete cascade,
  user_id  uuid not null references auth.users on delete cascade,
  role     text not null default 'student' check (role in ('student', 'teacher', 'admin')),
  joined_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

create index if not exists org_members_user_idx on public.org_members (user_id);

create table if not exists public.sections (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.orgs on delete cascade,
  name       text not null,                   -- 'Class 8-A'
  class_level int,
  teacher_id uuid references auth.users on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.section_students (
  section_id uuid not null references public.sections on delete cascade,
  student_id uuid not null references auth.users on delete cascade,
  primary key (section_id, student_id)
);

create index if not exists section_students_student_idx
  on public.section_students (student_id);

-- Assignments. A teacher setting a chapter with a deadline is the single most
-- requested B2B feature and the cheapest to build, because the tutor already
-- knows how to teach a topic — this only says which one and by when.
create table if not exists public.assignments (
  id          uuid primary key default gen_random_uuid(),
  section_id  uuid not null references public.sections on delete cascade,
  chapter_ref text references public.chapters on delete cascade,
  topic_ref   text references public.topics on delete cascade,
  due_on      date,
  note        text,
  created_by  uuid references auth.users on delete set null,
  created_at  timestamptz not null default now(),
  -- One or the other, never both and never neither.
  check ((chapter_ref is null) <> (topic_ref is null))
);

create index if not exists assignments_section_idx
  on public.assignments (section_id, due_on);

alter table public.orgs             enable row level security;
alter table public.org_members      enable row level security;
alter table public.sections         enable row level security;
alter table public.section_students enable row level security;
alter table public.assignments      enable row level security;

-- A member may see the org they belong to, and nothing else about it.
drop policy if exists "members can see their org" on public.orgs;
create policy "members can see their org" on public.orgs
  for select using (
    exists (select 1 from public.org_members m
             where m.org_id = orgs.id and m.user_id = auth.uid())
  );

drop policy if exists "members can see their own membership" on public.org_members;
create policy "members can see their own membership" on public.org_members
  for select using (user_id = auth.uid());

drop policy if exists "members can see sections in their org" on public.sections;
create policy "members can see sections in their org" on public.sections
  for select using (
    exists (select 1 from public.org_members m
             where m.org_id = sections.org_id and m.user_id = auth.uid())
  );

-- A student sees which sections they are in. A teacher does NOT read the
-- roster through this table — that goes through the function below, which
-- checks they still teach the section at the moment they ask.
drop policy if exists "students can see their own enrolment" on public.section_students;
create policy "students can see their own enrolment" on public.section_students
  for select using (student_id = auth.uid());

drop policy if exists "students see assignments set for them" on public.assignments;
create policy "students see assignments set for them" on public.assignments
  for select using (
    exists (select 1 from public.section_students ss
             where ss.section_id = assignments.section_id and ss.student_id = auth.uid())
    or exists (select 1 from public.sections s
                where s.id = assignments.section_id and s.teacher_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- Is this caller the teacher of this section?
--
-- Every function below starts here. Written once so the check cannot be
-- forgotten in the fourth one somebody adds.
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
       and (s.teacher_id = auth.uid() or m.role = 'admin')
  );
$$;

-- ---------------------------------------------------------------------------
-- Class overview — one row per student, red/amber/green
-- ---------------------------------------------------------------------------
create or replace function public.section_overview(p_section uuid)
returns table (
  student_id  uuid,
  name        text,
  avg_score   numeric,
  topics_done int,
  last_active timestamptz,
  state       text
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
    coalesce(p.first_name, 'Student') as name,
    round(coalesce(avg(m.score), 0), 0) as avg_score,
    count(*) filter (where m.score >= 65)::int as topics_done,
    max(s.updated_at) as last_active,
    case
      -- Inactive beats weak. A student who has not opened the app in a week
      -- is the one a teacher needs to speak to first, whatever their score.
      when max(s.updated_at) is null
        or max(s.updated_at) < now() - interval '7 days' then 'red'
      when coalesce(avg(m.score), 0) < 40 then 'red'
      when coalesce(avg(m.score), 0) < 65 then 'amber'
      else 'green'
    end as state
  from public.section_students ss
  left join public.profiles p on p.id = ss.student_id
  left join public.topic_mastery m on m.user_id = ss.student_id
  left join public.learning_sessions s on s.user_id = ss.student_id
  where ss.section_id = p_section
  group by ss.student_id, p.first_name
  order by avg_score asc;
end;
$$;

-- ---------------------------------------------------------------------------
-- Topic heatmap — where the whole class is stuck
--
-- The most valuable screen for a teacher, because it is actionable tomorrow
-- morning: it names the topic to reteach to the room rather than the students
-- to worry about.
-- ---------------------------------------------------------------------------
create or replace function public.section_heatmap(p_section uuid)
returns table (
  topic_ref   text,
  title       text,
  class_avg   numeric,
  struggling  int,
  attempted   int,
  -- The misconception the most students in this class actually hold. This is
  -- the line that turns a heatmap into a lesson plan.
  top_misconception text
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
    t.id,
    t.title,
    round(avg(m.score), 0) as class_avg,
    count(*) filter (where m.score < 40)::int as struggling,
    count(*)::int as attempted,
    (
      select e.misconception_id
        from public.error_events e
        join public.section_students ss2 on ss2.student_id = e.user_id
       where ss2.section_id = p_section
         and e.topic_ref = t.id
         and e.misconception_id is not null
         and e.created_at > now() - interval '30 days'
       group by e.misconception_id
       order by count(distinct e.user_id) desc
       limit 1
    ) as top_misconception
  from public.section_students ss
  join public.topic_mastery m on m.user_id = ss.student_id
  join public.topics t on t.id = m.topic_ref
  where ss.section_id = p_section
  group by t.id, t.title
  order by class_avg asc;
end;
$$;

grant execute on function public.teaches_section(uuid) to authenticated;
grant execute on function public.section_overview(uuid) to authenticated;
grant execute on function public.section_heatmap(uuid) to authenticated;

-- Seats in use, so an admin can see what they are paying for.
create or replace view public.org_seat_usage as
  select o.id as org_id, o.name, o.seats,
         count(*) filter (where m.role = 'student') as students_enrolled
    from public.orgs o
    left join public.org_members m on m.org_id = o.id
   group by o.id, o.name, o.seats;
