-- ============================================================================
-- Restore the portal's RLS row filter; return its views to security_invoker.
--
-- Reverts the mechanism of `20260909184500` while keeping what it achieved.
-- The staff-only columns are gone from these tables as of the previous
-- migration, so a contact holding base-table row access can no longer read
-- anything they should not -- there is nothing left to read.
--
-- After this the portal read path has two independent locks again:
--
--   1. RLS on the base table decides WHICH ROWS. Restored below, byte for byte
--      as it was, including `status <> 'draft'` on jobs and quotes.
--   2. The view decides WHICH COLUMNS, and is `security_invoker = on`, so it
--      cannot widen row access beyond lock 1.
--
-- A mistake in either one alone leaks nothing, which is the property that
-- `security_invoker = off` gave up. It also clears four ERROR-level
-- `0010_security_definer_view` findings that could not be suppressed.
--
-- `my_memberships()` goes back to SECURITY INVOKER. It was made definer only
-- because dropping `clients_portal_select` had left it unable to read the
-- portal's own client and org names; that policy is restored below, so the
-- reason is gone. One fewer definer function on the API surface.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Portal views: back to invoker, predicate back out.
--
-- The `where client_id = any (app.portal_clients())` clauses are removed
-- because the restored policies apply the same filter -- keeping both would
-- work but would put the same rule in two places to drift apart.
-- ----------------------------------------------------------------------------

create or replace view public.portal_job_v with (security_invoker = on) as
select
  j.id,
  j.org_id,
  j.client_id,
  j.site_id,
  j.number,
  j.title,
  j.description,
  j.status,
  j.priority,
  j.source,
  j.requested_for,
  j.scheduled_start,
  j.scheduled_end,
  j.completed_at,
  j.created_at,
  j.updated_at
from public.jobs j;

create or replace view public.portal_site_v with (security_invoker = on) as
select
  s.id,
  s.org_id,
  s.client_id,
  s.name,
  s.address,
  s.timezone,
  s.lat,
  s.lng,
  s.site_contact_name,
  s.site_contact_phone
from public.sites s;

create or replace view public.portal_quote_v with (security_invoker = on) as
select
  q.id,
  q.org_id,
  q.job_id,
  q.client_id,
  q.number,
  q.status,
  q.currency,
  q.subtotal_cents,
  q.tax_cents,
  q.total_cents,
  q.notes,
  q.terms,
  q.valid_until,
  q.sent_at,
  q.decided_at,
  q.created_at,
  q.updated_at
from public.quotes q;

create or replace view public.portal_quote_line_v with (security_invoker = on) as
select
  li.id,
  li.org_id,
  li.quote_id,
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
from public.quote_line_items li;

comment on view public.portal_job_v is
  'Portal job projection. security_invoker = on: rows come from '
  'jobs_portal_select, which also hides drafts. The staff-only columns are not '
  'merely omitted here -- they are not on `jobs` at all.';
comment on view public.portal_site_v is
  'Portal site projection. Rows from sites_portal_select. Access notes live in '
  'site_access_notes, which contacts cannot read.';
comment on view public.portal_quote_v is
  'Portal quote projection. Rows from quotes_portal_select, which hides drafts.';
comment on view public.portal_quote_line_v is
  'Portal quote line projection. Rows from quote_line_items_portal_select, '
  'which checks the parent quote is not a draft.';

-- ----------------------------------------------------------------------------
-- 2. Restore the six policies, unchanged from 20260908230342 / 20260909161713.
-- ----------------------------------------------------------------------------

create policy clients_portal_select on public.clients
  for select to authenticated
  using (id = any ((select app.portal_clients())::uuid[]));

create policy sites_portal_select on public.sites
  for select to authenticated
  using (client_id = any ((select app.portal_clients())::uuid[]));

-- Clients never see drafts, so staff can prepare a job invisibly.
create policy jobs_portal_select on public.jobs
  for select to authenticated
  using (
    client_id = any ((select app.portal_clients())::uuid[])
    and status <> 'draft'
  );

-- Uncorrelated: the inner query's only input is an InitPlan, so Postgres runs
-- it once and hashes the result rather than probing per row.
create policy job_status_events_portal_select on public.job_status_events
  for select to authenticated
  using (
    job_id in (
      select j.id
      from public.jobs j
      where j.client_id = any ((select app.portal_clients())::uuid[])
        and j.status <> 'draft'
    )
  );

-- Drafts are invisible to the client, which is what lets staff prepare a
-- quote, get it wrong, and fix it without anyone watching.
create policy quotes_portal_select on public.quotes
  for select to authenticated
  using (
    client_id = any ((select app.portal_clients())::uuid[])
    and status <> 'draft'
  );

create policy quote_line_items_portal_select on public.quote_line_items
  for select to authenticated
  using (
    client_id = any ((select app.portal_clients())::uuid[])
    and exists (
      select 1 from public.quotes q
      where q.id = quote_line_items.quote_id
        and q.status <> 'draft'
    )
  );

-- ----------------------------------------------------------------------------
-- 3. my_memberships() back to invoker.
-- ----------------------------------------------------------------------------

create or replace function public.my_memberships()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'orgs', coalesce(
      (select jsonb_agg(
                jsonb_build_object(
                  'id', o.id, 'slug', o.slug, 'name', o.name,
                  'logo_path', o.logo_path, 'brand_color', o.brand_color,
                  'timezone', o.timezone, 'currency', o.currency,
                  'role', app.role_in_org(o.id)
                ) order by o.name)
       from public.organizations o
       where o.id = any ((select app.staff_orgs())::uuid[])),
      '[]'::jsonb
    ),
    'portal_clients', coalesce(
      (select jsonb_agg(
                jsonb_build_object(
                  'client_id', c.id, 'client_name', c.name,
                  'org_id', o.id, 'org_slug', o.slug, 'org_name', o.name
                ) order by c.name)
       from public.clients c
       join public.organizations o on o.id = c.org_id
       where c.id = any ((select app.portal_clients())::uuid[])),
      '[]'::jsonb
    )
  );
$$;

revoke execute on function public.my_memberships() from public, anon;
grant execute on function public.my_memberships() to authenticated;
