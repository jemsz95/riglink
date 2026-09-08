-- ============================================================================
-- Jobs and their lifecycle.
--
-- Status transitions are validated against a DATA TABLE rather than a
-- hardcoded CASE, so the legal state machine is queryable, testable, and
-- editable without touching function bodies. The same trigger writes the
-- history row, so history cannot be skipped by any write path.
-- ============================================================================

create type job_status as enum (
  'draft',            -- staff-created, not yet visible to the client
  'requested',        -- submitted through the portal, awaiting triage
  'triaged',          -- accepted by staff, needs a quote
  'quoted',           -- quote sent, awaiting the client
  'approved',         -- client approved the quote
  'scheduled',        -- visit(s) booked
  'in_progress',      -- first visit checked in
  'work_complete',    -- staff says done, awaiting client sign-off
  'client_accepted',  -- client approved the completed work
  'invoiced',
  'closed',
  'on_hold',
  'cancelled',
  'declined'          -- client declined the quote, or staff rejected the request
);

create type job_priority as enum ('low', 'normal', 'high', 'emergency');
create type job_source as enum ('client_portal', 'staff', 'phone', 'email');

-- ----------------------------------------------------------------------------
-- Per-org human-readable numbering.
--
-- A Postgres sequence cannot do this: it is global and leaves gaps on
-- rollback, which is unacceptable for documents customers reference by number.
-- ----------------------------------------------------------------------------

create table number_sequences (
  org_id     uuid not null references organizations (id) on delete cascade,
  kind       text not null,
  period     text not null default '',
  next_value bigint not null default 1,
  primary key (org_id, kind, period)
);
alter table number_sequences enable row level security;

create or replace function app.next_number(
  p_org uuid,
  p_kind text,
  p_period text default ''
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v bigint;
begin
  -- A single atomic statement: takes the row lock, increments and returns with
  -- no read-modify-write race. Concurrent inserts serialise on this one row per
  -- org, which is exactly the required behaviour for gapless numbering.
  insert into public.number_sequences as ns (org_id, kind, period, next_value)
  values (p_org, p_kind, p_period, 1)
  on conflict (org_id, kind, period)
    do update set next_value = ns.next_value + 1
  returning ns.next_value into v;

  return v;
end;
$$;

-- ----------------------------------------------------------------------------

create table jobs (
  id                      uuid primary key default gen_random_uuid(),
  org_id                  uuid not null references organizations (id) on delete cascade,
  client_id               uuid not null,
  site_id                 uuid,
  number                  bigint not null,
  title                   text not null check (length(btrim(title)) > 0),
  description             text,
  status                  job_status not null default 'draft',
  priority                job_priority not null default 'normal',
  source                  job_source not null default 'staff',
  requested_by_contact_id uuid references client_contacts (id) on delete set null,
  lead_tech_id            uuid references auth.users (id) on delete set null,
  requested_for           date,
  -- Denormalised from visits for dashboard sorting without a join.
  scheduled_start         timestamptz,
  scheduled_end           timestamptz,
  completed_at            timestamptz,
  closed_at               timestamptz,
  -- Staff-only; excluded from portal_job_v.
  internal_notes          text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  created_by              uuid references auth.users (id),

  constraint jobs_id_org_key unique (id, org_id),
  constraint jobs_org_number_key unique (org_id, number),
  constraint jobs_client_fk
    foreign key (client_id, org_id) references clients (id, org_id),
  constraint jobs_site_fk
    foreign key (site_id, org_id) references sites (id, org_id),
  constraint jobs_schedule_order
    check (scheduled_end is null or scheduled_start is null
           or scheduled_end >= scheduled_start)
);
alter table jobs enable row level security;

-- Dashboard: work in flight, most recently touched first.
create index jobs_org_status_updated_idx on jobs (org_id, status, updated_at desc);
-- Portal list, and the client-scoped RLS predicate.
create index jobs_org_client_created_idx on jobs (org_id, client_id, created_at desc);
create index jobs_client_status_idx on jobs (client_id, status);
-- "My jobs" for a technician.
create index jobs_org_lead_tech_idx on jobs (org_id, lead_tech_id)
  where status in ('scheduled', 'in_progress');
create index jobs_org_site_idx on jobs (org_id, site_id);

create trigger jobs_set_updated_at
  before update on jobs
  for each row execute function app.set_updated_at();

-- Assign the per-org number on insert unless one was supplied explicitly.
create or replace function app.assign_job_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.number is null then
    new.number := app.next_number(new.org_id, 'job');
  end if;
  return new;
end;
$$;

-- No need to relax the NOT NULL on `number`: Postgres evaluates constraints
-- AFTER BEFORE-ROW triggers, so the value assigned above satisfies it.
create trigger jobs_assign_number
  before insert on jobs
  for each row execute function app.assign_job_number();

-- ----------------------------------------------------------------------------
-- History and the legal state machine.
-- ----------------------------------------------------------------------------

create table job_status_events (
  id            bigint generated always as identity primary key,
  org_id        uuid not null,
  job_id        uuid not null,
  from_status   job_status,
  to_status     job_status not null,
  actor_user_id uuid references auth.users (id) on delete set null,
  actor_kind    text not null default 'staff'
                  check (actor_kind in ('staff', 'client', 'system')),
  reason        text,
  created_at    timestamptz not null default now(),
  constraint job_status_events_job_fk
    foreign key (job_id, org_id) references jobs (id, org_id) on delete cascade
);
alter table job_status_events enable row level security;

create index job_status_events_job_idx on job_status_events (job_id, created_at desc);

create table job_status_transitions (
  from_status job_status not null,
  to_status   job_status not null,
  actor_kind  text not null check (actor_kind in ('staff', 'client', 'system')),
  primary key (from_status, to_status, actor_kind)
);
alter table job_status_transitions enable row level security;

comment on table job_status_transitions is
  'Whitelist of legal status transitions per actor kind. Enforced by '
  'app.enforce_job_status(). Clients have no UPDATE policy on jobs at all -- '
  'their transitions happen inside SECURITY DEFINER RPCs which set '
  'app.actor_kind before writing.';

insert into job_status_transitions (from_status, to_status, actor_kind) values
  -- Staff: triage and quoting
  ('draft',           'requested',       'staff'),
  ('draft',           'triaged',         'staff'),
  ('draft',           'quoted',          'staff'),
  ('draft',           'cancelled',       'staff'),
  ('requested',       'triaged',         'staff'),
  ('requested',       'declined',        'staff'),
  ('requested',       'cancelled',       'staff'),
  ('triaged',         'quoted',          'staff'),
  ('triaged',         'on_hold',         'staff'),
  ('triaged',         'cancelled',       'staff'),
  ('quoted',          'triaged',         'staff'),
  ('quoted',          'on_hold',         'staff'),
  ('quoted',          'cancelled',       'staff'),
  -- Staff: execution
  ('approved',        'scheduled',       'staff'),
  ('approved',        'on_hold',         'staff'),
  ('approved',        'cancelled',       'staff'),
  ('scheduled',       'in_progress',     'staff'),
  ('scheduled',       'on_hold',         'staff'),
  ('scheduled',       'cancelled',       'staff'),
  ('in_progress',     'work_complete',   'staff'),
  ('in_progress',     'on_hold',         'staff'),
  ('in_progress',     'cancelled',       'staff'),
  ('work_complete',   'in_progress',     'staff'),
  ('work_complete',   'cancelled',       'staff'),
  -- Staff: billing
  ('client_accepted', 'invoiced',        'staff'),
  ('invoiced',        'closed',          'staff'),
  -- Staff: resuming a held job
  ('on_hold',         'triaged',         'staff'),
  ('on_hold',         'quoted',          'staff'),
  ('on_hold',         'approved',        'staff'),
  ('on_hold',         'scheduled',       'staff'),
  ('on_hold',         'in_progress',     'staff'),
  ('on_hold',         'cancelled',       'staff'),
  -- Client: the only four transitions a client may ever cause
  ('quoted',          'approved',        'client'),
  ('quoted',          'declined',        'client'),
  ('work_complete',   'client_accepted', 'client'),
  ('draft',           'requested',       'client');

create or replace function app.enforce_job_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_kind text := coalesce(
    nullif(current_setting('app.actor_kind', true), ''), 'staff'
  );
begin
  if new.status is distinct from old.status then
    if not exists (
      select 1
      from public.job_status_transitions t
      where t.from_status = old.status
        and t.to_status = new.status
        and t.actor_kind = v_actor_kind
    ) then
      raise exception
        'illegal job transition % -> % for actor %', old.status, new.status, v_actor_kind
        using errcode = 'check_violation';
    end if;

    insert into public.job_status_events
      (org_id, job_id, from_status, to_status, actor_user_id, actor_kind)
    values
      (new.org_id, new.id, old.status, new.status, (select auth.uid()), v_actor_kind);
  end if;

  return new;
end;
$$;

create trigger jobs_enforce_status
  before update of status on jobs
  for each row execute function app.enforce_job_status();
