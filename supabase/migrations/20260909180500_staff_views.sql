-- ============================================================================
-- Staff read views.
--
-- WHY
--
-- The projections these replace lived in the client as PostgREST select
-- strings with embeds -- `clients!jobs_client_fk (id, name)` and friends --
-- restated in `features/jobs`, `features/clients` and `features/sites`. The
-- shape of a job row is a property of the domain, not of one client
-- application, and a second client (mobile) would otherwise have to reproduce
-- every one of them correctly.
--
-- Filtering, sorting and pagination stay in the client, against these views.
-- That keeps `count: 'exact'` in the same round trip and keeps the sort column
-- dynamic without dynamic SQL. Only the shape moves.
--
-- `security_invoker = on` on every view: the pre-PG15 default runs a view as
-- its owner, which would bypass RLS entirely. Row access still comes from the
-- base-table policies of whoever is asking; these views only choose columns.
--
-- LEFT JOIN throughout, including for `jobs.client_id`, which is NOT NULL with
-- a FK. An inner join would drop a job from the list if the caller could read
-- the job but not its client. That cannot happen today -- every staff SELECT
-- policy keys off the same `app.staff_orgs()` -- but a job silently missing
-- from a list is a bad failure, and this makes it structurally impossible
-- rather than true-by-coincidence. The cost is that `client_name` types as
-- nullable, which the client answers at the boundary.
--
-- `j.*` in the detail view is expanded when the view is created, so a column
-- added to `jobs` later will NOT appear until this view is recreated. That is
-- a deliberate trade: the client's old `select('*')` picked up new columns
-- silently, including ones not meant for this surface.
--
-- SEARCH
--
-- One `search_text` column per view, matched with a single ILIKE. It replaces
-- three hand-built PostgREST `or` logic trees, and with them the escaping
-- helper they needed -- an unquoted comma in a user's search term made the
-- whole request fail with PGRST100.
--
-- This is deliberately the least clever thing that works, and it is the
-- ceiling for search in Postgres on this project. A leading-wildcard ILIKE
-- cannot use a btree index, so this is a sequential scan bounded by the
-- `org_id` filter -- fine at the scale one contractor's job list reaches, and
-- honest about what it is. When search needs more than substring matching --
-- relevance ranking, typo tolerance, or semantic recall -- that is the signal
-- to move it to a dedicated engine or to pgvector embeddings, NOT to grow
-- tsvector columns, trigram indexes and ranking functions in here.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Jobs
-- ----------------------------------------------------------------------------

create or replace view public.staff_job_list_v with (security_invoker = on) as
select
  j.id,
  j.org_id,
  j.client_id,
  j.site_id,
  j.number,
  j.title,
  j.status,
  j.priority,
  j.source,
  j.requested_for,
  j.scheduled_start,
  j.scheduled_end,
  j.updated_at,
  j.created_at,
  j.lead_tech_id,
  c.name     as client_name,
  s.name     as site_name,
  s.timezone as site_timezone,
  -- The job number is included as text, so a search for `1043` finds #1043.
  -- It is a substring match rather than the old exact `number.eq`, which is
  -- what a single search box should do: `104` finding #1043 is a feature.
  coalesce(j.title, '') || ' ' ||
  coalesce(j.description, '') || ' ' ||
  j.number::text as search_text
from public.jobs j
left join public.clients c on c.id = j.client_id
left join public.sites   s on s.id = j.site_id;

comment on view public.staff_job_list_v is
  'Job list projection for staff. Filter, sort and paginate against it from '
  'the client. security_invoker: rows come from jobs'' own RLS policies.';

create or replace view public.staff_job_detail_v with (security_invoker = on) as
select
  j.*,
  c.name          as client_name,
  c.billing_email as client_billing_email,
  c.phone         as client_phone,
  s.name          as site_name,
  s.address       as site_address,
  s.timezone      as site_timezone,
  s.lat           as site_lat,
  s.lng           as site_lng,
  s.access_notes  as site_access_notes,
  s.site_contact_name,
  s.site_contact_phone,
  rb.full_name    as requested_by_name,
  rb.email        as requested_by_email
from public.jobs j
left join public.clients        c  on c.id  = j.client_id
left join public.sites          s  on s.id  = j.site_id
left join public.client_contacts rb on rb.id = j.requested_by_contact_id;

comment on view public.staff_job_detail_v is
  'One job with its client, site and requesting contact flattened. Carries '
  'internal_notes, as the previous client-side select(*) did.';

-- ----------------------------------------------------------------------------
-- Clients
-- ----------------------------------------------------------------------------

create or replace view public.staff_client_list_v with (security_invoker = on) as
select
  c.id,
  c.org_id,
  c.name,
  c.billing_email,
  c.phone,
  c.external_ref,
  c.archived_at,
  c.created_at,
  -- Counted under the caller's own policies, like everything else here. The
  -- site count excludes archived sites, matching what the client detail page
  -- lists; the embed this replaces counted them.
  (select count(*) from public.sites s
    where s.client_id = c.id and s.archived_at is null) as site_count,
  (select count(*) from public.jobs j where j.client_id = c.id) as job_count,
  coalesce(c.name, '') || ' ' ||
  coalesce(c.billing_email, '') || ' ' ||
  coalesce(c.external_ref, '') as search_text
from public.clients c;

comment on view public.staff_client_list_v is
  'Client list projection for staff, with site and job counts computed under '
  'the caller''s own RLS.';

-- ----------------------------------------------------------------------------
-- Sites
-- ----------------------------------------------------------------------------

create or replace view public.staff_site_list_v with (security_invoker = on) as
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
  s.site_contact_phone,
  s.archived_at,
  s.created_at,
  c.name as client_name,
  (select count(*) from public.jobs j where j.site_id = s.id) as job_count,
  -- Client name is searchable here: "find the Acme plant" is how someone
  -- looks for a site, and it is still one column and one ILIKE.
  coalesce(s.name, '') || ' ' ||
  coalesce(c.name, '') || ' ' ||
  coalesce(s.site_contact_name, '') as search_text
from public.sites s
left join public.clients c on c.id = s.client_id;

comment on view public.staff_site_list_v is
  'Site list projection for staff, with the owning client name and job count.';

-- ----------------------------------------------------------------------------
-- Grants. Read-only, staff only, nothing to anon.
-- ----------------------------------------------------------------------------

grant select on public.staff_job_list_v    to authenticated;
grant select on public.staff_job_detail_v  to authenticated;
grant select on public.staff_client_list_v to authenticated;
grant select on public.staff_site_list_v   to authenticated;
