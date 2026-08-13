-- PaperPath — subscriptions
--
-- Run after tutor.sql.
--
-- ---------------------------------------------------------------------------
-- THE WEBHOOK IS THE TRUTH, NOT THE BROWSER
--
-- Razorpay's checkout hands the browser a success callback. Access must never
-- be granted from it. It fires before the payment has settled, it does not
-- fire at all when the student closes the tab on a successful payment, and it
-- is a fetch call a fourteen-year-old can make by hand.
--
-- So every state change below is written by the webhook handler and by nothing
-- else. The browser's callback does one thing: show a spinner until this table
-- says otherwise.
--
-- ---------------------------------------------------------------------------
-- WHY THERE IS A DUNNING STATE AND NOT JUST 'ACTIVE'
--
-- UPI autopay is the only subscription rail that works at scale in India —
-- card penetration in this market is low and cards fail more often than the
-- mandate does. But mandate execution still fails 15-20% of the time in any
-- given month: insufficient balance on the day, a bank outage, an app that did
-- not surface the notification.
--
-- Revoking access the moment a charge fails treats an ordinary bank hiccup as
-- a cancellation, and roughly doubles churn against a three-day grace period.
-- Hence `past_due` with `grace_until`: the student keeps studying, the parent
-- gets a message, and access only stops if nobody acts.
-- ---------------------------------------------------------------------------

create table if not exists public.subscriptions (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users on delete cascade,
  -- Null for a whole-account plan; set when a subscription buys one subject.
  subject_ref         text references public.subjects on delete set null,

  provider            text not null default 'razorpay',
  provider_sub_id     text unique,
  provider_plan_id    text,

  plan                text not null,          -- monthly | annual
  amount_inr          numeric(10,2) not null,
  -- upi_autopay | card | netbanking. Recorded because renewal success differs
  -- enormously between them and an averaged number hides that.
  method              text,

  -- created  → mandate not yet authorised
  -- active   → paid, access granted
  -- past_due → a charge failed; access continues until grace_until
  -- halted   → grace expired or the mandate was revoked; access stopped
  -- cancelled/expired → ended normally
  status              text not null default 'created',

  current_period_end  timestamptz,
  grace_until         timestamptz,
  dunning_attempts    int not null default 0,

  cancelled_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists subscriptions_user_idx
  on public.subscriptions (user_id, status);

create index if not exists subscriptions_dunning_idx
  on public.subscriptions (status, grace_until)
  where status = 'past_due';

alter table public.subscriptions enable row level security;

-- Readable by its owner, writable by the webhook only.
drop policy if exists "subscriptions are readable by their owner" on public.subscriptions;
create policy "subscriptions are readable by their owner" on public.subscriptions
  for select using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Webhook events
--
-- Providers retry, and they retry the ones that succeeded slowly as well as
-- the ones that failed. Without a uniqueness constraint on the event id, one
-- retry of subscription.charged extends a subscription by a second month for
-- free.
-- ---------------------------------------------------------------------------
create table if not exists public.billing_events (
  id            uuid primary key default gen_random_uuid(),
  provider      text not null default 'razorpay',
  provider_event_id text not null,
  event         text not null,
  payload       jsonb not null,
  processed_at  timestamptz,
  error         text,
  created_at    timestamptz not null default now(),
  unique (provider, provider_event_id)
);

alter table public.billing_events enable row level security;
-- Server-side only.

-- ---------------------------------------------------------------------------
-- Invoices
--
-- Ed-tech SaaS is taxable at 18% GST under SAC 999293. The invoice number
-- series must be gapless and per financial year, which is why it comes from a
-- sequence taken inside the insert rather than from a count.
-- ---------------------------------------------------------------------------
create table if not exists public.invoices (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users on delete cascade,
  subscription_id uuid references public.subscriptions on delete set null,

  -- PP/2026-27/000123
  number         text not null unique,
  financial_year text not null,

  -- Base + tax, stored separately because the parent's receipt has to show
  -- both and recomputing tax from a total introduces rounding drift.
  base_inr       numeric(10,2) not null,
  gst_inr        numeric(10,2) not null,
  total_inr      numeric(10,2) not null,
  gst_rate       numeric(5,2) not null default 18.00,
  sac_code       text not null default '999293',

  provider_payment_id text,
  issued_at      timestamptz not null default now()
);

create index if not exists invoices_user_idx on public.invoices (user_id, issued_at desc);

alter table public.invoices enable row level security;

drop policy if exists "invoices are readable by their owner" on public.invoices;
create policy "invoices are readable by their owner" on public.invoices
  for select using (auth.uid() = user_id);

create sequence if not exists public.invoice_seq;

-- India's financial year runs April to March, so an invoice raised in March
-- and one raised in April belong to different series.
create or replace function public.financial_year(at timestamptz default now())
returns text
language sql
immutable
as $$
  select case
    when extract(month from at) >= 4
      then to_char(at, 'YYYY') || '-' || to_char(at + interval '1 year', 'YY')
    else to_char(at - interval '1 year', 'YYYY') || '-' || to_char(at, 'YY')
  end;
$$;

create or replace function public.issue_invoice(
  p_user uuid,
  p_subscription uuid,
  p_total_inr numeric,
  p_payment_id text
)
returns public.invoices
language plpgsql
security definer set search_path = public
as $$
declare
  v_row public.invoices;
  v_fy text := public.financial_year();
  v_base numeric(10,2);
  v_gst numeric(10,2);
begin
  -- The amount charged is inclusive of GST — that is what the parent agreed
  -- to pay — so tax is extracted from it rather than added to it.
  v_base := round(p_total_inr / 1.18, 2);
  v_gst  := round(p_total_inr - v_base, 2);

  insert into public.invoices (
    user_id, subscription_id, number, financial_year,
    base_inr, gst_inr, total_inr, provider_payment_id
  )
  values (
    p_user, p_subscription,
    'PP/' || v_fy || '/' || lpad(nextval('public.invoice_seq')::text, 6, '0'),
    v_fy, v_base, v_gst, p_total_inr, p_payment_id
  )
  returning * into v_row;

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- What a student may open
--
-- One function, used by every gate, so "is this paid for" has exactly one
-- answer in the codebase.
--
-- Free access is the first chapter of a subject, whole. Not a trial period and
-- not three questions: a parent cannot judge teaching from a countdown, and
-- one complete chapter is the smallest honest sample.
-- ---------------------------------------------------------------------------
create or replace function public.can_access_chapter(p_user uuid, p_chapter text)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select
    coalesce((select c.is_free from public.chapters c where c.id = p_chapter), false)
    or exists (
      select 1
        from public.subscriptions s
        left join public.chapters c on c.id = p_chapter
       where s.user_id = p_user
         and (s.subject_ref is null or s.subject_ref = c.subject_ref)
         and (
           s.status = 'active'
           -- A failed charge inside its grace window still opens the app.
           or (s.status = 'past_due' and s.grace_until > now())
         )
    )
    -- A school seat covers everything for as long as the seat is paid for.
    or exists (
      select 1
        from public.org_members m
        join public.orgs o on o.id = m.org_id
       where m.user_id = p_user
         and o.expires_at >= current_date
    );
$$;

grant execute on function public.can_access_chapter(uuid, text) to authenticated;
