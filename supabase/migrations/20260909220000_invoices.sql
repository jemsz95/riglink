-- ============================================================================
-- Phase 5: completion sign-off and invoicing.
--
-- Phase 1 already reserved the vocabulary for this, which is why almost
-- nothing here is new invention:
--
--   job_status        work_complete -> client_accepted -> invoiced -> closed
--   approval_kind     'completion' alongside 'quote'
--   organizations     invoice_prefix, invoice_terms_days
--   number_sequences  keyed (org_id, kind, period), so kind = 'invoice'
--
-- and, critically, `job_status_transitions` already holds
--
--   work_complete -> client_accepted   actor_kind = client
--
-- so a sign-off is structurally a CLIENT act. Staff cannot mark their own work
-- as accepted by the customer, for the same reason they cannot approve their
-- own quote: the trigger checks the actor against that table, and the only
-- route with `actor_kind = 'client'` is a definer RPC that verifies the caller
-- is an approving contact.
--
-- MONEY IS COPIED, NOT RE-DERIVED
--
-- `invoice_line_items` uses byte-identical generated-column expressions to
-- `quote_line_items`:
--
--   round(quantity * unit_price_cents)
--   round(round(quantity * unit_price_cents) * tax_rate)
--
-- Not similar -- identical, deliberately. An invoice that disagreed with the
-- quote the client approved by one cent is a dispute, and the cheapest way to
-- guarantee agreement is for both to be the same SQL over the same numeric
-- type. `numeric` is exact decimal and `round()` goes half away from zero, so
-- a discount line rounds the same way on both documents. The TypeScript
-- `computeTotals` already matches this and is tested against Postgres-generated
-- fixtures; it now serves three documents instead of two.
--
-- WHAT AN INVOICE IS FOR HERE
--
-- No payments. Money moves through whatever the contractor already uses, and
-- this system's job ends at a CSV an accountant can import. So `paid_at` is a
-- fact somebody records, not the result of a webhook -- which is why marking
-- paid is an ordinary update and not an RPC.
-- ============================================================================

create type public.invoice_status as enum ('draft', 'sent', 'paid', 'void');

create table public.invoices (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations (id) on delete cascade,
  job_id         uuid not null,
  client_id      uuid not null,
  -- The quote this was raised from, when there was one. Nullable: a small
  -- job can be invoiced without ever having been quoted.
  quote_id       uuid,

  number         bigint not null,
  status         public.invoice_status not null default 'draft',
  currency       text not null default 'USD',

  subtotal_cents bigint not null default 0,
  tax_cents      bigint not null default 0,
  total_cents    bigint not null default 0,

  notes          text,
  terms          text,

  issued_at      timestamptz,
  due_at         date,
  paid_at        timestamptz,
  voided_at      timestamptz,
  -- Free text: "cheque 4471", "BACS 12 Sep". Client-facing on purpose -- it is
  -- their payment, and hiding it invites "we paid that" phone calls.
  payment_ref    text,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid references public.profiles (id) on delete set null,

  constraint invoices_job_fk
    foreign key (job_id, org_id) references public.jobs (id, org_id) on delete cascade,
  constraint invoices_job_client_fk
    foreign key (job_id, client_id) references public.jobs (id, client_id) on delete cascade,
  constraint invoices_quote_fk
    foreign key (quote_id, org_id) references public.quotes (id, org_id) on delete set null,

  constraint invoices_org_number_key unique (org_id, number),
  constraint invoices_id_org_key unique (id, org_id),
  constraint invoices_id_client_key unique (id, client_id),

  -- A draft has not been issued; anything else has. Same shape as
  -- quotes_sent_has_lock, and the reason is the same: a status and its
  -- timestamp that can disagree will eventually disagree.
  constraint invoices_issued_has_timestamp
    check ((status = 'draft') = (issued_at is null)),
  constraint invoices_paid_has_timestamp
    check ((status = 'paid') = (paid_at is not null)),
  constraint invoices_void_has_timestamp
    check ((status = 'void') = (voided_at is not null)),
  constraint invoices_totals_non_negative
    check (total_cents >= 0)
);

create index invoices_org_status_idx on public.invoices (org_id, status, created_at desc);
create index invoices_job_idx on public.invoices (job_id, created_at desc);
create index invoices_client_idx on public.invoices (client_id, created_at desc);
create index invoices_quote_idx on public.invoices (quote_id);
create index invoices_created_by_idx on public.invoices (created_by);
-- The export reads one org's issued invoices in a date window.
create index invoices_org_issued_idx on public.invoices (org_id, issued_at)
  where issued_at is not null;

create table public.invoice_line_items (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations (id) on delete cascade,
  invoice_id       uuid not null,
  client_id        uuid not null,
  position         integer not null,
  kind             public.line_kind not null default 'material',
  catalog_item_id  uuid,
  description      text not null,
  unit             text not null default 'each',
  quantity         numeric(12, 3) not null,
  unit_price_cents bigint not null,
  tax_rate         numeric(6, 4) not null default 0,

  -- IDENTICAL to quote_line_items. See the header comment.
  line_total_cents bigint generated always as (round(quantity * unit_price_cents)) stored,
  line_tax_cents   bigint generated always as (round(round(quantity * unit_price_cents) * tax_rate)) stored,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint invoice_line_items_invoice_fk
    foreign key (invoice_id, org_id) references public.invoices (id, org_id) on delete cascade,
  constraint invoice_line_items_invoice_client_fk
    foreign key (invoice_id, client_id) references public.invoices (id, client_id) on delete cascade,
  constraint invoice_line_items_catalog_fk
    foreign key (catalog_item_id, org_id) references public.catalog_items (id, org_id) on delete set null,

  -- Deferrable so a reorder passes as one statement without tripping on an
  -- intermediate collision.
  constraint invoice_line_items_invoice_position_key
    unique (invoice_id, position) deferrable initially deferred,

  constraint invoice_line_items_description_check check (length(btrim(description)) > 0),
  constraint invoice_line_items_quantity_check check (quantity <> 0),
  constraint invoice_line_items_tax_rate_check check (tax_rate >= 0 and tax_rate <= 1)
);

create index invoice_line_items_invoice_idx
  on public.invoice_line_items (invoice_id, position);
create index invoice_line_items_org_idx on public.invoice_line_items (org_id);
create index invoice_line_items_catalog_idx on public.invoice_line_items (catalog_item_id);

-- ----------------------------------------------------------------------------
-- Numbering, totals and the lock. Same three mechanisms as quotes.
-- ----------------------------------------------------------------------------

create or replace function app.assign_invoice_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.number is null then
    new.number := app.next_number(new.org_id, 'invoice', null);
  end if;
  return new;
end;
$$;

create trigger invoices_assign_number before insert on public.invoices
  for each row execute function app.assign_invoice_number();

create trigger invoices_updated_at before update on public.invoices
  for each row execute function app.set_updated_at();
create trigger invoice_line_items_updated_at before update on public.invoice_line_items
  for each row execute function app.set_updated_at();

create or replace function app.recompute_invoice_totals(p_invoice_ids uuid[])
returns void
language sql
security definer
set search_path = ''
as $$
  update public.invoices i
  set subtotal_cents = coalesce(agg.subtotal, 0),
      tax_cents      = coalesce(agg.tax, 0),
      total_cents    = coalesce(agg.subtotal, 0) + coalesce(agg.tax, 0)
  from (select unnest(p_invoice_ids) as id) target
  left join lateral (
    select sum(li.line_total_cents) as subtotal, sum(li.line_tax_cents) as tax
    from public.invoice_line_items li
    where li.invoice_id = target.id
  ) agg on true
  where i.id = target.id
    and (i.subtotal_cents, i.tax_cents, i.total_cents)
        is distinct from
        (coalesce(agg.subtotal, 0), coalesce(agg.tax, 0),
         coalesce(agg.subtotal, 0) + coalesce(agg.tax, 0));
$$;

-- Statement-level with transition tables, so one batch insert of twenty lines
-- recomputes the header once rather than twenty times.
create or replace function app.invoice_lines_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
begin
  if tg_op = 'DELETE' then
    select array_agg(distinct invoice_id) into v_ids from removed;
  elsif tg_op = 'UPDATE' then
    select array_agg(distinct id) into v_ids from (
      select invoice_id as id from removed
      union select invoice_id from added
    ) both_sides;
  else
    select array_agg(distinct invoice_id) into v_ids from added;
  end if;

  if v_ids is not null then
    perform app.recompute_invoice_totals(v_ids);
  end if;
  return null;
end;
$$;

create trigger invoice_lines_insert_totals
  after insert on public.invoice_line_items
  referencing new table as added
  for each statement execute function app.invoice_lines_changed();

create trigger invoice_lines_update_totals
  after update on public.invoice_line_items
  referencing new table as added old table as removed
  for each statement execute function app.invoice_lines_changed();

create trigger invoice_lines_delete_totals
  after delete on public.invoice_line_items
  referencing old table as removed
  for each statement execute function app.invoice_lines_changed();

-- Header totals are re-derived from the lines on every update, so they cannot
-- be tampered with by sending different numbers in the payload.
create or replace function app.invoice_totals_from_lines()
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
  from public.invoice_line_items
  where invoice_id = new.id;

  new.subtotal_cents := v_subtotal;
  new.tax_cents      := v_tax;
  new.total_cents    := v_subtotal + v_tax;
  return new;
end;
$$;

create trigger invoices_totals_guard before update on public.invoices
  for each row execute function app.invoice_totals_from_lines();

-- Once issued, the lines are frozen. An invoice the client has been sent is a
-- demand for a specific amount; changing it silently is how disputes start.
-- Correct it with a credit or a void and reissue.
create or replace function app.enforce_invoice_lock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice_id uuid := coalesce(new.invoice_id, old.invoice_id);
  v_issued     timestamptz;
begin
  select issued_at into v_issued from public.invoices where id = v_invoice_id;

  if v_issued is not null then
    raise exception
      'invoice % was issued (%); its line items cannot be changed',
      v_invoice_id, v_issued
      using errcode = 'check_violation',
            hint = 'void the invoice and raise a new one instead';
  end if;

  return coalesce(new, old);
end;
$$;

create trigger invoice_line_items_lock
  before insert or update or delete on public.invoice_line_items
  for each row execute function app.enforce_invoice_lock();

-- ----------------------------------------------------------------------------
-- RLS. Invoices are money, so the quote posture applies: dispatch roles only,
-- and a tech reads nothing. No policy here mentions app.staff_orgs().
-- ----------------------------------------------------------------------------

alter table public.invoices enable row level security;
alter table public.invoice_line_items enable row level security;

create policy invoices_staff_select on public.invoices
  for select to authenticated
  using (org_id = any ((select app.orgs_with_role(array['owner', 'admin', 'dispatcher']))::uuid[]));

-- The client sees an invoice once it has been issued. A draft is staff working
-- out what to charge.
create policy invoices_portal_select on public.invoices
  for select to authenticated
  using (
    client_id = any ((select app.portal_clients())::uuid[])
    and status <> 'draft'
  );

create policy invoices_staff_insert on public.invoices
  for insert to authenticated
  with check (org_id = any ((select app.orgs_with_role(array['owner', 'admin', 'dispatcher']))::uuid[]));

create policy invoices_staff_update on public.invoices
  for update to authenticated
  using (org_id = any ((select app.orgs_with_role(array['owner', 'admin', 'dispatcher']))::uuid[]))
  with check (org_id = any ((select app.orgs_with_role(array['owner', 'admin', 'dispatcher']))::uuid[]));

-- Only a draft can be deleted, and only by an owner or admin. An issued
-- invoice is a record: it gets voided, never removed.
create policy invoices_admin_delete_draft on public.invoices
  for delete to authenticated
  using (
    org_id = any ((select app.orgs_with_role(array['owner', 'admin']))::uuid[])
    and status = 'draft'
  );

create policy invoice_line_items_staff_all on public.invoice_line_items
  for all to authenticated
  using (org_id = any ((select app.orgs_with_role(array['owner', 'admin', 'dispatcher']))::uuid[]))
  with check (org_id = any ((select app.orgs_with_role(array['owner', 'admin', 'dispatcher']))::uuid[]));

create policy invoice_line_items_portal_select on public.invoice_line_items
  for select to authenticated
  using (
    client_id = any ((select app.portal_clients())::uuid[])
    and exists (
      select 1 from public.invoices i
      where i.id = invoice_line_items.invoice_id
        and i.status <> 'draft'
    )
  );

grant select, insert, update, delete on public.invoices to authenticated;
grant select, insert, update, delete on public.invoice_line_items to authenticated;

-- ----------------------------------------------------------------------------
-- Portal projections.
--
-- Note what is NOT here and never will be: there is no internal note column on
-- `invoices`. Per the project standard, a staff-only FIELD on a row a client
-- can see belongs in a side table (`invoice_internal_notes`), not on the
-- invoice with the portal policy sitting next to it. None is needed yet, so
-- none exists.
-- ----------------------------------------------------------------------------

create view public.portal_invoice_v with (security_invoker = on) as
select
  i.id,
  i.org_id,
  i.job_id,
  i.client_id,
  i.number,
  i.status,
  i.currency,
  i.subtotal_cents,
  i.tax_cents,
  i.total_cents,
  i.notes,
  i.terms,
  i.issued_at,
  i.due_at,
  i.paid_at,
  i.payment_ref,
  i.created_at
from public.invoices i;

create view public.portal_invoice_line_v with (security_invoker = on) as
select
  li.id,
  li.org_id,
  li.invoice_id,
  li.client_id,
  li.position,
  li.kind,
  li.description,
  li.unit,
  li.quantity,
  li.unit_price_cents,
  li.tax_rate,
  li.line_total_cents,
  li.line_tax_cents
from public.invoice_line_items li;

comment on view public.portal_invoice_v is
  'Issued invoices for a client. security_invoker = on: rows come from '
  'invoices_portal_select, which hides drafts.';
comment on view public.portal_invoice_line_v is
  'Lines of an issued invoice; hidden while the invoice is a draft.';

grant select on public.portal_invoice_v to authenticated;
grant select on public.portal_invoice_line_v to authenticated;
