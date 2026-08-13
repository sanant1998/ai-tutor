-- ---------------------------------------------------------------------------
-- Three roles, and a column that finally says so.
--
-- Run after compliance.sql, which is where profiles.role was added.
--
-- ---------------------------------------------------------------------------
-- WHAT WAS WRONG WITH IT
--
-- compliance.sql created the column like this:
--
--   add column if not exists role text not null default 'student';  -- student | parent
--
-- No CHECK. The comment said two values; the application wrote three, because
-- scripts/seed-accounts.ts and app/api/consent/adult/route.ts both write
-- 'teacher'. So the set of roles that actually existed was whatever any code
-- path had ever happened to store, and the one place that branched on it —
-- app/parent-consent/page.tsx — was matching string literals against a column
-- with no agreed vocabulary.
--
-- A typo in any writer ('Teacher', 'techer') would not have failed. It would
-- have produced an account that silently fell through every branch to the
-- student default, which is the least alarming and least debuggable outcome
-- available.
--
-- ---------------------------------------------------------------------------
-- WHY 'parent' IS BEING REMOVED RATHER THAN ADDED TO THE CHECK
--
-- A parent has never needed an account. app/api/consent/grant/route.ts is
-- explicit about it at the top: the parent is a person holding a phone that
-- received a link, and requiring them to register first would mean the consent
-- never arrives and the child stays locked out. Both parent-facing things the
-- product does already work without one:
--
--   consent        an OTP to the number the student named
--   weekly report  WhatsApp, keyed off the phone stored on the consent row,
--                  not off any parent account
--
-- So the role bought a login and a dashboard for people who mostly never
-- signed in twice, and a fourth branch everywhere that asks what kind of
-- account this is. Rows that still say 'parent' become students: that is the
-- least-privileged value, and an adult with a student account sees an empty
-- revision plan rather than anything they should not.
--
-- ---------------------------------------------------------------------------
-- SUPER ADMIN IS NOT IN HERE, ON PURPOSE
--
-- It stays in ADMIN_EMAILS. The reasoning is in lib/admin/guard.ts and it has
-- not changed: a super admin can rewrite what every student in the product is
-- taught, and a role column granting that is one bad UPDATE away from being
-- self-granted. An environment allowlist cannot be reached from inside the
-- database at all.
-- ---------------------------------------------------------------------------

-- The migration first, then the constraint. The other order fails on any
-- database that has a parent on it, which is every database that has been
-- used.
--
-- ---------------------------------------------------------------------------
-- WHAT THE ROW SAID BEFORE, KEPT
--
-- The UPDATE below is the only irreversible statement in any of these
-- migrations: it runs against live rows, outside any transaction anybody can
-- roll back, and afterwards nothing in the database remembers that an account
-- was ever a parent. The project this was written against has one such row.
--
-- That matters because the conversion is a judgement, not a fact. 'student' is
-- chosen as the least-privileged landing place, not because the person IS a
-- student — and the first question anyone asks afterwards is "which accounts
-- did this touch?". Without this column the answer is gone, and the only
-- remaining copy is a screenshot in a chat log.
--
-- One nullable column, written once, readable by the account it belongs to and
-- writable by nobody: the grants at the bottom of this file do not include it.
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists legacy_role text;

comment on column public.profiles.legacy_role is
  'What role said before roles.sql closed the set to student|teacher. Null for every account created since.';

update public.profiles
   set legacy_role = role
 where role not in ('student', 'teacher')
   and legacy_role is null;

update public.profiles set role = 'student' where role not in ('student', 'teacher');

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in ('student', 'teacher'));

comment on column public.profiles.role is
  'student | teacher. Super admin is ADMIN_EMAILS in the environment, never a row here — see lib/admin/guard.ts.';

-- Belt and braces on top of compliance.sql, which already does
-- `revoke update on public.profiles` and grants back only first_name,
-- last_name and language. Restated because the whole role model rests on it:
-- if a future migration re-grants update on the table, a student can make
-- themselves a teacher and read a class's marks.
revoke update on public.profiles from authenticated;
grant update (first_name, last_name, language) on public.profiles to authenticated;

-- A teacher is a teacher OF an organisation. profiles.role says what kind of
-- screen they land on; org_members.role says which classes they can see, and
-- the two have to agree or a teacher signs in to a teacher shell with nothing
-- in it. Nothing enforces that automatically — a teacher with no org is a
-- legitimate state during onboarding — so this is the query to run when
-- somebody reports an empty class list:
--
--   select p.id, p.email, p.role, m.org_id, m.role as org_role
--     from public.profiles p
--     left join public.org_members m on m.user_id = p.id
--    where p.role = 'teacher' and m.user_id is null;
