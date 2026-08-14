-- ---------------------------------------------------------------------------
-- US curricula, and Kindergarten.
--
-- Run after all.sql (or after schoolops.sql, whichever seeded public.boards).
-- Idempotent: every statement is `on conflict do nothing`, so running it twice
-- changes nothing.
--
-- WHY THIS FILE EXISTS
--
-- lib/syllabus.ts gained five US curricula and a K-12 grade range. The
-- database did not, and public.boards is not decoration: subjects.board has a
-- foreign key to it (subjects_board_fkey, added at the bottom of the masters
-- section in all.sql). So until these rows exist, creating a section, subject
-- or plan-access row against 'texas' fails on the constraint — the US half of
-- the product would be selectable in the browser and rejected by Postgres.
--
-- Accounts are NOT affected by this and never were. There is one auth system,
-- one profiles table and one role column; a country is a property of the
-- curriculum a student follows, not of the person signing in. An admin,
-- teacher or student uses exactly the same credentials either way, and a US
-- school is simply another row in public.orgs.
--
-- WHAT THIS DOES NOT DO
--
-- It adds no chapters. lib/syllabus.ts still has no US syllabus entries, on
-- purpose — every chapter list in this product is read off the published
-- curriculum before it goes in. This file only makes the codes legal so that
-- schools and licences can be set up ahead of the content.
-- ---------------------------------------------------------------------------

insert into public.boards (code, name) values
  ('common-core', 'Common Core'),
  ('california',  'California'),
  ('texas',       'Texas TEKS'),
  ('newyork',     'New York'),
  ('florida',     'Florida B.E.S.T.')
on conflict (code) do nothing;

-- Kindergarten is class_level 0.
--
-- public.grades was seeded 1..12, which covers every US grade except the first
-- one. Numeric rather than a 'K' string so that ordering, ranges and the
-- existing band thresholds in lib/syllabus.ts keep working without a special
-- case at every comparison — see classLabel(), which is what turns 0 into the
-- word "Kindergarten" for a US student and never shows this label.
--
-- The label column says 'Class 0' for consistency with its neighbours; nothing
-- student-facing reads it, and rewriting the whole column to be country-aware
-- would mean this table needing a country it does not have.
insert into public.grades (class_level, label) values
  (0, 'Class 0')
on conflict (class_level) do nothing;
