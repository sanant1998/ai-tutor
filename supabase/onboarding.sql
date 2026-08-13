-- PaperPath — onboarding a school in one step
--
-- Run last, after comms.sql. It is last because it is the only file that
-- touches every other one: orgs from schools.sql, licences from licensing.sql,
-- academic years from schoolops.sql, and record_audit from comms.sql.
--
-- ---------------------------------------------------------------------------
-- WHY THIS IS ONE FUNCTION AND NOT FIVE CONSOLE CALLS
--
-- Onboarding a school was five separate writes from the admin console, each
-- its own request, with no transaction across them. That shape has one failure
-- mode and it is the expensive one: the org is created, the licence request
-- fails, and what exists now is a school with no licence — indistinguishable
-- on every screen from a school whose licence has not been entered yet.
-- Somebody finds it in a month, when the students cannot open anything.
--
-- The blueprint's closing note is that B2B deals die on onboarding friction
-- rather than on missing features. The friction is not the number of fields.
-- It is that a half-onboarded school looks exactly like a working one.
--
-- So: one call, one transaction. Either the school exists with a licence, a
-- year and an audit trail, or nothing was written at all.
--
-- ---------------------------------------------------------------------------
-- WHAT IT REFUSES
--
-- No expiry date. This is the bug licensing.sql fixed at the read end — an org
-- with a null expires_at was granting permanent free access to everything —
-- and this is the write end of the same bug. The console let the field be left
-- blank because `expiresOn ?? null` is what the route wrote. A licence with no
-- end date is not a licence, so it is rejected here rather than defaulted:
-- defaulting it would invent commercial terms nobody agreed to.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Is this file being run in the right order?
--
-- Pasting one migration on its own is the ordinary mistake, and without this
-- the first symptom is `column o.board does not exist` on line 300 — which is
-- true, unhelpful, and points at the wrong file. A `language sql` function
-- body is parsed when it is created, so the failure lands here rather than at
-- the call site, and the message may as well say what to do about it.
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.orgs') is null then
    raise exception 'supabase/schools.sql has not been run'
      using hint = 'Paste supabase/all.sql — every migration, already in dependency order.';
  end if;

  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'orgs' and column_name = 'board'
  ) then
    raise exception 'supabase/schoolops.sql has not been run'
      using hint = 'Paste supabase/all.sql — every migration, already in dependency order.';
  end if;

  if to_regclass('public.licences') is null then
    raise exception 'supabase/licensing.sql has not been run'
      using hint = 'Paste supabase/all.sql — every migration, already in dependency order.';
  end if;

  if to_regprocedure('public.record_audit(uuid, uuid, text, text, text, text, jsonb, jsonb, text, text)') is null then
    raise exception 'supabase/comms.sql has not been run'
      using hint = 'Paste supabase/all.sql — every migration, already in dependency order.';
  end if;
end $$;

create or replace function public.onboard_school(
  p_name text,
  p_plan_code text,
  p_seats int,
  p_starts_on date,
  p_expires_on date,
  p_kind text default 'school',
  p_board text default null,
  p_price_per_seat_inr numeric default null,
  p_po_number text default null,
  p_billing_email text default null,
  p_billing_contact text default null,
  p_year_label text default null,
  p_actor uuid default null,
  p_raise_invoice boolean default false
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_org uuid;
  v_licence uuid;
  v_year uuid;
  v_invoice public.org_invoices;
  v_plan public.licence_plans;
  v_year_label text;
  v_year_start date;
begin
  -- ----- What cannot be guessed --------------------------------------------
  if coalesce(trim(p_name), '') = '' then
    raise exception 'a school needs a name';
  end if;

  if p_expires_on is null then
    raise exception 'a licence needs an expiry date'
      using hint = 'An org with no expiry is not a sold licence. See licensing.sql.';
  end if;

  if p_starts_on is null then
    raise exception 'a licence needs a start date';
  end if;

  if p_expires_on < p_starts_on then
    raise exception 'the licence ends before it starts';
  end if;

  if coalesce(p_seats, 0) < 1 then
    raise exception 'a school licence needs at least one seat';
  end if;

  select * into v_plan from public.licence_plans where code = p_plan_code;

  if v_plan.code is null then
    raise exception 'no such plan: %', p_plan_code
      using hint = 'Plans are rows in licence_plans, not strings in the console.';
  end if;

  if not v_plan.is_active then
    raise exception 'plan % is no longer sold', p_plan_code;
  end if;

  -- ----- The school --------------------------------------------------------
  --
  -- expires_at and seats are still written to orgs. They are the legacy path
  -- and half the app reads them — org_seat_usage, the console's expiry
  -- warning, can_access_chapter's last branch. Writing the licence without
  -- them would leave a school that works and reports nothing.
  insert into public.orgs (
    name, kind, board, seats, expires_at,
    licence_inr, licence_starts_on, billing_email, billing_contact, can_author
  )
  values (
    trim(p_name),
    case when p_kind = 'coaching' then 'coaching' else 'school' end,
    p_board,
    p_seats,
    p_expires_on,
    coalesce(p_price_per_seat_inr, v_plan.price_per_seat_inr) * p_seats,
    p_starts_on,
    p_billing_email,
    p_billing_contact,
    -- From the plan, not from a checkbox somebody ticks twice. Authoring is a
    -- commercial line and the plan is where the commercial lines live.
    v_plan.can_author
  )
  returning id into v_org;

  -- ----- The licence -------------------------------------------------------
  insert into public.licences (
    org_id, plan_code, seats_purchased, price_per_seat_inr,
    starts_on, expires_on, status, po_number
  )
  values (
    v_org, p_plan_code, p_seats,
    coalesce(p_price_per_seat_inr, v_plan.price_per_seat_inr),
    p_starts_on, p_expires_on,
    case when p_expires_on >= current_date then 'active' else 'expired' end,
    p_po_number
  )
  returning id into v_licence;

  -- ----- The year ----------------------------------------------------------
  --
  -- Derived from the licence start unless told otherwise. An Indian school
  -- year runs April to March, so a licence starting in June 2026 belongs to
  -- 2026-27 and one starting in February 2027 belongs to 2026-27 as well.
  -- financial_year() already encodes exactly that boundary for invoicing, and
  -- the school year and the financial year are the same year in India.
  v_year_label := coalesce(p_year_label, public.financial_year(p_starts_on::timestamptz));

  v_year_start := make_date(split_part(v_year_label, '-', 1)::int, 4, 1);

  insert into public.academic_years (org_id, label, starts_on, ends_on, is_current)
  values (
    v_org, v_year_label, v_year_start, v_year_start + interval '1 year' - interval '1 day',
    true
  )
  returning id into v_year;

  -- ----- The invoice, if the sale is ready to be billed ---------------------
  --
  -- Off by default. A purchase order often arrives after the account is set
  -- up, and an invoice raised against a PO number nobody has yet is one the
  -- school's accounts team will reject and somebody will have to void.
  if p_raise_invoice then
    v_invoice := public.issue_org_invoice(
      v_org, v_licence,
      coalesce(p_price_per_seat_inr, v_plan.price_per_seat_inr) * p_seats,
      p_po_number
    );
  end if;

  -- ----- What happened -----------------------------------------------------
  perform public.record_audit(
    v_org, p_actor, 'super_admin', 'school.onboard', 'org', v_org::text, null,
    jsonb_build_object(
      'name', trim(p_name),
      'plan', p_plan_code,
      'seats', p_seats,
      'starts_on', p_starts_on,
      'expires_on', p_expires_on,
      'po_number', p_po_number,
      'invoice', v_invoice.number
    )
  );

  return jsonb_build_object(
    'org_id', v_org,
    'licence_id', v_licence,
    'academic_year_id', v_year,
    'invoice_id', v_invoice.id,
    'invoice_number', v_invoice.number
  );
end;
$$;

-- The vendor's own operation, and the vendor is a person in ADMIN_EMAILS —
-- something the database cannot check, because it deliberately does not know
-- who that is (lib/admin/access.ts explains why it is an environment file and
-- not a role column).
--
-- So authorisation lives in the route, and the function is taken away from
-- everybody who reaches the database through PostgREST. Without this revoke,
-- `POST /rest/v1/rpc/onboard_school` from any signed-in student's browser
-- creates a school with a licence.
revoke execute on function public.onboard_school(
  text, text, int, date, date, text, text, numeric, text, text, text, text, uuid, boolean
) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Seats, allotted in a batch
--
-- The console allots a class at a time, and the interesting part is what does
-- NOT get a seat: a student who left, a licence that is already full, an id
-- that belongs to another school. Failing the whole batch on the first of
-- those would make a forty-child class un-allottable because one child has
-- transferred out.
--
-- So each seat is attempted on its own and the refusals come back with their
-- reasons, for the admin to read. The rules themselves are not repeated here —
-- they are the trigger on licence_seats, which is the only place they exist.
-- ---------------------------------------------------------------------------
create or replace function public.assign_seats(
  p_licence uuid,
  p_students uuid[]
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_org uuid;
  v_student uuid;
  v_assigned int := 0;
  v_skipped jsonb := '[]'::jsonb;
begin
  select org_id into v_org from public.licences where id = p_licence;

  if v_org is null then
    raise exception 'no such licence';
  end if;

  if not public.is_org_admin(v_org) and auth.uid() is not null then
    raise exception 'not your organisation';
  end if;

  foreach v_student in array coalesce(p_students, '{}'::uuid[])
  loop
    begin
      insert into public.licence_seats (licence_id, org_id, student_id)
        values (p_licence, v_org, v_student)
      on conflict (licence_id, student_id) do update
        set revoked_at = null
        where public.licence_seats.revoked_at is not null;

      v_assigned := v_assigned + 1;
    exception when others then
      -- One student's refusal is not the batch's failure. The reason is the
      -- trigger's own message, which is written to be read by the person
      -- doing the allotting.
      v_skipped := v_skipped || jsonb_build_object(
        'student_id', v_student,
        'reason', sqlerrm
      );
    end;
  end loop;

  return jsonb_build_object('assigned', v_assigned, 'skipped', v_skipped);
end;
$$;

grant execute on function public.assign_seats(uuid, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- What a school student should not be asked
--
-- Student onboarding asks for board, class and subjects. For a child whose
-- school bought the licence, all three are already known — the org has a
-- board, the section has a class level, and the subjects follow from the two.
-- Asking anyway is not merely five wasted taps: the child can answer wrongly,
-- and then their roadmap is for a class they are not in while the teacher's
-- heatmap says they have done nothing.
--
-- One function, called by the onboarding route, so that "what does the school
-- already know about this child" has a single answer. Returns nulls for a
-- direct signup, which is the parent who found the app — they still answer
-- every question, because for them nobody else knows.
-- ---------------------------------------------------------------------------
create or replace function public.school_defaults(p_user uuid default null)
returns table (
  org_id      uuid,
  org_name    text,
  board       text,
  class_level int,
  section_id  uuid,
  section_name text
)
language sql
stable
security definer set search_path = public
as $$
  select
    o.id,
    o.name,
    o.board,
    s.class_level,
    s.id,
    s.name
  from public.org_members m
  join public.orgs o on o.id = m.org_id
  left join public.section_students ss on ss.student_id = m.user_id
  left join public.sections s on s.id = ss.section_id and s.org_id = o.id
  where m.user_id = coalesce(p_user, auth.uid())
    and m.role = 'student'
  -- A child in two sections is a mid-year transfer that was never tidied up.
  -- The one with a class level wins, then the newest.
  order by s.class_level nulls last, s.created_at desc nulls last
  limit 1;
$$;

grant execute on function public.school_defaults(uuid) to authenticated;
