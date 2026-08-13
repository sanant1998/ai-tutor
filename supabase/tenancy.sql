-- PaperPath — multi-tenancy
--
-- Run after schools.sql (it extends org_members) and after tutor.sql (it adds
-- a column to every curriculum table).
--
-- ---------------------------------------------------------------------------
-- WHAT CHANGED, AND WHY IT COULD NOT WAIT
--
-- Everything before this file assumed one curriculum, owned by whoever runs
-- the deployment: `subjects` and its children had no owner, and the read
-- policy was literally `using (true)`.
--
-- That is correct for a product you run yourself. It is wrong for a product
-- you SELL, where a coaching institute buys the platform and uploads their own
-- material — because their material must not be visible to another institute's
-- students, and their admin must be able to publish without being in the
-- vendor's environment file.
--
-- Tenant isolation is the one thing that genuinely cannot be retrofitted
-- comfortably. Every table, every query and every policy has to be touched,
-- and a single missed one leaks one customer's content to another — silently,
-- until a customer finds it. So it goes in before the curriculum grows.
--
-- ---------------------------------------------------------------------------
-- THE SHAPE: org_id IS NULL MEANS SHARED
--
--   org_id IS NULL   base curriculum, written by the vendor, visible to
--                    everyone. This is the product being sold.
--   org_id = <uuid>  written by that org, visible only to its members.
--
-- A nullable column rather than two tables, because a topic is a topic and the
-- tutor should not care who wrote it. The cost is that every query has to
-- remember the NULL case; the alternative was duplicating five tables and
-- every join through them.
--
-- ---------------------------------------------------------------------------
-- THE TRAP THIS FILE CANNOT CLOSE ON ITS OWN
--
-- Row-level security does not apply to the service-role key, and the server
-- reads the question bank with it — it has to, because the answers are
-- readable by nobody else. So RLS protects the browser and NOT the server.
--
-- Every service-role read of curriculum must scope by org in code. That is
-- lib/tenancy.ts, and scripts/verify-rls.ts checks the browser half. The
-- server half is checked by scripts/audit-flows.ts and by reading the diff.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Who owns a piece of curriculum
-- ---------------------------------------------------------------------------
alter table public.subjects       add column if not exists org_id uuid references public.orgs on delete cascade;
alter table public.chapters       add column if not exists org_id uuid references public.orgs on delete cascade;
alter table public.topics         add column if not exists org_id uuid references public.orgs on delete cascade;
alter table public.concepts       add column if not exists org_id uuid references public.orgs on delete cascade;
alter table public.bank_questions add column if not exists org_id uuid references public.orgs on delete cascade;

-- Every read filters on this, so it is indexed. Partial on NOT NULL because
-- the shared rows are the common case and a NULL index entry earns nothing.
create index if not exists subjects_org_idx       on public.subjects (org_id)       where org_id is not null;
create index if not exists chapters_org_idx       on public.chapters (org_id)       where org_id is not null;
create index if not exists topics_org_idx         on public.topics (org_id)         where org_id is not null;
create index if not exists concepts_org_idx       on public.concepts (org_id)       where org_id is not null;
create index if not exists bank_questions_org_idx on public.bank_questions (org_id) where org_id is not null;

-- ---------------------------------------------------------------------------
-- Which orgs the caller belongs to
--
-- One function, used by every policy below, so "which content can this person
-- see" has exactly one definition. A policy that inlines its own version is a
-- policy that will disagree with the others after the third edit.
-- ---------------------------------------------------------------------------
create or replace function public.my_org_ids()
returns uuid[]
language sql
stable
security definer set search_path = public
as $$
  select coalesce(array_agg(m.org_id), '{}'::uuid[])
    from public.org_members m
   where m.user_id = auth.uid();
$$;

grant execute on function public.my_org_ids() to authenticated;

-- The rule itself, so the policies below read as one line each.
create or replace function public.can_see_content(p_org uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select p_org is null or p_org = any(public.my_org_ids());
$$;

grant execute on function public.can_see_content(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- The read policies, rewritten
--
-- These were `using (true)`. That was right when there was one curriculum and
-- is a cross-tenant leak the moment there are two.
-- ---------------------------------------------------------------------------
drop policy if exists "subjects are readable" on public.subjects;
create policy "subjects are readable" on public.subjects
  for select to authenticated using (public.can_see_content(org_id));

drop policy if exists "chapters are readable" on public.chapters;
create policy "chapters are readable" on public.chapters
  for select to authenticated using (public.can_see_content(org_id));

drop policy if exists "topics are readable" on public.topics;
create policy "topics are readable" on public.topics
  for select to authenticated using (public.can_see_content(org_id));

drop policy if exists "concepts are readable" on public.concepts;
create policy "concepts are readable" on public.concepts
  for select to authenticated using (public.can_see_content(org_id));

-- bank_questions still has NO select policy. Answers are unreachable from a
-- browser regardless of tenancy, and that has not changed.

-- ---------------------------------------------------------------------------
-- Roles inside an org
--
-- schools.sql allowed student | teacher | admin. 'admin' there meant "can see
-- every section in this org", which is a teaching-side power. The buyer needs
-- more than that: publishing curriculum, managing seats, adding teachers.
--
-- Renamed to org_admin so it cannot be confused with the vendor's own admin —
-- which is deliberately NOT a database role at all. ADMIN_EMAILS stays what it
-- is: a super-admin is a person in the vendor's environment file, unreachable
-- from inside the database, because they can change what every student in
-- every org is taught.
-- ---------------------------------------------------------------------------
alter table public.org_members drop constraint if exists org_members_role_check;

alter table public.org_members
  add constraint org_members_role_check
  check (role in ('student', 'teacher', 'org_admin'));

update public.org_members set role = 'org_admin' where role = 'admin';

create or replace function public.is_org_admin(p_org uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.org_members m
     where m.org_id = p_org
       and m.user_id = auth.uid()
       and m.role = 'org_admin'
  );
$$;

grant execute on function public.is_org_admin(uuid) to authenticated;

-- teaches_section referenced role = 'admin'. Kept working under the new name.
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
  );
$$;

-- ---------------------------------------------------------------------------
-- Content drafts belong to an org too
--
-- Without this, one institute's content team sees another's unpublished
-- material in the review queue — which is worse than seeing the published
-- version, because a draft is what they are still arguing about internally.
-- ---------------------------------------------------------------------------
alter table public.content_drafts
  add column if not exists org_id uuid references public.orgs on delete cascade;

create index if not exists content_drafts_org_idx
  on public.content_drafts (org_id, status);

-- ---------------------------------------------------------------------------
-- Licences
--
-- orgs already had plan, seats and expires_at from schools.sql — enough to
-- gate access, not enough to bill. Both revenue paths run side by side: an
-- institute buys a licence and its students pay nothing, and a parent who
-- found the app directly still subscribes. can_access_chapter already reads
-- both, so nothing downstream changes.
-- ---------------------------------------------------------------------------
alter table public.orgs add column if not exists licence_inr numeric(10,2);
alter table public.orgs add column if not exists licence_starts_on date;
alter table public.orgs add column if not exists billing_email text;
alter table public.orgs add column if not exists billing_contact text;

-- Whether this org may publish its own curriculum at all. Some plans are
-- "use the vendor's content on your students" and nothing more, and that is a
-- commercial line rather than a technical one — so it is a column, not an
-- assumption baked into the console.
alter table public.orgs
  add column if not exists can_author boolean not null default false;

-- ---------------------------------------------------------------------------
-- Analytics stops knowing who anybody is
--
-- analytics_events.user_id was written on every event and read by no query.
-- health_snapshot counts distinct students from learning_sessions;
-- activation_by_cohort works off auth.users and topic_mastery. Neither has
-- ever touched this column.
--
-- Meanwhile the browser collector took the id off the session cookie and
-- stored it without checking the 'analytics' consent at all — so a parent who
-- declined it had their child's behaviour recorded anyway, and the box on the
-- consent screen was asking permission for something that happened either
-- way.
--
-- Dropping the column is what makes removing that box honest. What is left is
-- a count of how often each event happened, which is all anything ever read.
-- Existing rows lose the id with it, which is the point: data collected for a
-- purpose that did not exist should not survive the discovery that it did not
-- exist.
-- ---------------------------------------------------------------------------
alter table public.analytics_events drop column if exists user_id;

-- Is this licence in force today?
--
-- Both ends, not just the far one. A licence sold in March to start in June is
-- a normal thing for a school — the academic year begins when it begins — and
-- checking only expires_at would hand over three months of access that nobody
-- has paid for yet. Null start means "already running", which is what every
-- org created before this column existed means.
--
-- One function rather than the same date arithmetic in four places, because
-- the two branches of can_access_chapter disagreeing about what "live" means
-- is a bug that only shows up on the boundary day.
-- stable, not immutable: it reads current_date. Marking a function immutable
-- when it depends on the clock is what produced the 42P17 rejection on
-- is_minor, and where Postgres accepts it instead of rejecting it the result
-- gets folded into a cached plan and the licence stops expiring.
create or replace function public.licence_is_live(p_starts date, p_expires date)
returns boolean
language sql
stable
as $$
  select (p_starts is null or p_starts <= current_date)
     and (p_expires is null or p_expires >= current_date);
$$;

-- ---------------------------------------------------------------------------
-- Access, extended
--
-- An org's own chapter is readable by its members without any subscription:
-- they have already paid, through the licence. The base curriculum still
-- follows is_free plus a subscription plus a seat, exactly as before.
-- ---------------------------------------------------------------------------
create or replace function public.can_access_chapter(p_user uuid, p_chapter text)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select
    -- The org's own material, to its own members with a live licence.
    exists (
      select 1
        from public.chapters c
        join public.org_members m on m.org_id = c.org_id
        join public.orgs o on o.id = c.org_id
       where c.id = p_chapter
         and c.org_id is not null
         and m.user_id = p_user
         and public.licence_is_live(o.licence_starts_on, o.expires_at)
    )
    -- The free chapter of the base curriculum.
    or coalesce(
      (select c.is_free from public.chapters c
        where c.id = p_chapter and c.org_id is null),
      false)
    -- A direct subscription.
    or exists (
      select 1
        from public.subscriptions s
        left join public.chapters c on c.id = p_chapter
       where s.user_id = p_user
         and (s.subject_ref is null or s.subject_ref = c.subject_ref)
         and (
           (
             s.status = 'active'
             -- The period has to still be running. Without this, 'active' was
             -- open-ended: the row only leaves that state when a webhook says
             -- so, and a webhook that stops arriving — rotated secret, paused
             -- endpoint, a mandate Razorpay gave up retrying — looked exactly
             -- like a subscription that renews free forever. Null is treated
             -- as open: a mandate authorised but not yet charged has no period
             -- end, and that student has paid.
             and (s.current_period_end is null or s.current_period_end > now())
           )
           or (s.status = 'past_due' and s.grace_until > now())
         )
    )
    -- A seat at an institute with a live licence covers the base curriculum.
    or exists (
      select 1
        from public.org_members m
        join public.orgs o on o.id = m.org_id
       where m.user_id = p_user
         and public.licence_is_live(o.licence_starts_on, o.expires_at)
    );
$$;

grant execute on function public.can_access_chapter(uuid, text) to authenticated;
