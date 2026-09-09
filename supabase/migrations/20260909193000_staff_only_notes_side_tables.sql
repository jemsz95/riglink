-- ============================================================================
-- Staff-only notes move to side tables. Structural absence, for real.
--
-- WHY, AGAIN
--
-- `20260909184500` closed the portal column leak by taking base-table row
-- access away from contacts and making the four `portal_*_v` views
-- owner-rights. That worked, and was verified, but it costs a permanent
-- ERROR-level advisor finding (`0010_security_definer_view`) on all four
-- views. splinter -- the linter behind the advisors -- runs SQL against the
-- catalog rather than reading migrations, so there is no comment, config or
-- dashboard setting that can suppress it; `cache_key` exists in its lint
-- interface for an exclusion list that has no user-facing implementation. A
-- standing red ERROR teaches people to stop reading advisors, which costs more
-- than it saves.
--
-- So the leak gets closed the other way instead: the five columns a contact
-- must never see stop existing on tables a contact can read.
--
--   jobs.internal_notes    -> job_internal_notes.notes
--   clients.notes          -> client_internal_notes.notes
--   sites.access_notes     -> site_access_notes.notes
--   quotes.internal_note   -> quote_internal_notes.notes
--
-- `jobs.lead_tech_id` deliberately stays put. It is a bare UUID with no name
-- or email attached, the job list renders it and the tech-update policy keys
-- off it, so moving it would contort the assignment model to hide something of
-- almost no value. A contact learning that some uuid is assigned is the
-- residual, and it is written down here rather than left implied.
--
-- The next migration restores the portal's base-table policies and returns the
-- portal views to `security_invoker = on`. After both, the portal read path has
-- two independent locks again -- an RLS row filter AND a column projection --
-- and the advisor is clean.
--
-- THE TRADE THIS MAKES INSTEAD
--
-- Discipline. A new staff-only column added to `jobs`, `clients`, `sites` or
-- `quotes` will leak to contacts exactly as these five did, and no lint will
-- say so. That is the standing cost of this design, and the reason the README
-- names these four tables explicitly.
--
-- Absence is the encoding of "no note": `notes` is NOT NULL and non-blank, so
-- clearing a note deletes the row. The RPCs below do that.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. The side tables.
--
-- Composite FK `(parent_id, org_id) -> parent (id, org_id)` on every one, so a
-- note cannot be attached across tenants even if a policy were wrong. Each
-- parent already carries the required `unique (id, org_id)`.
-- ----------------------------------------------------------------------------

create table public.job_internal_notes (
  job_id     uuid primary key,
  org_id     uuid not null,
  notes      text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  constraint job_internal_notes_job_fk
    foreign key (job_id, org_id) references public.jobs (id, org_id) on delete cascade,
  constraint job_internal_notes_not_blank check (length(btrim(notes)) > 0)
);

create table public.client_internal_notes (
  client_id  uuid primary key,
  org_id     uuid not null,
  notes      text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  constraint client_internal_notes_client_fk
    foreign key (client_id, org_id) references public.clients (id, org_id) on delete cascade,
  constraint client_internal_notes_not_blank check (length(btrim(notes)) > 0)
);

create table public.site_access_notes (
  site_id    uuid primary key,
  org_id     uuid not null,
  notes      text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  constraint site_access_notes_site_fk
    foreign key (site_id, org_id) references public.sites (id, org_id) on delete cascade,
  constraint site_access_notes_not_blank check (length(btrim(notes)) > 0)
);

create table public.quote_internal_notes (
  quote_id   uuid primary key,
  org_id     uuid not null,
  notes      text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  constraint quote_internal_notes_quote_fk
    foreign key (quote_id, org_id) references public.quotes (id, org_id) on delete cascade,
  constraint quote_internal_notes_not_blank check (length(btrim(notes)) > 0)
);

create trigger job_internal_notes_updated_at before update on public.job_internal_notes
  for each row execute function app.set_updated_at();
create trigger client_internal_notes_updated_at before update on public.client_internal_notes
  for each row execute function app.set_updated_at();
create trigger site_access_notes_updated_at before update on public.site_access_notes
  for each row execute function app.set_updated_at();
create trigger quote_internal_notes_updated_at before update on public.quote_internal_notes
  for each row execute function app.set_updated_at();

-- ----------------------------------------------------------------------------
-- 2. Policies, mirroring the parent tables exactly.
--
-- Read access matches the parent's staff SELECT policy and write access its
-- staff INSERT/UPDATE policy, so moving a column changes no one's permissions.
-- The one that differs is quotes: nothing on the quote surface mentions
-- `app.staff_orgs()`, because techs are excluded from money by having no
-- policy at all. Its note table follows that, not the others.
-- ----------------------------------------------------------------------------

alter table public.job_internal_notes    enable row level security;
alter table public.client_internal_notes enable row level security;
alter table public.site_access_notes     enable row level security;
alter table public.quote_internal_notes  enable row level security;

create policy job_internal_notes_staff_select on public.job_internal_notes
  for select to authenticated
  using (org_id = any ((select app.staff_orgs())::uuid[]));

create policy job_internal_notes_staff_write on public.job_internal_notes
  for all to authenticated
  using (org_id = any ((select app.orgs_with_role(array['owner', 'admin', 'dispatcher']))::uuid[]))
  with check (org_id = any ((select app.orgs_with_role(array['owner', 'admin', 'dispatcher']))::uuid[]));

create policy client_internal_notes_staff_select on public.client_internal_notes
  for select to authenticated
  using (org_id = any ((select app.staff_orgs())::uuid[]));

create policy client_internal_notes_staff_write on public.client_internal_notes
  for all to authenticated
  using (org_id = any ((select app.orgs_with_role(array['owner', 'admin', 'dispatcher']))::uuid[]))
  with check (org_id = any ((select app.orgs_with_role(array['owner', 'admin', 'dispatcher']))::uuid[]));

create policy site_access_notes_staff_select on public.site_access_notes
  for select to authenticated
  using (org_id = any ((select app.staff_orgs())::uuid[]));

create policy site_access_notes_staff_write on public.site_access_notes
  for all to authenticated
  using (org_id = any ((select app.orgs_with_role(array['owner', 'admin', 'dispatcher']))::uuid[]))
  with check (org_id = any ((select app.orgs_with_role(array['owner', 'admin', 'dispatcher']))::uuid[]));

-- Dispatch roles only, for SELECT as well. A tech reads nothing priced.
create policy quote_internal_notes_staff_all on public.quote_internal_notes
  for all to authenticated
  using (org_id = any ((select app.orgs_with_role(array['owner', 'admin', 'dispatcher']))::uuid[]))
  with check (org_id = any ((select app.orgs_with_role(array['owner', 'admin', 'dispatcher']))::uuid[]));

grant select, insert, update, delete on public.job_internal_notes    to authenticated;
grant select, insert, update, delete on public.client_internal_notes to authenticated;
grant select, insert, update, delete on public.site_access_notes     to authenticated;
grant select, insert, update, delete on public.quote_internal_notes  to authenticated;

-- ----------------------------------------------------------------------------
-- 3. Move the data, then drop the columns.
--
-- The staff views are dropped first: `staff_job_detail_v` expands `j.*` and
-- selects `s.access_notes`, so both DROP COLUMNs would fail on the dependency.
-- They are recreated in section 4 reading the side tables.
-- ----------------------------------------------------------------------------

insert into public.job_internal_notes (job_id, org_id, notes)
select j.id, j.org_id, j.internal_notes
from public.jobs j
where j.internal_notes is not null and btrim(j.internal_notes) <> '';

insert into public.client_internal_notes (client_id, org_id, notes)
select c.id, c.org_id, c.notes
from public.clients c
where c.notes is not null and btrim(c.notes) <> '';

insert into public.site_access_notes (site_id, org_id, notes)
select s.id, s.org_id, s.access_notes
from public.sites s
where s.access_notes is not null and btrim(s.access_notes) <> '';

insert into public.quote_internal_notes (quote_id, org_id, notes)
select q.id, q.org_id, q.internal_note
from public.quotes q
where q.internal_note is not null and btrim(q.internal_note) <> '';

drop view public.staff_job_detail_v;

alter table public.jobs    drop column internal_notes;
alter table public.clients drop column notes;
alter table public.sites   drop column access_notes;
alter table public.quotes  drop column internal_note;

-- ----------------------------------------------------------------------------
-- 4. Staff views, reading the notes back through LEFT JOINs.
--
-- Still `security_invoker = on`. A tech querying `staff_job_detail_v` gets the
-- row with `internal_notes` filled, because `job_internal_notes` grants staff
-- SELECT -- unchanged from when the column lived on `jobs`.
-- ----------------------------------------------------------------------------

create view public.staff_job_detail_v with (security_invoker = on) as
select
  j.*,
  jn.notes        as internal_notes,
  c.name          as client_name,
  c.billing_email as client_billing_email,
  c.phone         as client_phone,
  s.name          as site_name,
  s.address       as site_address,
  s.timezone      as site_timezone,
  s.lat           as site_lat,
  s.lng           as site_lng,
  sn.notes        as site_access_notes,
  s.site_contact_name,
  s.site_contact_phone,
  rb.full_name    as requested_by_name,
  rb.email        as requested_by_email
from public.jobs j
left join public.job_internal_notes jn on jn.job_id = j.id
left join public.clients            c  on c.id      = j.client_id
left join public.sites              s  on s.id      = j.site_id
left join public.site_access_notes  sn on sn.site_id = s.id
left join public.client_contacts    rb on rb.id     = j.requested_by_contact_id;

comment on view public.staff_job_detail_v is
  'One job with its client, site, access notes, internal notes and requesting '
  'contact flattened. security_invoker: rows and note visibility both come '
  'from the caller''s own policies.';

-- The quote editor needs `internal_note` back, and it is the only surface that
-- does. A view rather than an embed keeps the note''s dispatch-only policy in
-- charge: for a tech the join simply yields null.
create view public.staff_quote_v with (security_invoker = on) as
select
  q.*,
  qn.notes as internal_note
from public.quotes q
left join public.quote_internal_notes qn on qn.quote_id = q.id;

comment on view public.staff_quote_v is
  'Quotes with the staff-only internal note joined back on. Read surface for '
  'the quote editor; writes go through save_quote_draft.';

grant select on public.staff_job_detail_v to authenticated;
grant select on public.staff_quote_v      to authenticated;

-- ----------------------------------------------------------------------------
-- 5. Write paths.
--
-- A note now lives in a different table from its parent, so creating a job or
-- a site with a note is two statements. Two statements from a browser are two
-- PostgREST requests and therefore two transactions, which is what
-- `save_quote_draft` was written to avoid. These RPCs keep each pair in one
-- transaction. SECURITY INVOKER: the caller's own policies decide, exactly as
-- they did for the single insert this replaces.
--
-- `org_id` is derived from the client rather than accepted as a parameter --
-- one less thing a caller can assert, and it guarantees the job and its client
-- agree, which the composite FK would otherwise have to catch.
-- ----------------------------------------------------------------------------

create or replace function public.create_job(
  p_client_id      uuid,
  p_title          text,
  p_description    text default null,
  p_site_id        uuid default null,
  p_priority       public.job_priority default 'normal',
  p_requested_for  date default null,
  p_internal_notes text default null
)
returns public.jobs
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_org uuid;
  v_job public.jobs;
begin
  select c.org_id into v_org from public.clients c where c.id = p_client_id;
  if not found then
    -- Not found and not permitted are the same answer, on purpose.
    raise exception 'client % not found', p_client_id using errcode = 'P0002';
  end if;

  insert into public.jobs (
    org_id, client_id, site_id, title, description, priority, requested_for, created_by
  ) values (
    v_org, p_client_id, p_site_id, p_title, p_description,
    coalesce(p_priority, 'normal'::public.job_priority), p_requested_for,
    (select auth.uid())
  )
  returning * into v_job;

  if p_internal_notes is not null and btrim(p_internal_notes) <> '' then
    insert into public.job_internal_notes (job_id, org_id, notes, updated_by)
    values (v_job.id, v_org, p_internal_notes, (select auth.uid()));
  end if;

  return v_job;
end;
$$;

create or replace function public.create_site(
  p_client_id          uuid,
  p_name               text,
  p_address            jsonb default null,
  p_timezone           text default null,
  p_access_notes       text default null,
  p_site_contact_name  text default null,
  p_site_contact_phone text default null
)
returns public.sites
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_org  uuid;
  v_site public.sites;
begin
  select c.org_id into v_org from public.clients c where c.id = p_client_id;
  if not found then
    raise exception 'client % not found', p_client_id using errcode = 'P0002';
  end if;

  insert into public.sites (
    org_id, client_id, name, address, timezone, site_contact_name, site_contact_phone, created_by
  ) values (
    v_org, p_client_id, p_name, p_address, p_timezone,
    p_site_contact_name, p_site_contact_phone, (select auth.uid())
  )
  returning * into v_site;

  if p_access_notes is not null and btrim(p_access_notes) <> '' then
    insert into public.site_access_notes (site_id, org_id, notes, updated_by)
    values (v_site.id, v_org, p_access_notes, (select auth.uid()));
  end if;

  return v_site;
end;
$$;

-- Sets or clears one job's internal note. Separate from create_job because
-- the detail page edits it on its own; `null` or blank deletes the row, which
-- is how "no note" is represented.
create or replace function public.set_job_internal_notes(
  p_job_id uuid,
  p_notes  text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_org uuid;
begin
  select j.org_id into v_org from public.jobs j where j.id = p_job_id;
  if not found then
    raise exception 'job % not found', p_job_id using errcode = 'P0002';
  end if;

  if p_notes is null or btrim(p_notes) = '' then
    delete from public.job_internal_notes where job_id = p_job_id;
    return;
  end if;

  insert into public.job_internal_notes (job_id, org_id, notes, updated_by)
  values (p_job_id, v_org, p_notes, (select auth.uid()))
  on conflict (job_id) do update
    set notes = excluded.notes, updated_by = excluded.updated_by;
end;
$$;

revoke execute on function public.create_job(uuid, text, text, uuid, public.job_priority, date, text) from public, anon;
revoke execute on function public.create_site(uuid, text, jsonb, text, text, text, text) from public, anon;
revoke execute on function public.set_job_internal_notes(uuid, text) from public, anon;
grant execute on function public.create_job(uuid, text, text, uuid, public.job_priority, date, text) to authenticated;
grant execute on function public.create_site(uuid, text, jsonb, text, text, text, text) to authenticated;
grant execute on function public.set_job_internal_notes(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 6. The two quote RPCs follow the note to its new home.
--
-- Both referenced `quotes.internal_note`, which no longer exists. plpgsql
-- resolves column names at execution, so without this they would apply
-- cleanly and then fail on first call.
-- ----------------------------------------------------------------------------

create or replace function public.save_quote_draft(
  p_quote_id uuid,
  p_lines    jsonb,
  p_header   jsonb default '{}'::jsonb
)
returns public.quotes
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_quote   public.quotes;
  v_foreign uuid;
begin
  if jsonb_typeof(p_lines) <> 'array' then
    raise exception 'p_lines must be a JSON array, got %', coalesce(jsonb_typeof(p_lines), 'null')
      using errcode = '22023';
  end if;

  select * into v_quote
  from public.quotes
  where id = p_quote_id
  for update;

  if not found then
    raise exception 'quote % not found', p_quote_id using errcode = 'P0002';
  end if;

  if v_quote.locked_at is not null then
    raise exception 'quote % is locked (sent %); its draft cannot be edited',
      p_quote_id, v_quote.sent_at
      using errcode = '23514', hint = 'supersede the quote with a new revision instead';
  end if;

  -- Refuse before deleting anything. See 20260909174500: ON CONFLICT with a
  -- failing WHERE skips the row silently, which emptied the quote instead.
  select q.id into v_foreign
  from jsonb_to_recordset(p_lines) as l(id text)
  join public.quote_line_items q on q.id = nullif(l.id, '')::uuid
  where q.quote_id <> p_quote_id
  limit 1;

  if v_foreign is not null then
    raise exception 'line % belongs to a different quote', v_foreign
      using errcode = '23514',
            hint = 'reload the quote: these line ids are from a superseded or unrelated revision';
  end if;

  delete from public.quote_line_items q
  where q.quote_id = p_quote_id
    and not exists (
      select 1
      from jsonb_to_recordset(p_lines) as l(id text)
      where nullif(l.id, '') is not null
        and l.id::uuid = q.id
    );

  insert into public.quote_line_items as t (
    id, org_id, quote_id, client_id, position, kind, catalog_item_id,
    description, unit, quantity, unit_price_cents, tax_rate
  )
  select
    coalesce(nullif(l.id, '')::uuid, gen_random_uuid()),
    v_quote.org_id,
    p_quote_id,
    v_quote.client_id,
    l.position,
    coalesce(nullif(l.kind, ''), 'material')::public.line_kind,
    nullif(l.catalog_item_id, '')::uuid,
    l.description,
    coalesce(nullif(l.unit, ''), 'each'),
    l.quantity::numeric,
    l.unit_price_cents,
    coalesce(nullif(l.tax_rate, ''), '0')::numeric
  from jsonb_to_recordset(p_lines) as l(
    id               text,
    position         integer,
    kind             text,
    catalog_item_id  text,
    description      text,
    unit             text,
    quantity         text,
    unit_price_cents bigint,
    tax_rate         text
  )
  on conflict (id) do update set
    position         = excluded.position,
    kind             = excluded.kind,
    catalog_item_id  = excluded.catalog_item_id,
    description      = excluded.description,
    unit             = excluded.unit,
    quantity         = excluded.quantity,
    unit_price_cents = excluded.unit_price_cents,
    tax_rate         = excluded.tax_rate
  where t.quote_id = p_quote_id;

  -- The internal note is a separate table now, so it is a separate statement
  -- -- still inside this transaction, which is the whole point of the RPC.
  -- Blank clears it, because absence is how "no note" is stored.
  if p_header ? 'internal_note' then
    if coalesce(btrim(p_header ->> 'internal_note'), '') = '' then
      delete from public.quote_internal_notes where quote_id = p_quote_id;
    else
      insert into public.quote_internal_notes (quote_id, org_id, notes, updated_by)
      values (p_quote_id, v_quote.org_id, p_header ->> 'internal_note', (select auth.uid()))
      on conflict (quote_id) do update
        set notes = excluded.notes, updated_by = excluded.updated_by;
    end if;
  end if;

  update public.quotes q
  set notes       = case when p_header ? 'notes' then p_header ->> 'notes' else q.notes end,
      terms       = case when p_header ? 'terms' then p_header ->> 'terms' else q.terms end,
      valid_until = case when p_header ? 'valid_until'
                         then nullif(p_header ->> 'valid_until', '')::date
                         else q.valid_until end
  where q.id = p_quote_id
  returning * into v_quote;

  return v_quote;
end;
$$;

create or replace function public.supersede_quote(p_quote_id uuid)
returns public.quotes
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_old public.quotes;
  v_new public.quotes;
begin
  select * into v_old
  from public.quotes
  where id = p_quote_id
  for update;

  if not found then
    raise exception 'quote % not found', p_quote_id using errcode = 'P0002';
  end if;

  if v_old.status not in ('sent', 'expired') then
    raise exception 'quote % is %; only a sent or expired quote can be superseded',
      p_quote_id, v_old.status
      using errcode = '23514',
            hint = 'draft quotes are edited in place; approved and declined quotes are final';
  end if;

  insert into public.quotes (org_id, job_id, client_id, notes, terms, valid_until, created_by)
  values (v_old.org_id, v_old.job_id, v_old.client_id, v_old.notes, v_old.terms,
          v_old.valid_until, (select auth.uid()))
  returning * into v_new;

  -- Carry the internal note across too. It is staff context on the work, not
  -- on the document, so a revision should not silently lose it.
  insert into public.quote_internal_notes (quote_id, org_id, notes, updated_by)
  select v_new.id, v_new.org_id, qn.notes, (select auth.uid())
  from public.quote_internal_notes qn
  where qn.quote_id = p_quote_id;

  insert into public.quote_line_items (
    org_id, quote_id, client_id, position, kind, catalog_item_id,
    description, unit, quantity, unit_price_cents, tax_rate
  )
  select l.org_id, v_new.id, l.client_id, l.position, l.kind, l.catalog_item_id,
         l.description, l.unit, l.quantity, l.unit_price_cents, l.tax_rate
  from public.quote_line_items l
  where l.quote_id = p_quote_id
  order by l.position;

  update public.quotes set status = 'superseded' where id = p_quote_id;

  return v_new;
end;
$$;

revoke execute on function public.save_quote_draft(uuid, jsonb, jsonb) from public, anon;
revoke execute on function public.supersede_quote(uuid) from public, anon;
grant execute on function public.save_quote_draft(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.supersede_quote(uuid) to authenticated;
