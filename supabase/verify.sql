-- Run this AFTER schema.sql. Every row should say OK.
--
-- It only reads catalogue tables, so it is safe to run any number of times
-- and on a live project.

select 'tables' as check,
       case when count(*) = 10 then 'OK' else 'MISSING: ' || (10 - count(*))::text end as status,
       string_agg(tablename, ', ' order by tablename) as found
from pg_tables
where schemaname = 'public'
  and tablename in (
    'profiles', 'onboarding', 'progress', 'study_log', 'exams',
    'tickets', 'ticket_messages', 'generated_questions',
    'ai_usage', 'topic_explainers'
  )

union all

select 'progress.done_session_ids',
       case when count(*) = 1 then 'OK' else 'MISSING' end, ''
from information_schema.columns
where table_schema = 'public' and table_name = 'progress'
  and column_name = 'done_session_ids'

union all

select 'profiles.plan',
       case when count(*) = 1 then 'OK' else 'MISSING' end, ''
from information_schema.columns
where table_schema = 'public' and table_name = 'profiles'
  and column_name = 'plan'

union all

select 'quota functions',
       case when count(*) = 2 then 'OK' else 'MISSING' end,
       string_agg(proname, ', ')
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and proname in ('consume_ai_quota', 'release_ai_quota')

union all

select 'row level security',
       case when count(*) = 0 then 'OK' else 'RLS OFF ON: ' || string_agg(relname, ', ') end, ''
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in (
    'profiles', 'onboarding', 'progress', 'study_log', 'exams',
    'tickets', 'ticket_messages', 'generated_questions',
    'ai_usage', 'topic_explainers'
  )
  and c.relrowsecurity = false

union all

select 'topic-audio bucket',
       case when count(*) = 1 then 'OK' else 'MISSING — create it in Storage' end, ''
from storage.buckets where id = 'topic-audio'

union all

select 'topic-audio policies',
       case when count(*) >= 3 then 'OK'
            else 'ONLY ' || count(*)::text || ' of 3 — add them in Storage > Policies' end,
       string_agg(policyname, ', ')
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and policyname like 'own topic audio%';
