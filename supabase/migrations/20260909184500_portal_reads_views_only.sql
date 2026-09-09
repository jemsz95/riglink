-- ============================================================================
-- The portal reads views ONLY. Base-table row access for contacts is removed.
--
-- THE LEAK
--
-- RLS filters rows. It has no column dimension, and Supabase has a single
-- `authenticated` role, so a policy that lets a portal contact read their own
-- job rows lets them read every COLUMN of those rows. The portal application
-- read `portal_job_v`, which omits the staff-only columns -- but nothing
-- compelled it to. `/rest/v1/jobs?select=*` with a contact's own JWT returned
-- them.
--
-- Verified against this project with a contact JWT holding one client id:
--
--   jobs.internal_notes   "SECRET: client is 90 days late on payment"
--   clients.notes         "SECRET: do not extend credit"
--
-- and by the same route: `jobs.lead_tech_id` (who is assigned),
-- `sites.access_notes`, `quotes.internal_note`. The README described these as
-- structurally absent from the portal. They were absent from the views, which
-- is not the same claim.
--
-- THE FIX
--
-- Portal contacts lose SELECT on the base tables entirely, and the predicate
-- that used to live in those policies moves inside the views, which become
-- owner-rights (`security_invoker = off`). A contact reading `jobs` directly
-- now gets zero rows; the only path to their data is a view that cannot carry
-- a column it does not select. This closes the five columns above and every
-- staff-only column added to these tables in future, which a per-column fix
-- would not.
--
-- WHAT THIS COSTS, STATED PLAINLY
--
-- For the portal path the view's WHERE clause becomes the only tenant filter.
-- There is no RLS backstop underneath it, so a mistake in one of these four
-- predicates is a cross-tenant leak rather than a defect caught by a second
-- lock. That is the trade that was chosen. Three things make it defensible:
--
--   1. `app.portal_clients()` is the sole source of the tenant list in all
--      four, and it calls `app.claims_fresh()` -- so a revoked contact still
--      gets P0001 and a forced refresh, exactly as before. The epoch gate is
--      not weakened by leaving RLS.
--   2. `status <> 'draft'` moves with the predicate on jobs and quotes. A
--      draft is staff work-in-progress and must not be visible; that
--      condition was in the dropped policies and is now in the views.
--   3. It is how the portal's writes already work. `submit_job_request`,
--      `approve_quote` and `decline_quote` are SECURITY DEFINER and are
--      already the sole authorisation for what a contact may change.
--
-- Staff access is untouched: the `*_staff_select` policies still govern the
-- base tables, and the staff views remain `security_invoker = on` with RLS
-- underneath them.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. my_memberships() must stop depending on the policies being dropped.
--
-- It is SECURITY INVOKER and reads `clients` and `organizations` to build the
-- portal's org and account list, so dropping `clients_portal_select` would
-- have left every contact with an empty portal and a "not registered as a
-- contact" page. Making it definer is safe because its own predicates are the
-- authorisation and are unchanged: `app.staff_orgs()` and
-- `app.portal_clients()`, both epoch-checked. It returns no staff-only column
-- -- names, slugs, branding, timezone, currency.
-- ----------------------------------------------------------------------------

create or replace function public.my_memberships()
returns jsonb
language sql
stable
security definer
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

-- ----------------------------------------------------------------------------
-- 2. Portal views: owner rights, predicate inside.
--
-- Column lists are unchanged from the security_invoker versions, so the
-- generated types and the portal client are unaffected.
-- ----------------------------------------------------------------------------

create or replace view public.portal_job_v with (security_invoker = off) as
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
from public.jobs j
where j.client_id = any (app.portal_clients())
  -- Was `jobs_portal_select`. A draft job is staff work in progress.
  and j.status <> 'draft';

create or replace view public.portal_site_v with (security_invoker = off) as
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
from public.sites s
where s.client_id = any (app.portal_clients());

create or replace view public.portal_quote_v with (security_invoker = off) as
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
from public.quotes q
where q.client_id = any (app.portal_clients())
  -- Was `quotes_portal_select`. An unsent quote is a price nobody has agreed
  -- to show yet; this is the condition Phase 3 verified end to end.
  and q.status <> 'draft';

create or replace view public.portal_quote_line_v with (security_invoker = off) as
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
from public.quote_line_items li
where exists (
  -- Scoped through the quote, not by li.client_id alone: a line must be
  -- invisible while its quote is still a draft, and the quote is the only
  -- thing that knows.
  select 1
  from public.quotes q
  where q.id = li.quote_id
    and q.client_id = any (app.portal_clients())
    and q.status <> 'draft'
);

comment on view public.portal_job_v is
  'Portal job projection. security_invoker = OFF: contacts have no RLS row '
  'access to `jobs`, so this view''s WHERE clause is the tenant filter.';
comment on view public.portal_site_v is
  'Portal site projection. Owner rights; scoped by app.portal_clients().';
comment on view public.portal_quote_v is
  'Portal quote projection. Owner rights; scoped by app.portal_clients() and '
  'hides drafts.';
comment on view public.portal_quote_line_v is
  'Portal quote line projection. Owner rights; scoped through the parent quote '
  'so lines of a draft stay hidden.';

-- ----------------------------------------------------------------------------
-- 3. Drop the base-table row access the leak depended on.
-- ----------------------------------------------------------------------------

drop policy jobs_portal_select             on public.jobs;
drop policy sites_portal_select            on public.sites;
drop policy quotes_portal_select           on public.quotes;
drop policy quote_line_items_portal_select on public.quote_line_items;
drop policy clients_portal_select          on public.clients;

-- Nothing reads this from the portal, and `reason` is free text a dispatcher
-- writes for colleagues. If the portal ever shows job history it gets a view
-- with a chosen column list, like everything else on that surface.
drop policy job_status_events_portal_select on public.job_status_events;

-- KEPT, deliberately:
--   approvals_portal_select      -- a contact's own decision. Every column is
--                                   their own data, and `snapshot` is built by
--                                   app.quote_snapshot(), which selects only
--                                   client-facing fields (no internal_note).
--   client_contacts_self_select  -- `user_id = auth.uid()`: their own contact
--                                   row only, which is how the portal knows
--                                   whether they may approve.
--   organizations_portal_select  -- org name and branding for the portal
--                                   shell. No staff-only column exists on
--                                   `organizations`.

-- ----------------------------------------------------------------------------
-- 4. Grants. Views are read-only to staff and contacts alike; nothing to anon.
-- ----------------------------------------------------------------------------

grant select on public.portal_job_v        to authenticated;
grant select on public.portal_site_v       to authenticated;
grant select on public.portal_quote_v      to authenticated;
grant select on public.portal_quote_line_v to authenticated;

revoke execute on function public.my_memberships() from public, anon;
grant execute on function public.my_memberships() to authenticated;
