-- PaperPath — licences, seats and school invoicing
--
-- Run after schoolops.sql (plan access rows reference boards and grades) and
-- after tenancy.sql, because it replaces can_access_chapter and tenancy.sql
-- has the previous word on it.
--
-- ---------------------------------------------------------------------------
-- WHY THE COLUMNS ON orgs WERE NOT ENOUGH
--
-- An org carries seats, expires_at, licence_inr and licence_starts_on. One
-- deal, in place, expressed as four columns — which works exactly until the
-- second deal:
--
--   A renewal overwrites the year that was just delivered, so nobody can say
--   what the school paid last year or when it lapsed.
--
--   A school that buys 200 seats in April and 60 more in October has one seat
--   count and one price, and the second sale has nowhere to go.
--
--   Nothing records WHICH children are on the seats. seats_used was a count,
--   and a count cannot answer "the school says it has 40 spare, why is this
--   child locked out" — the question every support call is actually about.
--
-- ---------------------------------------------------------------------------
-- THIS FILE DOES NOT TAKE ANYTHING AWAY
--
-- The columns on orgs still work and still grant access. Every org that exists
-- today was sold that way, and a migration that made them stop working would
-- lock out every pilot on the day it ran. So the new path is additive: a live
-- licence with an assigned seat grants access, and so does the old expiry
-- date, until an org is moved across.
--
-- The backfill at the bottom moves them. It is a separate statement rather
-- than part of the migration because it should be read before it is run.
-- ---------------------------------------------------------------------------

-- Run in the right order? boards and grades come from schoolops.sql, and the
-- plan access table below has foreign keys into both.
do $$
begin
  if to_regclass('public.boards') is null then
    raise exception 'supabase/schoolops.sql has not been run'
      using hint = 'Paste supabase/all.sql — every migration, already in dependency order.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- What is for sale
--
-- licence_plans, not plans, because lib/plans.ts already means the parent's
-- monthly subscription. Both revenue paths run side by side — a school buys
-- seats, a parent who found the app buys a subscription — and the two price
-- lists have never been the same list.
-- ---------------------------------------------------------------------------
create table if not exists public.licence_plans (
  code               text primary key,          -- 'school-standard'
  name               text not null,
  price_per_seat_inr numeric(10,2) not null,
  billing_cycle      text not null default 'yearly'
                     check (billing_cycle in ('yearly', 'half-yearly', 'quarterly')),
  -- The daily AI credit a student on this plan gets. ai_usage and
  -- consume_ai_quota already enforce a limit; this is where the number comes
  -- from when the org has a licence rather than the app-wide default.
  ai_credits_per_day int not null default 5,
  -- Whether the org may publish its own curriculum. orgs.can_author is the
  -- live switch and stays authoritative; this is the default a new licence
  -- sets, so the commercial line lives with the price rather than next to it.
  can_author         boolean not null default false,
  is_active          boolean not null default true,
  created_at         timestamptz not null default now()
);

-- What a plan unlocks. Every column nullable, and null means "all of them":
-- the common plan is "everything we publish for CBSE Class 8", which is one
-- row, and the restrictive plan is several.
--
-- No rows at all for a plan means no restriction. That is the permissive
-- default on purpose — a plan whose access list somebody forgot to fill in
-- should sell the whole catalogue and be noticed in the numbers, not lock a
-- school out of everything on a Monday morning.
create table if not exists public.licence_plan_access (
  id          uuid primary key default gen_random_uuid(),
  plan_code   text not null references public.licence_plans on delete cascade,
  board       text references public.boards(code) on delete cascade,
  class_level int  references public.grades(class_level) on delete cascade,
  subject_id  text,                             -- maths | science, per lib/syllabus.ts
  unique (plan_code, board, class_level, subject_id)
);

insert into public.licence_plans (code, name, price_per_seat_inr, ai_credits_per_day, can_author) values
  ('school-standard', 'School Standard', 600.00, 5,  false),
  ('school-premium',  'School Premium',  900.00, 15, true)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- The deal itself
-- ---------------------------------------------------------------------------
create table if not exists public.licences (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.orgs on delete cascade,
  plan_code       text not null references public.licence_plans,
  seats_purchased int  not null check (seats_purchased >= 0),
  price_per_seat_inr numeric(10,2),             -- null = the plan's list price
  starts_on       date not null,
  expires_on      date not null,
  status          text not null default 'active'
                  check (status in ('active', 'expired', 'cancelled')),
  po_number       text,                          -- schools pay against one
  created_at      timestamptz not null default now(),
  check (expires_on >= starts_on)
);

create index if not exists licences_org_idx on public.licences (org_id, status);

-- ---------------------------------------------------------------------------
-- Who is sitting on the seats
--
-- A row per student per licence, with a revocation date rather than a delete:
-- "this child had access from June to November" is a question a school asks
-- when a parent disputes a bill, and a deleted row cannot answer it.
-- ---------------------------------------------------------------------------
create table if not exists public.licence_seats (
  id          uuid primary key default gen_random_uuid(),
  licence_id  uuid not null references public.licences on delete cascade,
  org_id      uuid not null references public.orgs on delete cascade,
  student_id  uuid not null references auth.users on delete cascade,
  assigned_at timestamptz not null default now(),
  revoked_at  timestamptz,
  unique (licence_id, student_id)
);

create index if not exists licence_seats_student_idx
  on public.licence_seats (student_id) where revoked_at is null;

create index if not exists licence_seats_org_idx
  on public.licence_seats (org_id, licence_id);

-- ---------------------------------------------------------------------------
-- The seat count is enforced here, not in the console
--
-- The blueprint kept seats_used as a column with a CHECK against it. A counter
-- maintained by application code drifts the first time an assignment fails
-- halfway, and then the check is guarding a number that is already wrong.
--
-- Counting the live rows cannot drift. It costs an indexed count per
-- assignment, which happens at most a few hundred times a year per school.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_seat_rules()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_purchased int;
  v_licence_org uuid;
  v_used int;
begin
  select seats_purchased, org_id into v_purchased, v_licence_org
    from public.licences where id = new.licence_id;

  -- The seat, the licence and the school must be the same school. Without
  -- this, a seat row could carry School B's org_id against School A's licence
  -- — and since the RLS policy on this table is is_org_admin(org_id), School B
  -- would be reading and revoking seats it does not own.
  if v_licence_org is distinct from new.org_id then
    raise exception 'that licence belongs to another organisation';
  end if;

  -- A seat is a seat AT a school, and can_access_chapter grants the whole
  -- covered curriculum to whoever holds one. Handing it to somebody who is not
  -- a member of that school is how an ex-student, or a stranger whose id was
  -- pasted into the wrong field, keeps full access — with a valid-looking row
  -- and nothing to notice it by.
  if not exists (
    select 1 from public.org_members m
     where m.org_id = new.org_id and m.user_id = new.student_id
  ) then
    raise exception 'that student is not a member of this organisation';
  end if;

  select count(*) into v_used
    from public.licence_seats
   where licence_id = new.licence_id
     and revoked_at is null
     and id <> new.id;

  if v_used >= v_purchased then
    raise exception 'licence has % seats and all of them are in use', v_purchased
      using hint = 'Revoke a seat or sell more.';
  end if;

  return new;
end;
$$;

-- licence_id and student_id are in the column list, not just revoked_at.
-- Moving a live seat to a different licence is an UPDATE that changes who is
-- consuming which allowance, and a trigger watching only revoked_at sleeps
-- through it — so a two-seat licence can be filled from another one's rows.
drop trigger if exists licence_seats_limit on public.licence_seats;
drop trigger if exists licence_seats_rules on public.licence_seats;
create trigger licence_seats_rules
  before insert or update of revoked_at, licence_id, student_id, org_id
  on public.licence_seats
  for each row when (new.revoked_at is null)
  execute function public.enforce_seat_rules();

-- What an admin is actually paying for. org_seat_usage in schools.sql counts
-- memberships; this counts seats, which is the number on the invoice.
create or replace view public.licence_seat_usage as
  select l.id as licence_id,
         l.org_id,
         o.name as org_name,
         l.plan_code,
         l.seats_purchased,
         count(s.id) filter (where s.revoked_at is null) as seats_used,
         l.starts_on,
         l.expires_on,
         l.status
    from public.licences l
    join public.orgs o on o.id = l.org_id
    left join public.licence_seats s on s.licence_id = l.id
   group by l.id, l.org_id, o.name, l.plan_code, l.seats_purchased,
            l.starts_on, l.expires_on, l.status;

-- ---------------------------------------------------------------------------
-- Does this plan cover this chapter?
--
-- Empty access list means everything, as above. Otherwise the chapter's
-- subject decides, and a null column in the access row is a wildcard for that
-- dimension — so ('cbse', 8, null) is "everything we teach Class 8 CBSE".
-- ---------------------------------------------------------------------------
create or replace function public.licence_covers_chapter(p_plan text, p_chapter text)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select
    not exists (select 1 from public.licence_plan_access a where a.plan_code = p_plan)
    or exists (
      select 1
        from public.licence_plan_access a
        join public.chapters c on c.id = p_chapter
        join public.subjects s on s.id = c.subject_ref
       where a.plan_code = p_plan
         and (a.board is null       or a.board = s.board)
         and (a.class_level is null or a.class_level = s.class_level)
         and (a.subject_id is null  or a.subject_id = s.subject_id)
    );
$$;

grant execute on function public.licence_covers_chapter(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- School invoices
--
-- Separate from public.invoices, which is the parent's receipt: user_id not
-- null, one line, paid by card through Razorpay before it is ever issued. A
-- school invoice is raised BEFORE payment, against a purchase order, with a
-- due date and a state that can be overdue. Forcing both through one table
-- would mean a nullable user_id and a status column the B2C path ignores —
-- and the first bug would be a parent's receipt appearing in an ageing report.
--
-- GST is added here, not extracted. The parent agreed to a price inclusive of
-- tax; a school agrees a per-seat rate and expects tax on top of it, which is
-- what the purchase order says.
-- ---------------------------------------------------------------------------
create table if not exists public.org_invoices (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.orgs on delete cascade,
  licence_id     uuid references public.licences on delete set null,

  -- PP/S/2026-27/000123 — S for school, a separate series from the parent one.
  number         text not null unique,
  financial_year text not null,

  base_inr       numeric(12,2) not null,
  gst_inr        numeric(12,2) not null,
  total_inr      numeric(12,2) not null,
  gst_rate       numeric(5,2)  not null default 18.00,
  sac_code       text not null default '999293',

  po_number      text,
  status         text not null default 'pending'
                 check (status in ('pending', 'paid', 'overdue', 'void')),
  issued_on      date not null default current_date,
  due_on         date,
  paid_at        timestamptz,
  payment_ref    text,
  created_at     timestamptz not null default now()
);

create index if not exists org_invoices_org_idx
  on public.org_invoices (org_id, issued_on desc);

-- Its own sequence. Sharing invoice_seq would leave gaps in both series, and a
-- gapless per-series number is the thing the auditor actually checks.
create sequence if not exists public.org_invoice_seq;

create or replace function public.issue_org_invoice(
  p_org uuid,
  p_licence uuid,
  p_base_inr numeric,
  p_po text default null,
  p_due_days int default 30
)
returns public.org_invoices
language plpgsql
security definer set search_path = public
as $$
declare
  v_row public.org_invoices;
  v_fy text := public.financial_year();
  v_gst numeric(12,2);
begin
  v_gst := round(p_base_inr * 0.18, 2);

  insert into public.org_invoices (
    org_id, licence_id, number, financial_year,
    base_inr, gst_inr, total_inr, po_number, due_on
  )
  values (
    p_org, p_licence,
    'PP/S/' || v_fy || '/' || lpad(nextval('public.org_invoice_seq')::text, 6, '0'),
    v_fy, p_base_inr, v_gst, p_base_inr + v_gst, p_po,
    current_date + make_interval(days => p_due_days)
  )
  returning * into v_row;

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row-level security
--
-- Prices and purchase orders are the customer's commercial terms. An org admin
-- sees their own; a student sees whether they hold a seat and nothing else,
-- because "am I locked out or is the school" is a question worth answering on
-- the screen rather than on the phone.
-- ---------------------------------------------------------------------------
alter table public.licence_plans       enable row level security;
alter table public.licence_plan_access enable row level security;
alter table public.licences            enable row level security;
alter table public.licence_seats       enable row level security;
alter table public.org_invoices        enable row level security;

drop policy if exists "plans are readable" on public.licence_plans;
create policy "plans are readable" on public.licence_plans
  for select to authenticated using (is_active);

drop policy if exists "plan access is readable" on public.licence_plan_access;
create policy "plan access is readable" on public.licence_plan_access
  for select to authenticated using (true);

drop policy if exists "org admins can see their licences" on public.licences;
create policy "org admins can see their licences" on public.licences
  for select using (public.is_org_admin(org_id));

drop policy if exists "students can see their own seat" on public.licence_seats;
create policy "students can see their own seat" on public.licence_seats
  for select using (
    student_id = auth.uid() or public.is_org_admin(org_id)
  );

drop policy if exists "org admins can see their invoices" on public.org_invoices;
create policy "org admins can see their invoices" on public.org_invoices
  for select using (public.is_org_admin(org_id));

-- ---------------------------------------------------------------------------
-- Access, extended once more
--
-- Identical to the version in tenancy.sql plus one branch: a student holding a
-- live seat on a live licence, if the plan covers the chapter.
--
-- Note what is NOT here. There is no rule that a member of an org WITHOUT a
-- seat is denied — the legacy branch below still lets every member of an org
-- with a future expires_at in. Making seats mandatory is a one-line change
-- (delete the last branch) and it must not happen on the same day as this
-- migration: every existing org has zero seat rows, so it would lock out every
-- school at once, and the symptom would be indistinguishable from an outage.
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
    -- A seat on a live licence, for content the plan covers.
    or exists (
      select 1
        from public.licence_seats ls
        join public.licences l on l.id = ls.licence_id
       where ls.student_id = p_user
         and ls.revoked_at is null
         and l.status = 'active'
         and public.licence_is_live(l.starts_on, l.expires_on)
         and public.licence_covers_chapter(l.plan_code, p_chapter)
    )
    -- Legacy: a seat count and an expiry date on the org itself.
    --
    -- `o.expires_at is not null` is new, and it is a fix rather than a
    -- tightening. licence_is_live treats a null expiry as "never expires",
    -- which is right for licence_starts_on — an org created before that column
    -- existed has already started — and wrong at this end: the admin console
    -- writes `expires_at: body.expiresOn ?? null`, so an org onboarded without
    -- a date typed into the form was granting every member of that school
    -- permanent free access to the entire base curriculum, with nothing on any
    -- screen saying so. A sold licence always has an end date. One that does
    -- not is an org that was set up carelessly, and the safe reading of that
    -- is "not yet paid for", not "paid for forever".
    or exists (
      select 1
        from public.org_members m
        join public.orgs o on o.id = m.org_id
       where m.user_id = p_user
         and o.expires_at is not null
         and public.licence_is_live(o.licence_starts_on, o.expires_at)
    );
$$;

grant execute on function public.can_access_chapter(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Backfill — READ THIS BEFORE RUNNING IT
--
-- Turns each org's four columns into one licence row so that the new path and
-- the old one describe the same deal. It does NOT assign seats: which children
-- hold them is a decision the school makes, and inventing it here would fill
-- every licence to its limit with whoever happened to sign up first.
--
-- Commented out because a migration that silently creates commercial records
-- is one nobody can audit afterwards. Run it deliberately, once.
-- ---------------------------------------------------------------------------
-- insert into public.licences (org_id, plan_code, seats_purchased, price_per_seat_inr,
--                              starts_on, expires_on, status)
--   select o.id,
--          case when o.can_author then 'school-premium' else 'school-standard' end,
--          o.seats,
--          case when o.seats > 0 then round(o.licence_inr / o.seats, 2) end,
--          coalesce(o.licence_starts_on, o.created_at::date),
--          o.expires_at,
--          case when o.expires_at >= current_date then 'active' else 'expired' end
--     from public.orgs o
--    where o.expires_at is not null
--      and not exists (select 1 from public.licences l where l.org_id = o.id);
