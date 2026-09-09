-- ============================================================================
-- Quotes: the money document, and the approval that freezes it.
--
-- THE ARITHMETIC IS DEFINED HERE AND NOWHERE ELSE. Line totals and per-line
-- tax are GENERATED STORED columns, header totals are derived from the lines
-- by trigger, and src/features/quotes/totals.ts mirrors these exact formulas
-- so the editor, the printed quote, the invoice and the CSV export cannot
-- disagree. Postgres `round(numeric)` rounds half AWAY FROM ZERO, which
-- differs from JavaScript's Math.round on negatives -- discount lines are
-- negative, so that difference is real and the TS side compensates.
-- ============================================================================

create type quote_status as enum (
  'draft',       -- staff editing; invisible to the client
  'sent',        -- awaiting the client's decision
  'approved',
  'declined',
  'superseded',  -- replaced by a newer quote on the same job
  'expired'
);

create type line_kind as enum ('material', 'labor', 'discount', 'other');

-- ---------------------------------------------------------------------------
-- Price book. Optional: a line item may be free-typed.
-- ---------------------------------------------------------------------------
create table catalog_items (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references organizations (id) on delete cascade,
  kind             line_kind not null default 'material',
  sku              text,
  name             text not null check (length(btrim(name)) > 0),
  description      text,
  unit             text not null default 'each',
  unit_price_cents bigint not null default 0,
  tax_rate         numeric(6, 4) not null default 0
                     check (tax_rate >= 0 and tax_rate <= 1),
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid references auth.users (id),
  constraint catalog_items_id_org_key unique (id, org_id),
  constraint catalog_items_org_sku_key unique (org_id, sku)
);
alter table catalog_items enable row level security;

create index catalog_items_org_active_idx on catalog_items (org_id, kind)
  where active;

create trigger catalog_items_set_updated_at
  before update on catalog_items
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- A FK target for the (job, client) pair.
--
-- `jobs` already exposes `unique (id, org_id)` for the same reason. `id` alone
-- is the primary key, so this index is redundant for lookups and exists purely
-- so a child table can reference the PAIR -- which is what makes a
-- denormalised `client_id` on quotes provably equal to its job's client rather
-- than merely intended to be.
-- ---------------------------------------------------------------------------
alter table jobs
  add constraint jobs_id_client_key unique (id, client_id);

-- ---------------------------------------------------------------------------
-- Quotes.
--
-- `client_id` is denormalised from the job so the portal's RLS predicate is a
-- single indexed column rather than a join. It cannot drift: the composite FK
-- references jobs (id, client_id), so the pair must already exist together.
-- ---------------------------------------------------------------------------
create table quotes (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations (id) on delete cascade,
  job_id         uuid not null,
  client_id      uuid not null,
  number         bigint not null,
  status         quote_status not null default 'draft',
  currency       text not null default 'USD',
  -- Maintained by trigger from the line items. Never trust a client write.
  subtotal_cents bigint not null default 0,
  tax_cents      bigint not null default 0,
  total_cents    bigint not null default 0,
  notes          text,     -- shown to the client
  terms          text,     -- shown to the client
  internal_note  text,     -- staff only; excluded from portal_quote_v
  valid_until    date,
  sent_at        timestamptz,
  -- Set when the quote is sent. Non-null means the line items are frozen.
  locked_at      timestamptz,
  decided_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid references auth.users (id),

  constraint quotes_id_org_key unique (id, org_id),
  -- Lets quote_line_items FK the (quote_id, client_id) pair, which is what
  -- makes the denormalised client_id on the line provably correct.
  constraint quotes_id_client_key unique (id, client_id),
  constraint quotes_org_number_key unique (org_id, number),
  constraint quotes_job_fk
    foreign key (job_id, org_id) references jobs (id, org_id) on delete cascade,
  constraint quotes_job_client_fk
    foreign key (job_id, client_id) references jobs (id, client_id),
  constraint quotes_sent_has_lock
    check ((status = 'draft') = (locked_at is null)),
  constraint quotes_decided_has_timestamp
    check ((status in ('approved', 'declined')) = (decided_at is not null))
);
alter table quotes enable row level security;

create index quotes_org_status_idx on quotes (org_id, status, updated_at desc);
create index quotes_job_idx on quotes (job_id, created_at desc);
create index quotes_client_status_idx on quotes (client_id, status);

create trigger quotes_set_updated_at
  before update on quotes
  for each row execute function app.set_updated_at();

create or replace function app.assign_quote_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.number is null then
    new.number := app.next_number(new.org_id, 'quote');
  end if;
  return new;
end;
$$;

create trigger quotes_assign_number
  before insert on quotes
  for each row execute function app.assign_quote_number();

-- ---------------------------------------------------------------------------
-- Line items.
--
-- A discount is a line with a negative unit price, not a special column: it
-- then flows through the same rounding, the same tax treatment and the same
-- export as everything else. One code path, no discount-shaped exceptions.
-- ---------------------------------------------------------------------------
create table quote_line_items (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references organizations (id) on delete cascade,
  quote_id         uuid not null,
  client_id        uuid not null,
  position         integer not null,
  kind             line_kind not null default 'material',
  catalog_item_id  uuid,
  description      text not null check (length(btrim(description)) > 0),
  unit             text not null default 'each',
  quantity         numeric(12, 3) not null check (quantity <> 0),
  unit_price_cents bigint not null,
  tax_rate         numeric(6, 4) not null default 0
                     check (tax_rate >= 0 and tax_rate <= 1),

  -- THE formula. round() on numeric is half-away-from-zero.
  line_total_cents bigint
    generated always as (round(quantity * unit_price_cents)) stored,
  -- Tax on the ROUNDED line total, not on the raw product: the client is
  -- taxed on the amount actually charged, and this makes the header a plain
  -- sum instead of a re-derivation that could round differently.
  line_tax_cents   bigint
    generated always as (
      round(round(quantity * unit_price_cents) * tax_rate)
    ) stored,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint quote_line_items_quote_fk
    foreign key (quote_id, org_id) references quotes (id, org_id) on delete cascade,
  -- Structural guarantee that the line's client matches its quote's client.
  constraint quote_line_items_quote_client_fk
    foreign key (quote_id, client_id) references quotes (id, client_id) on delete cascade,
  constraint quote_line_items_catalog_fk
    foreign key (catalog_item_id, org_id) references catalog_items (id, org_id)
      on delete set null,
  constraint quote_line_items_quote_position_key unique (quote_id, position)
    deferrable initially deferred
);
alter table quote_line_items enable row level security;

create index quote_line_items_quote_idx on quote_line_items (quote_id, position);
create index quote_line_items_client_idx on quote_line_items (client_id);

create trigger quote_line_items_set_updated_at
  before update on quote_line_items
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- Header totals.
--
-- STATEMENT-level triggers with transition tables, so one batch upsert of 30
-- lines recomputes each affected quote ONCE rather than 30 times. (A deferred
-- per-row constraint trigger would defer the work to commit but still run it
-- per row.)
--
-- Also runs BEFORE INSERT/UPDATE on quotes itself, which is what makes the
-- totals untamperable: a client that PATCHes total_cents directly has it
-- recomputed from the lines in the same statement.
-- ---------------------------------------------------------------------------
create or replace function app.recompute_quote_totals(p_quote_ids uuid[])
returns void
language sql
security definer
set search_path = ''
as $$
  update public.quotes q
  set subtotal_cents = coalesce(agg.subtotal, 0),
      tax_cents      = coalesce(agg.tax, 0),
      total_cents    = coalesce(agg.subtotal, 0) + coalesce(agg.tax, 0)
  from (select unnest(p_quote_ids) as id) target
  left join lateral (
    select sum(li.line_total_cents) as subtotal, sum(li.line_tax_cents) as tax
    from public.quote_line_items li
    where li.quote_id = target.id
  ) agg on true
  where q.id = target.id
    and (q.subtotal_cents, q.tax_cents, q.total_cents)
        is distinct from
        (coalesce(agg.subtotal, 0), coalesce(agg.tax, 0),
         coalesce(agg.subtotal, 0) + coalesce(agg.tax, 0));
$$;

create or replace function app.quote_lines_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
begin
  if tg_op = 'DELETE' then
    select array_agg(distinct quote_id) into v_ids from removed;
  elsif tg_op = 'UPDATE' then
    select array_agg(distinct id) into v_ids from (
      select quote_id as id from removed
      union select quote_id from added
    ) both_sides;
  else
    select array_agg(distinct quote_id) into v_ids from added;
  end if;

  if v_ids is not null then
    perform app.recompute_quote_totals(v_ids);
  end if;
  return null;
end;
$$;

create trigger quote_lines_insert_totals
  after insert on quote_line_items
  referencing new table as added
  for each statement execute function app.quote_lines_changed();

create trigger quote_lines_update_totals
  after update on quote_line_items
  referencing new table as added old table as removed
  for each statement execute function app.quote_lines_changed();

create trigger quote_lines_delete_totals
  after delete on quote_line_items
  referencing old table as removed
  for each statement execute function app.quote_lines_changed();

-- Totals are derived, so a direct write to them is ignored rather than
-- trusted. Recomputed from the lines on every insert and update of the header.
create or replace function app.quote_totals_from_lines()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subtotal bigint;
  v_tax      bigint;
begin
  select coalesce(sum(line_total_cents), 0), coalesce(sum(line_tax_cents), 0)
  into v_subtotal, v_tax
  from public.quote_line_items
  where quote_id = new.id;

  new.subtotal_cents := v_subtotal;
  new.tax_cents      := v_tax;
  new.total_cents    := v_subtotal + v_tax;
  return new;
end;
$$;

create trigger quotes_totals_guard
  before insert or update on quotes
  for each row execute function app.quote_totals_from_lines();

-- ---------------------------------------------------------------------------
-- Immutability once sent.
--
-- An approved quote is the contractual document; if its lines can still be
-- edited, the approval snapshot and the live quote diverge and the audit trail
-- is worthless. `locked_at` is set when the quote is sent, and after that the
-- lines are frozen for everyone -- including owners, and including the
-- SECURITY DEFINER RPCs, because this is a trigger rather than a policy.
-- ---------------------------------------------------------------------------
create or replace function app.enforce_quote_lock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quote_id uuid := coalesce(new.quote_id, old.quote_id);
  v_locked   timestamptz;
begin
  select locked_at into v_locked from public.quotes where id = v_quote_id;

  if v_locked is not null then
    raise exception
      'quote % is locked (sent %s); its line items cannot be changed',
      v_quote_id, v_locked
      using errcode = 'check_violation',
            hint = 'supersede the quote with a new revision instead';
  end if;

  return coalesce(new, old);
end;
$$;

create trigger quote_line_items_locked
  before insert or update or delete on quote_line_items
  for each row execute function app.enforce_quote_lock();

-- ---------------------------------------------------------------------------
-- Approvals: append-only, with the snapshot that settles disputes.
--
-- `snapshot` freezes the exact lines and totals the client saw at the moment
-- they decided. Without it a later edit silently rewrites history and the
-- dispute is unwinnable.
-- ---------------------------------------------------------------------------
create type approval_kind as enum ('quote', 'completion');
create type approval_decision as enum ('approved', 'declined');

create table approvals (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references organizations (id) on delete cascade,
  job_id           uuid not null,
  client_id        uuid not null,
  quote_id         uuid,
  kind             approval_kind not null,
  decision         approval_decision not null,
  -- Who decided. The contact row is the durable identity: it survives the
  -- person losing their login, which is exactly when a dispute surfaces.
  actor_contact_id uuid references client_contacts (id) on delete set null,
  actor_user_id    uuid references auth.users (id) on delete set null,
  note             text,
  snapshot         jsonb not null,
  created_at       timestamptz not null default now(),

  constraint approvals_job_fk
    foreign key (job_id, org_id) references jobs (id, org_id) on delete cascade,
  constraint approvals_quote_fk
    foreign key (quote_id, org_id) references quotes (id, org_id),
  constraint approvals_quote_required
    check ((kind = 'quote') = (quote_id is not null))
);
alter table approvals enable row level security;

create index approvals_job_idx on approvals (job_id, created_at desc);
create index approvals_org_kind_idx on approvals (org_id, kind, created_at desc);
create index approvals_client_idx on approvals (client_id);

comment on table approvals is
  'Append-only record of client decisions. No UPDATE or DELETE policy exists '
  'for anyone, including owners: the snapshot is evidence, and evidence that '
  'can be edited is not evidence.';

-- ============================================================================
-- RLS.
--
-- Note what is ABSENT: no policy mentions `app.staff_orgs()`. Money is scoped
-- to owner/admin/dispatcher via `app.orgs_with_role`, so a `tech` has no
-- policy on any table in this migration and therefore cannot read a price,
-- a total, or an approval snapshot. Supabase has a single `authenticated`
-- role, so per-column grants cannot distinguish a tech from an admin --
-- withholding the policy entirely is the only mechanism that works.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- catalog_items
-- ---------------------------------------------------------------------------
create policy catalog_items_staff_select on catalog_items
  for select to authenticated
  using (org_id = any ((select app.orgs_with_role(array['owner', 'admin', 'dispatcher']))::uuid[]));

create policy catalog_items_admin_write on catalog_items
  for all to authenticated
  using (org_id = any ((select app.orgs_with_role(array['owner', 'admin']))::uuid[]))
  with check (org_id = any ((select app.orgs_with_role(array['owner', 'admin']))::uuid[]));

-- ---------------------------------------------------------------------------
-- quotes
-- ---------------------------------------------------------------------------
create policy quotes_staff_select on quotes
  for select to authenticated
  using (org_id = any ((select app.orgs_with_role(array['owner', 'admin', 'dispatcher']))::uuid[]));

-- Drafts are invisible to the client, which is what lets staff prepare a
-- quote, get it wrong, and fix it without anyone watching.
create policy quotes_portal_select on quotes
  for select to authenticated
  using (
    client_id = any ((select app.portal_clients())::uuid[])
    and status <> 'draft'
  );

create policy quotes_staff_insert on quotes
  for insert to authenticated
  with check (org_id = any ((select app.orgs_with_role(array['owner', 'admin', 'dispatcher']))::uuid[]));

create policy quotes_staff_update on quotes
  for update to authenticated
  using (org_id = any ((select app.orgs_with_role(array['owner', 'admin', 'dispatcher']))::uuid[]))
  with check (org_id = any ((select app.orgs_with_role(array['owner', 'admin', 'dispatcher']))::uuid[]));

-- Only drafts are deletable. A sent quote is a document the client has seen;
-- it gets superseded, never erased.
create policy quotes_admin_delete_draft on quotes
  for delete to authenticated
  using (
    org_id = any ((select app.orgs_with_role(array['owner', 'admin']))::uuid[])
    and status = 'draft'
  );

-- ---------------------------------------------------------------------------
-- quote_line_items
-- ---------------------------------------------------------------------------
create policy quote_line_items_staff_all on quote_line_items
  for all to authenticated
  using (org_id = any ((select app.orgs_with_role(array['owner', 'admin', 'dispatcher']))::uuid[]))
  with check (org_id = any ((select app.orgs_with_role(array['owner', 'admin', 'dispatcher']))::uuid[]));

-- The client_id check is the cheap indexed filter and runs first; the EXISTS
-- only evaluates for rows that already belong to the caller's client, and a
-- quote has tens of lines rather than thousands. This is the one place a
-- per-row lookup is preferred over denormalising, because a `client_visible`
-- boolean maintained by trigger can drift out of step with quote status --
-- and drift here means showing a client an unsent price.
create policy quote_line_items_portal_select on quote_line_items
  for select to authenticated
  using (
    client_id = any ((select app.portal_clients())::uuid[])
    and exists (
      select 1 from public.quotes q
      where q.id = quote_line_items.quote_id
        and q.status <> 'draft'
    )
  );

-- ---------------------------------------------------------------------------
-- approvals: readable by both sides, writable by neither.
--
-- No INSERT policy at all -- rows arrive only through the SECURITY DEFINER
-- RPCs, which is the single audited path. No UPDATE or DELETE policy for
-- anyone, including owners.
-- ---------------------------------------------------------------------------
create policy approvals_staff_select on approvals
  for select to authenticated
  using (org_id = any ((select app.orgs_with_role(array['owner', 'admin', 'dispatcher']))::uuid[]));

create policy approvals_portal_select on approvals
  for select to authenticated
  using (client_id = any ((select app.portal_clients())::uuid[]));

-- ============================================================================
-- Grants.
--
-- Explicit and minimal, because `[api].auto_expose_new_tables = false` means
-- these tables arrive with NO privileges. Nothing is granted to `anon`: every
-- surface that touches a quote requires a session, so anon needs no reach at
-- all -- and a table anon cannot address is one that a future policy mistake
-- cannot expose.
--
-- quote_line_items does get DELETE, because the editor removes rows. TRUNCATE
-- is granted nowhere, and `approvals` gets SELECT only -- an append-only table
-- whose only writer is a definer RPC needs no INSERT privilege at the role
-- level either.
-- ============================================================================
grant select, insert, update, delete on public.catalog_items to authenticated;
grant select, insert, update, delete on public.quotes to authenticated;
grant select, insert, update, delete on public.quote_line_items to authenticated;
grant select on public.approvals to authenticated;

grant all on public.catalog_items, public.quotes, public.quote_line_items,
             public.approvals to service_role;
