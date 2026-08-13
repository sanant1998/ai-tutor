-- Behavioural check of the school-operations migrations, as real roles.
--
-- ---------------------------------------------------------------------------
-- RUN IT IN THE SUPABASE SQL EDITOR. IT LEAVES NOTHING BEHIND.
--
-- The whole file is one transaction and the last statement is ROLLBACK, so the
-- fixtures below -- a school, seven users, a licence, an invoice -- exist only
-- for the length of the run. The last grid is the result: one row per
-- assertion, failures first, with the failure count repeated on each row.
--
-- The one thing a rollback cannot undo is a sequence: nextval is deliberately
-- non-transactional, so issuing three test invoices would otherwise burn three
-- numbers out of a series that is supposed to be gapless for an auditor. The
-- value is captured at the top and restored at the bottom.
--
-- No psql meta-commands anywhere: those are a psql feature and the SQL editor
-- is not psql.
--
-- ---------------------------------------------------------------------------
-- NOTE: session-level SET, not SET LOCAL. psql wraps each statement in its own
-- implicit transaction, so SET LOCAL is discarded before the next statement and
-- every assertion silently runs as the owner — which bypasses RLS and turns the
-- whole suite into a set of false passes.

begin;

-- Restored at the bottom. nextval ignores rollback.
create temporary table pp_seq_backup as
  select last_value, is_called from public.org_invoice_seq;

-- Assertions land in a table, not in RAISE NOTICE.
--
-- The Supabase SQL editor shows the result grid of the last statement and
-- discards client messages, so a suite that reports through notices reports
-- nothing at all there — it just ends, looking like it worked. The notice is
-- kept as well, for anyone running this through psql.
create temporary table pp_results (
  n     serial primary key,
  label text,
  ok    boolean
);

-- SECURITY DEFINER, and in public rather than pg_temp.
--
-- Most assertions run under `set role authenticated`, and that role owns
-- nothing here: it cannot write to a temp table created by postgres, so an
-- ordinary helper would fail with a permission error on the first assertion
-- inside a role switch — which is most of them. Running as the owner side-
-- steps the question entirely, and the function is dropped by the rollback
-- like everything else.
create or replace function public.pp_t(label text, ok boolean) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into pg_temp.pp_results (label, ok) values (label, ok);
  raise notice '%  %', case when ok then 'PASS' else 'FAIL' end, label;
end $$;

-- ---------------------------------------------------------------------------
-- Fixtures, as the owner
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'admin@school.test'),
  ('22222222-2222-2222-2222-222222222222', 'maths@school.test'),
  ('33333333-3333-3333-3333-333333333333', 'other@school.test'),
  ('44444444-4444-4444-4444-444444444444', 's1@school.test'),
  ('55555555-5555-5555-5555-555555555555', 's2@school.test'),
  ('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', 's3@school.test'),
  ('66666666-6666-6666-6666-666666666666', 'outsider@elsewhere.test');

-- A board of its own, so nothing here can collide with the curriculum a
-- real project already has seeded. subjects is unique on
-- (board, class_level, subject_id, language), so a fixture claiming to be
-- cbse/8/maths fails on any database where that row exists — which is every
-- database this is worth running against.
insert into public.boards (code, name, is_active)
  values ('ppqa', 'Verification fixtures', false);

insert into public.orgs (id, name, seats, expires_at)
  values ('77777777-7777-7777-7777-777777777777', 'Test School', 100, null);

-- The board the school teaches. Set here rather than in the insert above so
-- that the null-expiry assertions further down still exercise an org whose
-- other columns are untouched.
update public.orgs set board = 'ppqa'
 where id = '77777777-7777-7777-7777-777777777777';

insert into public.org_members (org_id, user_id, role) values
  ('77777777-7777-7777-7777-777777777777', '11111111-1111-1111-1111-111111111111', 'org_admin'),
  ('77777777-7777-7777-7777-777777777777', '22222222-2222-2222-2222-222222222222', 'teacher'),
  ('77777777-7777-7777-7777-777777777777', '33333333-3333-3333-3333-333333333333', 'teacher'),
  ('77777777-7777-7777-7777-777777777777', '44444444-4444-4444-4444-444444444444', 'student'),
  ('77777777-7777-7777-7777-777777777777', '55555555-5555-5555-5555-555555555555', 'student'),
  ('77777777-7777-7777-7777-777777777777', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', 'student');

insert into public.academic_years (id, org_id, label, starts_on, ends_on, is_current)
  values ('88888888-8888-8888-8888-888888888888',
          '77777777-7777-7777-7777-777777777777', '2026-27', '2026-04-01', '2027-03-31', true);

insert into public.sections (id, org_id, name, class_level, academic_year_id) values
  ('99999999-9999-9999-9999-999999999999', '77777777-7777-7777-7777-777777777777',
   'Class 8-A', 8, '88888888-8888-8888-8888-888888888888'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '77777777-7777-7777-7777-777777777777',
   'Class 9-A', 9, '88888888-8888-8888-8888-888888888888');

insert into public.section_students (section_id, student_id) values
  ('99999999-9999-9999-9999-999999999999', '44444444-4444-4444-4444-444444444444'),
  ('99999999-9999-9999-9999-999999999999', '55555555-5555-5555-5555-555555555555');

insert into public.subjects (id, board, class_level, subject_id, name) values
  ('ppqa:8:maths',   'ppqa', 8, 'maths',   'Mathematics'),
  ('ppqa:8:science', 'ppqa', 8, 'science', 'Science');

insert into public.chapters (id, subject_ref, chapter_no, title, is_free) values
  ('ppqa:8:maths:1',   'ppqa:8:maths',   1, 'Rational Numbers', false),
  ('ppqa:8:science:1', 'ppqa:8:science', 1, 'Crop Production',  false);

insert into public.topics (id, chapter_ref, topic_no, title) values
  ('ppqa:8:maths:1:1', 'ppqa:8:maths:1', 1, 'Additive inverse');

insert into public.student_records (org_id, student_id, admission_number, roll_number, section_id) values
  ('77777777-7777-7777-7777-777777777777', '44444444-4444-4444-4444-444444444444',
   'ADM-001', '10', '99999999-9999-9999-9999-999999999999'),
  ('77777777-7777-7777-7777-777777777777', '55555555-5555-5555-5555-555555555555',
   'ADM-002', '2',  '99999999-9999-9999-9999-999999999999');

insert into public.teacher_assignments (org_id, teacher_id, section_id, subject_ref, academic_year_id)
  values ('77777777-7777-7777-7777-777777777777', '22222222-2222-2222-2222-222222222222',
          '99999999-9999-9999-9999-999999999999', 'ppqa:8:maths',
          '88888888-8888-8888-8888-888888888888');


do $$ begin raise notice '=== 1. Teacher scope comes from the assignment ==='; end $$;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
set role authenticated;
select public.pp_t('assigned subject teacher teaches 8-A',
       public.teaches_section('99999999-9999-9999-9999-999999999999'));
select public.pp_t('...and does NOT teach 9-A',
       not public.teaches_section('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'));

reset role;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
set role authenticated;
select public.pp_t('an unassigned teacher in the same org teaches nothing',
       not public.teaches_section('99999999-9999-9999-9999-999999999999'));

reset role;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set role authenticated;
select public.pp_t('the org admin still sees every section',
       public.teaches_section('99999999-9999-9999-9999-999999999999'));
reset role;


do $$ begin raise notice '=== 2. The roster ==='; end $$;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
set role authenticated;
select public.pp_t('the teacher gets both children',
       (select count(*) from public.section_roster('99999999-9999-9999-9999-999999999999')) = 2);
select public.pp_t('roll 2 sorts before roll 10',
       (select admission_number from public.section_roster('99999999-9999-9999-9999-999999999999')
         limit 1) = 'ADM-002');

reset role;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
set role authenticated;
do $$
begin
  perform * from public.section_roster('99999999-9999-9999-9999-999999999999');
  perform public.pp_t('an unassigned teacher is refused the roster', false);
exception when others then
  perform public.pp_t('an unassigned teacher is refused the roster', sqlerrm = 'not your section');
end $$;
reset role;
reset request.jwt.claim.sub;


do $$ begin raise notice '=== 3. Seats ==='; end $$;
insert into public.licences (id, org_id, plan_code, seats_purchased, starts_on, expires_on)
  values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '77777777-7777-7777-7777-777777777777',
          'school-standard', 2, current_date - 1, current_date + 300);

insert into public.licence_seats (licence_id, org_id, student_id) values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '77777777-7777-7777-7777-777777777777',
   '44444444-4444-4444-4444-444444444444'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '77777777-7777-7777-7777-777777777777',
   '55555555-5555-5555-5555-555555555555');

do $$
begin
  insert into public.licence_seats (licence_id, org_id, student_id)
    values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '77777777-7777-7777-7777-777777777777',
            'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1');
  perform public.pp_t('a third seat on a two-seat licence is refused', false);
exception when others then
  perform public.pp_t('a third seat on a two-seat licence is refused',
                    sqlerrm like 'licence has 2 seats%');
end $$;

update public.licence_seats set revoked_at = now()
 where student_id = '55555555-5555-5555-5555-555555555555';

do $$
begin
  insert into public.licence_seats (licence_id, org_id, student_id)
    values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '77777777-7777-7777-7777-777777777777',
            'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1');
  perform public.pp_t('revoking a seat frees it', true);
exception when others then
  perform public.pp_t('revoking a seat frees it: ' || sqlerrm, false);
end $$;

select public.pp_t('licence_seat_usage counts live seats only',
       (select seats_used from public.licence_seat_usage
         where licence_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') = 2);


do $$ begin raise notice '=== 4. What a seat unlocks ==='; end $$;
select public.pp_t('with no plan access rows, the plan covers everything',
       public.licence_covers_chapter('school-standard', 'ppqa:8:science:1'));

insert into public.licence_plan_access (plan_code, board, class_level, subject_id)
  values ('school-standard', 'ppqa', 8, 'maths');

select public.pp_t('once restricted, maths is covered',
       public.licence_covers_chapter('school-standard', 'ppqa:8:maths:1'));
select public.pp_t('...and science is not',
       not public.licence_covers_chapter('school-standard', 'ppqa:8:science:1'));

select public.pp_t('a seat holder can open the covered chapter',
       public.can_access_chapter('44444444-4444-4444-4444-444444444444', 'ppqa:8:maths:1'));

-- The org's expires_at is null here, which is exactly the case the fix in
-- licensing.sql addresses: before it, this returned true and the plan's
-- restriction meant nothing.
select public.pp_t('an org with NO expiry date grants nothing (the null-expiry fix)',
       not public.can_access_chapter('44444444-4444-4444-4444-444444444444', 'ppqa:8:science:1'));
select public.pp_t('a stranger with no seat and no subscription cannot open it',
       not public.can_access_chapter('66666666-6666-6666-6666-666666666666', 'ppqa:8:maths:1'));

-- The legacy path must keep working when the date IS set, or every existing
-- pilot goes dark on the day this migration runs.
update public.orgs set expires_at = current_date + 30
 where id = '77777777-7777-7777-7777-777777777777';
select public.pp_t('a real expiry date still grants access (nobody is locked out)',
       public.can_access_chapter('55555555-5555-5555-5555-555555555555', 'ppqa:8:science:1'));

update public.orgs set expires_at = current_date - 1
 where id = '77777777-7777-7777-7777-777777777777';
select public.pp_t('an expired org loses the base curriculum',
       not public.can_access_chapter('55555555-5555-5555-5555-555555555555', 'ppqa:8:science:1'));
select public.pp_t('...but a live seat still works through it',
       public.can_access_chapter('44444444-4444-4444-4444-444444444444', 'ppqa:8:maths:1'));

update public.orgs set expires_at = null
 where id = '77777777-7777-7777-7777-777777777777';


do $$ begin raise notice '=== 5. School invoices ==='; end $$;
select public.pp_t('GST is added on top, not extracted',
       (select total_inr = 1180.00 and gst_inr = 180.00
          from public.issue_org_invoice('77777777-7777-7777-7777-777777777777',
                                        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 1000.00, 'PO-9')));
select public.pp_t('the school series is separate from the parent one',
       (select number like 'PP/S/%/000002' from public.issue_org_invoice(
          '77777777-7777-7777-7777-777777777777', null, 500.00)));
select public.pp_t('the due date lands 30 days out by default',
       (select due_on = current_date + 30 from public.org_invoices
         where po_number = 'PO-9'));


do $$ begin raise notice '=== 6. Homework: a student cannot mark their own ==='; end $$;
insert into public.assignments (id, section_id, chapter_ref, due_on, max_marks)
  values ('dddddddd-dddd-dddd-dddd-dddddddddddd', '99999999-9999-9999-9999-999999999999',
          'ppqa:8:maths:1', current_date + 7, 20);

set request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
set role authenticated;

do $$
begin
  insert into public.assignment_submissions (assignment_id, student_id, content, submitted_at, status)
    values ('dddddddd-dddd-dddd-dddd-dddddddddddd', '44444444-4444-4444-4444-444444444444',
            'my answer', now(), 'submitted');
  perform public.pp_t('a student in the section may submit', true);
exception when others then
  perform public.pp_t('a student in the section may submit: ' || sqlerrm, false);
end $$;

do $$
begin
  insert into public.assignment_submissions (assignment_id, student_id, content)
    values ('dddddddd-dddd-dddd-dddd-dddddddddddd', '66666666-6666-6666-6666-666666666666', 'x');
  perform public.pp_t('a student cannot submit as somebody else', false);
exception when others then
  perform public.pp_t('a student cannot submit as somebody else', true);
end $$;

do $$
declare v_rows int;
begin
  update public.assignment_submissions set content = 'edited'
   where student_id = '44444444-4444-4444-4444-444444444444';
  get diagnostics v_rows = row_count;
  perform public.pp_t('a student may edit their own unmarked work', v_rows = 1);
exception when others then
  perform public.pp_t('a student may edit their own unmarked work: ' || sqlerrm, false);
end $$;

do $$
begin
  update public.assignment_submissions set marks_obtained = 20
   where student_id = '44444444-4444-4444-4444-444444444444';
  perform public.pp_t('a student cannot award themselves marks', false);
exception when insufficient_privilege then
  perform public.pp_t('a student cannot award themselves marks', true);
end $$;

select public.pp_t('a student reads their own submission',
       (select count(*) from public.assignment_submissions) = 1);

reset role;
set request.jwt.claim.sub = '55555555-5555-5555-5555-555555555555';
set role authenticated;
select public.pp_t('a classmate cannot read the submission',
       (select count(*) from public.assignment_submissions) = 0);

reset role;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
set role authenticated;
select public.pp_t('the teacher of the section can read it',
       (select count(*) from public.assignment_submissions) = 1);

reset role;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
set role authenticated;
select public.pp_t('a teacher who does not teach the section cannot',
       (select count(*) from public.assignment_submissions) = 0);
reset role;
reset request.jwt.claim.sub;

update public.assignment_submissions
   set marks_obtained = 18, graded_at = now(), status = 'graded',
       graded_by = '22222222-2222-2222-2222-222222222222'
 where student_id = '44444444-4444-4444-4444-444444444444';

set request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
set role authenticated;
do $$
declare v_rows int;
begin
  update public.assignment_submissions set content = 'sneaky edit'
   where student_id = '44444444-4444-4444-4444-444444444444';
  get diagnostics v_rows = row_count;
  perform public.pp_t('marked work can no longer be edited', v_rows = 0);
end $$;
reset role;
reset request.jwt.claim.sub;


do $$ begin raise notice '=== 7. Tests ==='; end $$;
insert into public.bank_questions (id, topic_ref, qtype, level, stem, correct, solution)
  values ('ppqa-q-1', 'ppqa:8:maths:1:1', 'mcq', 'L2', 'What is the additive inverse of 3?',
          '["B"]'::jsonb, 'It is -3.');

insert into public.tests (id, org_id, section_id, chapter_ref, title, kind, status)
  values ('cccccccc-cccc-cccc-cccc-cccccccccccc', '77777777-7777-7777-7777-777777777777',
          '99999999-9999-9999-9999-999999999999', 'ppqa:8:maths:1', 'Chapter 1 quiz',
          'quiz', 'published');

insert into public.tests (id, org_id, section_id, title, kind, status)
  values ('cdcdcdcd-cdcd-cdcd-cdcd-cdcdcdcdcdcd', '77777777-7777-7777-7777-777777777777',
          '99999999-9999-9999-9999-999999999999', 'Tomorrow''s paper', 'quiz', 'draft');

insert into public.test_questions (test_id, question_ref, sort_order, marks)
  values ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'ppqa-q-1', 1, 2);

insert into public.test_attempts (id, test_id, student_id, submitted_at, score, max_score, status)
  values ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'cccccccc-cccc-cccc-cccc-cccccccccccc',
          '44444444-4444-4444-4444-444444444444', now(), 1, 2, 'evaluated');

insert into public.test_attempts (id, test_id, student_id, attempt_no, status)
  values ('efefefef-efef-efef-efef-efefefefefef', 'cccccccc-cccc-cccc-cccc-cccccccccccc',
          '55555555-5555-5555-5555-555555555555', 1, 'in_progress');

insert into public.test_answers (attempt_id, question_ref, given, is_correct, marks_awarded, misconception_id) values
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'ppqa-q-1', '["A"]'::jsonb, false, 0, 'm1'),
  ('efefefef-efef-efef-efef-efefefefefef', 'ppqa-q-1', '["A"]'::jsonb, false, 0, 'm1');

set request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
set role authenticated;
select public.pp_t('a student sees the published test and not the draft',
       (select count(*) from public.tests
         where section_id = '99999999-9999-9999-9999-999999999999') = 1);
select public.pp_t('a student cannot read the paper (test_questions has no policy)',
       (select count(*) from public.test_questions) = 0);
select public.pp_t('a student sees their own answers once submitted',
       (select count(*) from public.test_answers) = 1);

reset role;
set request.jwt.claim.sub = '55555555-5555-5555-5555-555555555555';
set role authenticated;
select public.pp_t('mid-attempt, the marking key is not readable',
       (select count(*) from public.test_answers) = 0);

reset role;
set request.jwt.claim.sub = '66666666-6666-6666-6666-666666666666';
set role authenticated;
select public.pp_t('an outsider sees neither the test nor the answers',
       (select count(*) from public.tests
         where section_id = '99999999-9999-9999-9999-999999999999') = 0
   and (select count(*) from public.test_answers) = 0);

reset role;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
set role authenticated;
select public.pp_t('the teacher gets the results',
       (select count(*) from public.test_results('cccccccc-cccc-cccc-cccc-cccccccccccc')) = 2);
select public.pp_t('the breakdown names the misconception the class holds',
       (select top_misconception from public.test_question_breakdown(
          'cccccccc-cccc-cccc-cccc-cccccccccccc') limit 1) = 'm1');
select public.pp_t('the breakdown counts the attempts',
       (select attempted from public.test_question_breakdown(
          'cccccccc-cccc-cccc-cccc-cccccccccccc') limit 1) = 2);

reset role;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
set role authenticated;
do $$
begin
  perform * from public.test_results('cccccccc-cccc-cccc-cccc-cccccccccccc');
  perform public.pp_t('another teacher is refused the results', false);
exception when others then
  perform public.pp_t('another teacher is refused the results', sqlerrm = 'not your test');
end $$;
reset role;
reset request.jwt.claim.sub;


do $$ begin raise notice '=== 8. Announcements, notifications, audit ==='; end $$;
insert into public.announcements (org_id, section_id, created_by, title, body, audience)
  values ('77777777-7777-7777-7777-777777777777', '99999999-9999-9999-9999-999999999999',
          '11111111-1111-1111-1111-111111111111', 'Test tomorrow', 'Chapter 1', 'section');

insert into public.announcements (org_id, created_by, title, body, publish_at)
  values ('77777777-7777-7777-7777-777777777777', '11111111-1111-1111-1111-111111111111',
          'Next week', 'Not yet', now() + interval '2 days');

insert into public.notifications (user_id, org_id, kind, title)
  values ('44444444-4444-4444-4444-444444444444', '77777777-7777-7777-7777-777777777777',
          'assignment_due', 'Maths homework due');

select public.record_audit('77777777-7777-7777-7777-777777777777',
  '11111111-1111-1111-1111-111111111111', 'org_admin', 'roster.import', 'user',
  '44444444-4444-4444-4444-444444444444', null, '{"rows": 2}'::jsonb, '1.2.3.4', 'test');

set request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
set role authenticated;
select public.pp_t('a student sees the live announcement, not the future one',
       (select count(*) from public.announcements
         where org_id = '77777777-7777-7777-7777-777777777777') = 1);
select public.pp_t('a student sees their own notification',
       (select count(*) from public.notifications) = 1);
select public.pp_t('a student cannot read the audit trail',
       (select count(*) from public.audit_logs) = 0);

do $$
declare v_rows int;
begin
  update public.notifications set read_at = now();
  get diagnostics v_rows = row_count;
  perform public.pp_t('a student may mark their notification read', v_rows = 1);
end $$;

do $$
begin
  update public.notifications set title = 'rewritten';
  perform public.pp_t('a student cannot rewrite the notification', false);
exception when insufficient_privilege then
  perform public.pp_t('a student cannot rewrite the notification', true);
end $$;

reset role;
set request.jwt.claim.sub = '66666666-6666-6666-6666-666666666666';
set role authenticated;
select public.pp_t('an outsider sees no announcement from this school',
       (select count(*) from public.announcements
         where org_id = '77777777-7777-7777-7777-777777777777') = 0);

reset role;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set role authenticated;
select public.pp_t('the org admin reads their own audit trail',
       (select count(*) from public.audit_logs) = 1);
reset role;
reset request.jwt.claim.sub;

do $$
begin
  perform public.forget_user_comms('44444444-4444-4444-4444-444444444444');
  perform public.pp_t('erasure keeps the audit fact and drops the payload',
    (select count(*) from public.audit_logs
      where entity_id = '44444444-4444-4444-4444-444444444444'
        and after is null and ip_address is null) = 1
    and (select count(*) from public.notifications
          where user_id = '44444444-4444-4444-4444-444444444444') = 0);
end $$;


do $$ begin raise notice '=== 9. Promotion ==='; end $$;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set role authenticated;

select public.pp_t('promotion moves both children',
       public.promote_section('99999999-9999-9999-9999-999999999999',
                              'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
                              '88888888-8888-8888-8888-888888888888') = 2);
reset role;

select public.pp_t('8-A is now empty',
       (select count(*) from public.section_students
         where section_id = '99999999-9999-9999-9999-999999999999') = 0);
select public.pp_t('9-A has them',
       (select count(*) from public.section_students
         where section_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') = 2);
select public.pp_t('history records where they came from',
       (select count(*) from public.student_section_history
         where section_id = '99999999-9999-9999-9999-999999999999' and status = 'promoted') = 2);
select public.pp_t('the student record follows them',
       (select count(*) from public.student_records
         where section_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') = 2);

set role authenticated;
select public.pp_t('running it twice is harmless',
       public.promote_section('99999999-9999-9999-9999-999999999999',
                              'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
                              '88888888-8888-8888-8888-888888888888') = 0);
reset role;

reset request.jwt.claim.sub;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
set role authenticated;
do $$
begin
  perform public.promote_section('99999999-9999-9999-9999-999999999999',
                                 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
                                 '88888888-8888-8888-8888-888888888888');
  perform public.pp_t('a teacher cannot promote a class', false);
exception when others then
  perform public.pp_t('a teacher cannot promote a class', sqlerrm = 'not your organisation');
end $$;
reset role;
reset request.jwt.claim.sub;


do $$ begin raise notice '=== 10. Constraints that protect the year ==='; end $$;
do $$
begin
  insert into public.academic_years (org_id, label, starts_on, ends_on, is_current)
    values ('77777777-7777-7777-7777-777777777777', '2027-28', '2027-04-01', '2028-03-31', true);
  perform public.pp_t('an org cannot have two current years', false);
exception when unique_violation then
  perform public.pp_t('an org cannot have two current years', true);
end $$;

do $$
begin
  insert into public.student_records (org_id, student_id, admission_number)
    values ('77777777-7777-7777-7777-777777777777',
            '66666666-6666-6666-6666-666666666666', 'ADM-001');
  perform public.pp_t('admission numbers are unique within a school', false);
exception when unique_violation then
  perform public.pp_t('admission numbers are unique within a school', true);
end $$;

do $$
begin
  insert into public.subjects (id, board, class_level, subject_id, name)
    values ('typo:8:maths', 'cbsee', 8, 'maths', 'Typo');
  perform public.pp_t('a typo in the board is rejected', false);
exception when foreign_key_violation then
  perform public.pp_t('a typo in the board is rejected', true);
end $$;

-- lib/syllabus.ts types ClassLevel as 1..10 and offers all ten, so the grades
-- master has to cover them or the foreign key above rejects Class 3 content
-- the first time anybody authors it.
do $$
begin
  insert into public.subjects (id, board, class_level, subject_id, name)
    values ('ppqa:3:maths', 'ppqa', 3, 'maths', 'Mathematics');
  perform public.pp_t('every class the app offers exists in the grades master', true);
exception when others then
  perform public.pp_t('every class the app offers exists in the grades master: '
                    || sqlerrm, false);
end $$;

do $$
begin
  insert into public.announcements (org_id, created_by, title, body, audience)
    values ('77777777-7777-7777-7777-777777777777',
            '11111111-1111-1111-1111-111111111111', 'x', 'y', 'section');
  perform public.pp_t('a section announcement without a section is rejected', false);
exception when check_violation then
  perform public.pp_t('a section announcement without a section is rejected', true);
end $$;


do $$ begin raise notice '=== 11. Retention ==='; end $$;
select public.pp_t('purge_comms runs and reports',
       (select notifications_deleted >= 0 from public.purge_comms()));

insert into public.import_jobs (org_id, kind, total_rows, failed_rows, errors, created_at)
  values ('77777777-7777-7777-7777-777777777777', 'students', 40, 1,
          '[{"row": 14, "value": "asha@school.test", "reason": "not an email address"}]'::jsonb,
          now() - interval '120 days');

-- Two statements, not one expression with an AND. Postgres may evaluate the
-- operands of an AND in either order, so `purge() = 1 and (select errors …)`
-- can read the row before the purge has run and fail against correct code.
select public.pp_t('the import purge reports one row redacted',
       public.purge_import_errors() = 1);

select public.pp_t('...the names are gone and the counts survive',
       (select errors = '[]'::jsonb and failed_rows = 1
          from public.import_jobs
         where created_at < now() - interval '100 days'));


do $$ begin raise notice '=== 12. A row cannot belong to two schools at once ==='; end $$;
insert into public.orgs (id, name, seats, expires_at)
  values ('7e7e7e7e-7e7e-7e7e-7e7e-7e7e7e7e7e7e', 'Other School', 10, current_date + 90);

insert into public.org_members (org_id, user_id, role)
  values ('7e7e7e7e-7e7e-7e7e-7e7e-7e7e7e7e7e7e',
          '66666666-6666-6666-6666-666666666666', 'student');

do $$
begin
  insert into public.student_records (org_id, student_id, admission_number, section_id)
    values ('7e7e7e7e-7e7e-7e7e-7e7e-7e7e7e7e7e7e',
            '66666666-6666-6666-6666-666666666666', 'X-1',
            'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');   -- the FIRST school's section
  perform public.pp_t('a student record cannot point at another school''s section', false);
exception when others then
  perform public.pp_t('a student record cannot point at another school''s section',
                    sqlerrm like '%another organisation%');
end $$;

do $$
begin
  insert into public.teacher_assignments (org_id, teacher_id, section_id, subject_ref)
    values ('7e7e7e7e-7e7e-7e7e-7e7e-7e7e7e7e7e7e',
            '66666666-6666-6666-6666-666666666666',
            'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'ppqa:8:maths');
  perform public.pp_t('a teacher cannot be assigned into another school''s section', false);
exception when others then
  perform public.pp_t('a teacher cannot be assigned into another school''s section',
                    sqlerrm like '%another organisation%');
end $$;

do $$
begin
  insert into public.announcements (org_id, section_id, created_by, title, body, audience)
    values ('7e7e7e7e-7e7e-7e7e-7e7e-7e7e7e7e7e7e',
            'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            '66666666-6666-6666-6666-666666666666', 'Hello', 'there', 'section');
  perform public.pp_t('a school cannot announce into another school''s classroom', false);
exception when others then
  perform public.pp_t('a school cannot announce into another school''s classroom',
                    sqlerrm like '%another organisation%');
end $$;

do $$
begin
  insert into public.tests (org_id, section_id, title, status)
    values ('7e7e7e7e-7e7e-7e7e-7e7e-7e7e7e7e7e7e',
            'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Not yours', 'published');
  perform public.pp_t('a test cannot be set for another school''s section', false);
exception when others then
  perform public.pp_t('a test cannot be set for another school''s section',
                    sqlerrm like '%another organisation%');
end $$;

-- The platform-level cases must still be allowed, or the vendor cannot publish
-- a ready-made test at all.
do $$
begin
  insert into public.tests (org_id, section_id, title, status)
    values (null, null, 'Ready-made', 'published');
  perform public.pp_t('a platform test with no org and no section is still allowed', true);
exception when others then
  perform public.pp_t('a platform test with no org and no section is still allowed: '
                    || sqlerrm, false);
end $$;


do $$ begin raise notice '=== 13. Seats belong to real members of the right school ==='; end $$;
do $$
begin
  insert into public.licence_seats (licence_id, org_id, student_id)
    values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
            '7e7e7e7e-7e7e-7e7e-7e7e-7e7e7e7e7e7e',
            '66666666-6666-6666-6666-666666666666');
  perform public.pp_t('a seat cannot be cut from another school''s licence', false);
exception when others then
  perform public.pp_t('a seat cannot be cut from another school''s licence',
                    sqlerrm like '%another organisation%');
end $$;

do $$
begin
  insert into public.licence_seats (licence_id, org_id, student_id)
    values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
            '77777777-7777-7777-7777-777777777777',
            '66666666-6666-6666-6666-666666666666');   -- not a member of this school
  perform public.pp_t('a seat cannot be given to a non-member', false);
exception when others then
  perform public.pp_t('a seat cannot be given to a non-member',
                    sqlerrm like '%not a member%');
end $$;

-- Moving a live seat between licences is an UPDATE the old trigger slept
-- through, because it only watched revoked_at.
insert into public.licences (id, org_id, plan_code, seats_purchased, starts_on, expires_on)
  values ('bcbcbcbc-bcbc-bcbc-bcbc-bcbcbcbcbcbc', '77777777-7777-7777-7777-777777777777',
          'school-standard', 0, current_date - 1, current_date + 300);

do $$
begin
  update public.licence_seats
     set licence_id = 'bcbcbcbc-bcbc-bcbc-bcbc-bcbcbcbcbcbc'
   where student_id = '44444444-4444-4444-4444-444444444444'
     and revoked_at is null;
  perform public.pp_t('a seat cannot be moved onto a licence with no seats left', false);
exception when others then
  perform public.pp_t('a seat cannot be moved onto a licence with no seats left',
                    sqlerrm like '%all of them are in use%');
end $$;


do $$ begin raise notice '=== 14. Onboarding a school is one transaction ==='; end $$;
do $$
begin
  perform public.onboard_school(
    p_name => 'No Expiry High School', p_plan_code => 'school-standard',
    p_seats => 50, p_starts_on => current_date, p_expires_on => null);
  perform public.pp_t('a school cannot be onboarded without an expiry date', false);
exception when others then
  perform public.pp_t('a school cannot be onboarded without an expiry date',
                    sqlerrm like '%needs an expiry date%');
end $$;

do $$
begin
  perform public.onboard_school(
    p_name => 'Bad Plan School', p_plan_code => 'does-not-exist',
    p_seats => 50, p_starts_on => current_date, p_expires_on => current_date + 365);
  perform public.pp_t('an unknown plan is refused', false);
exception when others then
  perform public.pp_t('an unknown plan is refused', sqlerrm like '%no such plan%');
end $$;

do $$
begin
  perform public.onboard_school(
    p_name => 'Zero Seat School', p_plan_code => 'school-standard',
    p_seats => 0, p_starts_on => current_date, p_expires_on => current_date + 365);
  perform public.pp_t('a licence with no seats is refused', false);
exception when others then
  perform public.pp_t('a licence with no seats is refused', sqlerrm like '%at least one seat%');
end $$;

select public.pp_t('nothing was left behind by the three refusals',
       (select count(*) from public.orgs
         where name in ('No Expiry High School', 'Bad Plan School', 'Zero Seat School')) = 0);

create temporary table onboarded as
  select public.onboard_school(
    p_name => 'Sunrise Public School', p_plan_code => 'school-premium',
    p_seats => 120, p_starts_on => date '2026-06-01', p_expires_on => date '2027-05-31',
    p_board => 'ppqa', p_po_number => 'PO-2026-11',
    p_billing_email => 'accounts@sunrise.test',
    p_actor => '11111111-1111-1111-1111-111111111111',
    p_raise_invoice => true
  ) as result;

select public.pp_t('the school, its licence and its year all exist',
       (select count(*) from public.orgs o
          join public.licences l on l.org_id = o.id
          join public.academic_years y on y.org_id = o.id
         where o.name = 'Sunrise Public School'
           and l.seats_purchased = 120
           and y.is_current) = 1);

select public.pp_t('the year is derived from the licence start, Indian-style',
       (select y.label from public.academic_years y
          join public.orgs o on o.id = y.org_id
         where o.name = 'Sunrise Public School') = '2026-27');

select public.pp_t('the plan decides authoring, not a checkbox',
       (select can_author from public.orgs where name = 'Sunrise Public School'));

select public.pp_t('the legacy columns are written too, so the old screens work',
       (select expires_at = date '2027-05-31' and seats = 120
          from public.orgs where name = 'Sunrise Public School'));

select public.pp_t('an invoice was raised against the purchase order',
       (select count(*) from public.org_invoices i
          join public.orgs o on o.id = i.org_id
         where o.name = 'Sunrise Public School'
           and i.po_number = 'PO-2026-11'
           and i.total_inr = 120 * 900.00 * 1.18) = 1);

select public.pp_t('the onboarding is in the audit trail',
       (select count(*) from public.audit_logs
         where action = 'school.onboard'
           and after ->> 'name' = 'Sunrise Public School') = 1);

-- The whole point of the revoke: this is the vendor's operation and the
-- database cannot check who the vendor is, so nobody reaching it through
-- PostgREST may call it at all.
set request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
set role authenticated;
do $$
begin
  perform public.onboard_school(
    p_name => 'Student Made This', p_plan_code => 'school-standard',
    p_seats => 500, p_starts_on => current_date, p_expires_on => current_date + 3650);
  perform public.pp_t('a signed-in student cannot onboard a school', false);
exception when insufficient_privilege then
  perform public.pp_t('a signed-in student cannot onboard a school', true);
when others then
  perform public.pp_t('a signed-in student cannot onboard a school (' || sqlerrm || ')', false);
end $$;
reset role;
reset request.jwt.claim.sub;


do $$ begin raise notice '=== 15. Seats allotted in a batch ==='; end $$;
do $$
declare v_result jsonb;
begin
  -- A live member, a stranger, and a member again: the batch must not fail as
  -- a whole because one of them cannot be seated.
  select public.assign_seats(
    'bcbcbcbc-bcbc-bcbc-bcbc-bcbcbcbcbcbc',
    array['55555555-5555-5555-5555-555555555555'::uuid,
          '66666666-6666-6666-6666-666666666666'::uuid]
  ) into v_result;

  perform public.pp_t('the batch reports what it could not seat',
    jsonb_array_length(v_result -> 'skipped') = 2
    and (v_result -> 'skipped' -> 0 ->> 'reason') like '%all of them are in use%');
end $$;

update public.licences set seats_purchased = 5
 where id = 'bcbcbcbc-bcbc-bcbc-bcbc-bcbcbcbcbcbc';

do $$
declare v_result jsonb;
begin
  select public.assign_seats(
    'bcbcbcbc-bcbc-bcbc-bcbc-bcbcbcbcbcbc',
    array['55555555-5555-5555-5555-555555555555'::uuid,
          '66666666-6666-6666-6666-666666666666'::uuid]
  ) into v_result;

  perform public.pp_t('the member is seated and the stranger is not',
    (v_result ->> 'assigned')::int = 1
    and (v_result -> 'skipped' -> 0 ->> 'reason') like '%not a member%');
end $$;


do $$ begin raise notice '=== 16. What the school already knows about a child ==='; end $$;
select public.pp_t('a school student inherits board and class from the school',
       (select board = 'ppqa' and class_level = 9
          from public.school_defaults('44444444-4444-4444-4444-444444444444')));

select public.pp_t('...and the section comes with it',
       (select section_name from public.school_defaults(
          '44444444-4444-4444-4444-444444444444')) = 'Class 9-A');

select public.pp_t('a direct signup is asked everything, as before',
       not exists (select 1 from public.school_defaults(
         '00000000-0000-0000-0000-000000000009')));


do $$ begin raise notice '=== 17. Erasure reaches payloads, not just subjects ==='; end $$;
select public.record_audit('77777777-7777-7777-7777-777777777777',
  '11111111-1111-1111-1111-111111111111', 'org_admin', 'roster.import', 'import_job',
  '00000000-0000-0000-0000-000000000001', null,
  jsonb_build_object('imported', jsonb_build_array('55555555-5555-5555-5555-555555555555')),
  '9.9.9.9', 'test');

do $$
begin
  perform public.forget_user_comms('55555555-5555-5555-5555-555555555555');
  perform public.pp_t('a child named inside another row''s payload is redacted too',
    (select count(*) from public.audit_logs
      where entity_type = 'import_job' and after is null and ip_address is null) = 1);
end $$;


do $$ begin raise notice '=== 18. An expired subscription stops granting access ==='; end $$;
-- can_access_chapter is defined three times across the migrations — billing,
-- tenancy and licensing, in that order — and only the last one is in force.
-- These assertions run against whatever survived the chain, which is the only
-- version that matters and the one a fix applied to a single file misses.

reset role;
reset request.jwt.claim.sub;

-- A student with no org, so only the subscription branch can grant anything.
insert into auth.users (id, email)
  values ('dddddddd-1111-1111-1111-111111111111', 'solo@home.test');

do $$
begin
  -- Active, and the paid period has not ended.
  insert into public.subscriptions
    (user_id, provider, provider_sub_id, plan, amount_inr, status, current_period_end)
  values ('dddddddd-1111-1111-1111-111111111111', 'razorpay', 'sub_live', 'monthly',
          399, 'active', now() + interval '20 days');

  perform public.pp_t('a live subscription opens a paid chapter',
    public.can_access_chapter('dddddddd-1111-1111-1111-111111111111', 'ppqa:8:maths:1'));

  -- The webhook stopped arriving. The row still says 'active' and always will.
  update public.subscriptions
     set current_period_end = now() - interval '1 day'
   where provider_sub_id = 'sub_live';

  perform public.pp_t('...and stops the moment its period has passed',
    not public.can_access_chapter('dddddddd-1111-1111-1111-111111111111', 'ppqa:8:maths:1'));

  -- Authorised but never charged: no period end yet, and that parent has paid.
  update public.subscriptions set current_period_end = null
   where provider_sub_id = 'sub_live';

  perform public.pp_t('a mandate with no period end yet is still open',
    public.can_access_chapter('dddddddd-1111-1111-1111-111111111111', 'ppqa:8:maths:1'));

  -- Grace is unaffected: a failed charge inside its window still teaches.
  update public.subscriptions
     set status = 'past_due',
         current_period_end = now() - interval '1 day',
         grace_until = now() + interval '2 days'
   where provider_sub_id = 'sub_live';

  perform public.pp_t('a failed charge inside its grace window still opens it',
    public.can_access_chapter('dddddddd-1111-1111-1111-111111111111', 'ppqa:8:maths:1'));

  update public.subscriptions set grace_until = now() - interval '1 hour'
   where provider_sub_id = 'sub_live';

  perform public.pp_t('...and closes when the grace window expires',
    not public.can_access_chapter('dddddddd-1111-1111-1111-111111111111', 'ppqa:8:maths:1'));
end $$;


do $$ begin raise notice '=== 19. Turn numbers are handed out once each ==='; end $$;
-- session_turns has unique (session_id, seq). The route used to read max(seq)
-- and write max+1 across two round trips, so two concurrent turns produced one
-- insert and one discarded unique violation — a turn missing from a transcript
-- with nothing logged.

insert into public.concepts (id, topic_ref, seq, title, statement)
  values ('ppqa:8:maths:1:1:1', 'ppqa:8:maths:1:1', 1, 'Sign flip',
          'The additive inverse of a is -a.');

insert into public.learning_sessions (id, user_id, topic_ref, concept_ref, current_beat)
  values ('eeeeeeee-1111-1111-1111-111111111111',
          '44444444-4444-4444-4444-444444444444',
          'ppqa:8:maths:1:1', 'ppqa:8:maths:1:1:1', 'HOOK');

do $$
declare
  a int;
  b int;
  c int;
begin
  a := public.reserve_turn_seq('eeeeeeee-1111-1111-1111-111111111111', 2);
  b := public.reserve_turn_seq('eeeeeeee-1111-1111-1111-111111111111', 2);

  perform public.pp_t('the first reservation starts at 1', a = 1);
  perform public.pp_t('a second reservation does not reissue the same numbers', b = 3);

  -- Both blocks are usable: no unique violation, which is the actual claim.
  insert into public.session_turns (session_id, user_id, seq, beat, role, content) values
    ('eeeeeeee-1111-1111-1111-111111111111', '44444444-4444-4444-4444-444444444444', a,     'HOOK', 'student', 'q'),
    ('eeeeeeee-1111-1111-1111-111111111111', '44444444-4444-4444-4444-444444444444', a + 1, 'HOOK', 'tutor',   'a'),
    ('eeeeeeee-1111-1111-1111-111111111111', '44444444-4444-4444-4444-444444444444', b,     'TEACH','student', 'q2'),
    ('eeeeeeee-1111-1111-1111-111111111111', '44444444-4444-4444-4444-444444444444', b + 1, 'TEACH','tutor',   'a2');

  perform public.pp_t('all four turns landed', (
    select count(*) from public.session_turns
     where session_id = 'eeeeeeee-1111-1111-1111-111111111111') = 4);

  -- Rows written before this function existed start the cursor at 0, so the
  -- reservation has to notice them rather than hand out 1 again.
  update public.learning_sessions set seq_cursor = 0
   where id = 'eeeeeeee-1111-1111-1111-111111111111';

  c := public.reserve_turn_seq('eeeeeeee-1111-1111-1111-111111111111', 2);
  perform public.pp_t('a session migrated with turns already in it does not collide', c = 5);
end $$;

do $$
begin
  perform public.reserve_turn_seq('eeeeeeee-9999-9999-9999-999999999999', 2);
  perform public.pp_t('reserving against a session that does not exist is refused', false);
exception when others then
  perform public.pp_t('reserving against a session that does not exist is refused',
                    sqlerrm like '%no such session%');
end $$;

set request.jwt.claim.sub = '55555555-5555-5555-5555-555555555555';
set role authenticated;

do $$
begin
  perform public.reserve_turn_seq('eeeeeeee-1111-1111-1111-111111111111', 2);
  perform public.pp_t('another student cannot reserve numbers on your session', false);
exception when others then
  perform public.pp_t('another student cannot reserve numbers on your session',
                    sqlerrm like '%not your session%');
end $$;

reset role;
reset request.jwt.claim.sub;

do $$ begin raise notice '=== 20. profiles.role is a closed set of three roles ==='; end $$;
-- The column was created with no CHECK and a comment claiming two values while
-- the application wrote three. A typo in any writer would not have failed — it
-- would have produced an account that fell through every branch to the student
-- default, which is the least alarming and least debuggable outcome available.

reset role;
reset request.jwt.claim.sub;

do $$
begin
  perform public.pp_t('a student is storable', (
    select true from public.profiles
     where id = '44444444-4444-4444-4444-444444444444'
       and role in ('student', 'teacher')));

  begin
    update public.profiles set role = 'parent'
     where id = '44444444-4444-4444-4444-444444444444';
    perform public.pp_t('parent is no longer a storable role', false);
  exception when check_violation then
    perform public.pp_t('parent is no longer a storable role', true);
  end;

  begin
    update public.profiles set role = 'super_admin'
     where id = '44444444-4444-4444-4444-444444444444';
    perform public.pp_t('super_admin is not a database role', false);
  exception when check_violation then
    perform public.pp_t('super_admin is not a database role', true);
  end;

  begin
    update public.profiles set role = 'Teacher'
     where id = '44444444-4444-4444-4444-444444444444';
    perform public.pp_t('a capitalised typo is rejected rather than silently demoted', false);
  exception when check_violation then
    perform public.pp_t('a capitalised typo is rejected rather than silently demoted', true);
  end;
end $$;

-- The whole role model rests on a student not being able to promote
-- themselves. compliance.sql revokes update on profiles and grants back three
-- columns; roles.sql restates it. This is the assertion that would notice a
-- future migration re-granting the table.
set request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
set role authenticated;

do $$
begin
  update public.profiles set role = 'teacher'
   where id = '44444444-4444-4444-4444-444444444444';
  perform public.pp_t('a student cannot promote themselves to teacher', false);
exception when insufficient_privilege then
  perform public.pp_t('a student cannot promote themselves to teacher', true);
end $$;

do $$
begin
  update public.profiles set first_name = 'Aarav'
   where id = '44444444-4444-4444-4444-444444444444';
  perform public.pp_t('...but may still edit their own name', true);
exception when others then
  perform public.pp_t('...but may still edit their own name', false);
end $$;

reset role;
reset request.jwt.claim.sub;

-- ---------------------------------------------------------------------------
-- ADD NEW SECTIONS ABOVE THIS LINE
--
-- Everything below is the teardown: the sequence is restored and the
-- transaction is rolled back. A section appended after it runs OUTSIDE the
-- transaction, against the real database, and its fixtures stay there --
-- which is the one thing this file promises cannot happen.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Nothing above is kept
-- ---------------------------------------------------------------------------
select setval(
  'public.org_invoice_seq',
  (select last_value from pp_seq_backup),
  (select is_called from pp_seq_backup)
);

-- ---------------------------------------------------------------------------
-- The results, as the last grid the editor draws
--
-- Failures first, because the editor's row limit is 100 and this suite is
-- close to it: the rows worth reading must not be the ones that get cut. The
-- window function repeats the failure count on every row so the answer is
-- visible without scrolling to the end.
-- ---------------------------------------------------------------------------
select
  count(*) filter (where not ok) over () as failures,
  count(*) over ()                       as assertions,
  case when ok then 'PASS' else 'FAIL' end as result,
  label
from pg_temp.pp_results
order by ok, n;

rollback;
