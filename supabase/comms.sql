-- PaperPath — announcements, notifications and the audit trail
--
-- Run after tenancy.sql (is_org_admin, my_org_ids) and after compliance.sql,
-- whose retention job this file deliberately does not modify — see the purge
-- function at the bottom.
--
-- ---------------------------------------------------------------------------
-- THE ONE THAT SELLS THE DEAL
--
-- audit_logs. Every other table here is convenience; this is the one a school's
-- IT head asks about in the second meeting, and "we log to the application
-- console" is the answer that ends it. What happened to a child's record, who
-- did it, and when — with the before and after, because "updated student" is
-- not an audit trail, it is a timestamp.
--
-- It is also the table with the sharpest conflict against everything else in
-- this repository. compliance.sql erases personal data on request; an audit log
-- exists precisely so that things cannot be quietly removed. The resolution is
-- at the bottom of this file and it is a decision, not a default.
-- ---------------------------------------------------------------------------

-- Run in the right order? The announcements trigger below calls
-- assert_row_org, which schoolops.sql defines.
do $$
begin
  if to_regprocedure('public.assert_row_org()') is null then
    raise exception 'supabase/schoolops.sql has not been run'
      using hint = 'Paste supabase/all.sql — every migration, already in dependency order.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Announcements
--
-- org_id null is a platform-wide notice from the vendor. Anything else is the
-- school talking to its own people, optionally to one section.
-- ---------------------------------------------------------------------------
create table if not exists public.announcements (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid references public.orgs on delete cascade,
  section_id uuid references public.sections on delete cascade,
  created_by uuid references auth.users on delete set null,
  title      text not null,
  body       text not null,
  audience   text not null default 'all'
             check (audience in ('all', 'students', 'teachers', 'parents', 'section')),
  publish_at timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  -- A section announcement without a section is addressed to nobody, and shows
  -- up as a notice that silently reaches no one.
  check (audience <> 'section' or section_id is not null)
);

create index if not exists announcements_org_idx
  on public.announcements (org_id, publish_at desc);

-- A school announcing into another school's classroom. org_id is what the read
-- policy filters on and section_id is what it delivers to, so a row where the
-- two disagree is addressed to the wrong children. Skipped when org_id is null,
-- which is the vendor's platform-wide notice.
drop trigger if exists announcements_org on public.announcements;
create trigger announcements_org
  before insert or update of section_id, org_id on public.announcements
  for each row execute function public.assert_row_org('section_id', 'sections');

-- ---------------------------------------------------------------------------
-- Notifications
--
-- The in-app bell. Not the messaging layer: lib/messaging/send.ts sends
-- WhatsApp to a consent-verified number and is governed by the consent rules
-- in compliance.sql. This is a row a signed-in person sees when they open the
-- app, which needs no consent because they came looking.
--
-- Deliberately without a body long enough to hold a transcript. A notification
-- that quotes what a child asked the tutor would put it on a parent's lock
-- screen, and lib/safety/escalate.ts already argues that case at length.
-- ---------------------------------------------------------------------------
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users on delete cascade,
  org_id     uuid references public.orgs on delete cascade,
  kind       text not null,                      -- assignment_due | test_result | announcement | licence
  title      text not null,
  body       text,
  link       text,                               -- in-app path, e.g. /tutor/t-8-1-2
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_idx
  on public.notifications (user_id, created_at desc) where read_at is null;

-- ---------------------------------------------------------------------------
-- The audit trail
--
-- actor_role is copied in rather than joined out, because the answer wanted is
-- "what were they when they did it". A teacher who later becomes an org admin
-- must not retroactively have been one in the log.
--
-- entity_id is text, not uuid: half the things worth logging are keyed by the
-- curriculum's text ids (chapters, topics, bank questions) and half by uuid.
-- One column that holds both beats two that are each null half the time.
-- ---------------------------------------------------------------------------
create table if not exists public.audit_logs (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid references public.orgs on delete set null,
  actor_id    uuid references auth.users on delete set null,
  actor_role  text,
  action      text not null,                     -- 'roster.import', 'licence.assign_seat'
  entity_type text,
  entity_id   text,
  before      jsonb,
  after       jsonb,
  ip_address  text,
  user_agent  text,
  created_at  timestamptz not null default now()
);

create index if not exists audit_logs_org_idx
  on public.audit_logs (org_id, created_at desc);

create index if not exists audit_logs_entity_idx
  on public.audit_logs (entity_type, entity_id);

-- One way in, so that every call site records the same fields and a later
-- "who changed this" query does not depend on which route wrote the row.
create or replace function public.record_audit(
  p_org uuid,
  p_actor uuid,
  p_actor_role text,
  p_action text,
  p_entity_type text default null,
  p_entity_id text default null,
  p_before jsonb default null,
  p_after jsonb default null,
  p_ip text default null,
  p_user_agent text default null
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.audit_logs (
    org_id, actor_id, actor_role, action, entity_type, entity_id,
    before, after, ip_address, user_agent
  )
  values (
    p_org, p_actor, p_actor_role, p_action, p_entity_type, p_entity_id,
    p_before, p_after, p_ip, p_user_agent
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.announcements enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_logs    enable row level security;

-- Published, unexpired, and addressed to an org the reader belongs to — or to
-- everybody. Audience is not filtered here: which role a notice is for is a
-- display concern, and a policy that got it wrong would hide a school closure
-- from the people it was closing on.
drop policy if exists "announcements are readable when live" on public.announcements;
create policy "announcements are readable when live" on public.announcements
  for select to authenticated using (
    publish_at <= now()
    and (expires_at is null or expires_at > now())
    and (org_id is null or org_id = any(public.my_org_ids()))
    and (
      section_id is null
      or exists (
        select 1 from public.section_students ss
         where ss.section_id = announcements.section_id and ss.student_id = auth.uid()
      )
      or public.teaches_section(section_id)
      or public.is_org_admin(org_id)
    )
  );

drop policy if exists "notifications are readable by their owner" on public.notifications;
create policy "notifications are readable by their owner" on public.notifications
  for select using (user_id = auth.uid());

-- Marking as read is the only write, and it is the only column the grant
-- allows — the policy limits the rows, the grant limits the columns, and
-- without the second one "mark as read" is also "rewrite the message".
drop policy if exists "owners may mark notifications read" on public.notifications;
create policy "owners may mark notifications read" on public.notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;

-- An org admin reads their own school's trail. Nobody reads the vendor's rows
-- (org_id null) from a browser, and there is no insert policy at all: the log
-- is written by the server with the service-role key, and a log a client can
-- append to is a log that can be flooded with plausible entries.
drop policy if exists "org admins can read their audit trail" on public.audit_logs;
create policy "org admins can read their audit trail" on public.audit_logs
  for select using (org_id is not null and public.is_org_admin(org_id));

-- ---------------------------------------------------------------------------
-- Retention
--
-- A separate function rather than another branch inside purge_expired_data,
-- which compliance.sql owns. Redefining that function here would mean keeping
-- two copies of its body in step, and the copy that lost the race would
-- silently stop deleting whatever the other one had learned to delete.
--
-- Add it to the nightly job in cron.sql alongside the existing purge.
--
-- ---------------------------------------------------------------------------
-- WHAT THE AUDIT LOG KEEPS WHEN A CHILD IS ERASED
--
-- Notifications go: they are copies of things said elsewhere, they name the
-- child, and nothing depends on them after they are read.
--
-- Audit rows stay, with the payload emptied. Under the DPDP Act a record kept
-- to demonstrate compliance with the law is a legitimate purpose to retain,
-- and an audit trail with holes cut in it is not evidence of anything — but
-- `before`/`after` on a student row is the child's data sitting inside the
-- thing that was supposed to protect them, so it is the payload that is
-- dropped and the fact of the action that survives. Who did what and when
-- remains provable; what the row said does not.
--
-- Two years, matching the retention window compliance.sql already applies to
-- learning data.
-- ---------------------------------------------------------------------------
create or replace function public.purge_comms()
returns table (notifications_deleted int, audit_rows_redacted int)
language plpgsql
security definer set search_path = public
as $$
declare
  v_notifications int;
  v_audit int;
begin
  delete from public.notifications
   where created_at < now() - interval '180 days';
  get diagnostics v_notifications = row_count;

  update public.audit_logs
     set before = null, after = null, ip_address = null, user_agent = null
   where created_at < now() - interval '2 years'
     and (before is not null or after is not null
          or ip_address is not null or user_agent is not null);
  get diagnostics v_audit = row_count;

  return query select v_notifications, v_audit;
end;
$$;

-- Erasure, on request, for one person. Called by the erasure job in
-- compliance.sql's terms: the notifications go, the audit rows keep the fact
-- and lose the content, and actor_id is left in place because a member of
-- staff who performed an action is not the subject of that action.
create or replace function public.forget_user_comms(p_user uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  delete from public.notifications where user_id = p_user;

  -- Two passes, because a child appears in this table in two ways.
  --
  -- Directly, as the subject of an action: entity_type 'user'. That was the
  -- only case this function handled, and it is the smaller one.
  --
  -- And indirectly, inside somebody else's payload — 'roster.import' with the
  -- imported ids in `after`, 'licence.assign_seat' with the student in the
  -- body. Those rows are not about the child by entity_type and were surviving
  -- an erasure request with the child's id still in them, which is precisely
  -- the data the request was made about.
  --
  -- The containment test is on the id, so it cannot find an email address that
  -- was written into a payload without one. Payloads should carry ids; this
  -- catches what they do carry, and the honest limit is written down here
  -- rather than assumed away.
  update public.audit_logs
     set before = null, after = null, ip_address = null, user_agent = null
   where (entity_type = 'user' and entity_id = p_user::text)
      or before::text like '%' || p_user::text || '%'
      or after::text  like '%' || p_user::text || '%';
end;
$$;
