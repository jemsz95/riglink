-- ============================================================================
-- ALL row-level security policies, deliberately in ONE migration.
--
-- "What can a client see?" must be answerable by reading a single file.
-- Splitting policies across the table migrations is how a codebase ends up
-- unable to answer that question. When a policy changes, re-declare it here.
--
-- Conventions, each of which is load-bearing:
--   * Every policy names `to authenticated`. Without it Postgres evaluates the
--     policy for anonymous requests too -- wasted work, and easy to leak when
--     combined with a permissive predicate.
--   * Always `= any ((select app.accessor())::uuid[])`. The trailing cast is
--     NOT cosmetic: without it the parser reads `(select f())` as a sublink and
--     compares `uuid = uuid[]`, which fails outright. With it, the array
--     becomes an InitPlan evaluated ONCE per statement and still compiles to an
--     Index Cond. Measured on 5k rows: 0.24ms as an Index Cond, 2.5ms as a
--     hoisted Filter, versus 299ms for the bare `any (app.accessor())` form,
--     which re-invokes the function for every row the planner has to filter.
--   * Multiple permissive policies for the same command OR together, so a user
--     who is both staff of org A and a contact of a client in org B sees the
--     union. That falls out of the model for free.
--   * Portal WRITES have no policies at all. They go through SECURITY DEFINER
--     RPCs which re-implement authorization explicitly, so there is exactly one
--     audited path per client action rather than two.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- profiles: self only.
--
-- Phase 1 scope. Staff reading co-workers' profiles (for member lists and
-- assignee pickers) needs a shared-org predicate, which is a per-row lookup
-- rather than a hoistable InitPlan; that arrives with the members UI.
-- ---------------------------------------------------------------------------
create policy profiles_self_select on profiles
  for select to authenticated
  using (id = (select auth.uid()));

create policy profiles_self_update on profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- organizations
-- ---------------------------------------------------------------------------
create policy organizations_staff_select on organizations
  for select to authenticated
  using (id = any ((select app.staff_orgs())::uuid[]));

-- Portal contacts read the org for its name and branding only; every
-- staff-only column is withheld by portal_organization_v, not by RLS.
create policy organizations_portal_select on organizations
  for select to authenticated
  using (id = any ((select app.portal_orgs())::uuid[]));

create policy organizations_admin_update on organizations
  for update to authenticated
  using (id = any ((select app.orgs_with_role(array['owner', 'admin']))::uuid[]))
  with check (id = any ((select app.orgs_with_role(array['owner', 'admin']))::uuid[]));

create policy organizations_owner_delete on organizations
  for delete to authenticated
  using (id = any ((select app.orgs_with_role(array['owner']))::uuid[]));

-- No INSERT policy: org creation goes through public.create_organization(),
-- which also makes the caller its first owner in the same transaction.

-- ---------------------------------------------------------------------------
-- org_members
-- ---------------------------------------------------------------------------
create policy org_members_select on org_members
  for select to authenticated
  using (org_id = any ((select app.staff_orgs())::uuid[]));

create policy org_members_admin_insert on org_members
  for insert to authenticated
  with check (
    org_id = any ((select app.orgs_with_role(array['owner', 'admin']))::uuid[])
    -- Only an owner may mint another owner: otherwise an admin self-promotes.
    and (role <> 'owner' or org_id = any ((select app.orgs_with_role(array['owner']))::uuid[]))
  );

create policy org_members_admin_update on org_members
  for update to authenticated
  using (org_id = any ((select app.orgs_with_role(array['owner', 'admin']))::uuid[]))
  with check (
    org_id = any ((select app.orgs_with_role(array['owner', 'admin']))::uuid[])
    and (role <> 'owner' or org_id = any ((select app.orgs_with_role(array['owner']))::uuid[]))
  );

create policy org_members_admin_delete on org_members
  for delete to authenticated
  using (
    org_id = any ((select app.orgs_with_role(array['owner', 'admin']))::uuid[])
    -- Removing an owner requires being an owner.
    and (role <> 'owner' or org_id = any ((select app.orgs_with_role(array['owner']))::uuid[]))
  );

-- ---------------------------------------------------------------------------
-- clients
-- ---------------------------------------------------------------------------
create policy clients_staff_select on clients
  for select to authenticated
  using (org_id = any ((select app.staff_orgs())::uuid[]));

create policy clients_portal_select on clients
  for select to authenticated
  using (id = any ((select app.portal_clients())::uuid[]));

create policy clients_staff_insert on clients
  for insert to authenticated
  with check (org_id = any ((select app.orgs_with_role(array['owner', 'admin', 'dispatcher']))::uuid[]));

create policy clients_staff_update on clients
  for update to authenticated
  using (org_id = any ((select app.orgs_with_role(array['owner', 'admin', 'dispatcher']))::uuid[]))
  with check (org_id = any ((select app.orgs_with_role(array['owner', 'admin', 'dispatcher']))::uuid[]));

create policy clients_admin_delete on clients
  for delete to authenticated
  using (org_id = any ((select app.orgs_with_role(array['owner', 'admin']))::uuid[]));

-- ---------------------------------------------------------------------------
-- client_contacts
-- ---------------------------------------------------------------------------

-- A contact must be able to read their own row so the portal can show who is
-- signed in, without seeing sibling contacts.
create policy client_contacts_self_select on client_contacts
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy client_contacts_staff_select on client_contacts
  for select to authenticated
  using (org_id = any ((select app.staff_orgs())::uuid[]));

create policy client_contacts_admin_write on client_contacts
  for all to authenticated
  using (org_id = any ((select app.orgs_with_role(array['owner', 'admin']))::uuid[]))
  with check (org_id = any ((select app.orgs_with_role(array['owner', 'admin']))::uuid[]));

-- ---------------------------------------------------------------------------
-- sites
-- ---------------------------------------------------------------------------
create policy sites_staff_select on sites
  for select to authenticated
  using (org_id = any ((select app.staff_orgs())::uuid[]));

create policy sites_portal_select on sites
  for select to authenticated
  using (client_id = any ((select app.portal_clients())::uuid[]));

create policy sites_staff_insert on sites
  for insert to authenticated
  with check (org_id = any ((select app.orgs_with_role(array['owner', 'admin', 'dispatcher']))::uuid[]));

create policy sites_staff_update on sites
  for update to authenticated
  using (org_id = any ((select app.orgs_with_role(array['owner', 'admin', 'dispatcher']))::uuid[]))
  with check (org_id = any ((select app.orgs_with_role(array['owner', 'admin', 'dispatcher']))::uuid[]));

create policy sites_admin_delete on sites
  for delete to authenticated
  using (org_id = any ((select app.orgs_with_role(array['owner', 'admin']))::uuid[]));

-- ---------------------------------------------------------------------------
-- jobs
-- ---------------------------------------------------------------------------
create policy jobs_staff_select on jobs
  for select to authenticated
  using (org_id = any ((select app.staff_orgs())::uuid[]));

-- Clients never see drafts, so staff can prepare a job invisibly.
create policy jobs_portal_select on jobs
  for select to authenticated
  using (
    client_id = any ((select app.portal_clients())::uuid[])
    and status <> 'draft'
  );

create policy jobs_staff_insert on jobs
  for insert to authenticated
  with check (org_id = any ((select app.orgs_with_role(array['owner', 'admin', 'dispatcher']))::uuid[]));

create policy jobs_staff_update on jobs
  for update to authenticated
  using (org_id = any ((select app.orgs_with_role(array['owner', 'admin', 'dispatcher']))::uuid[]))
  with check (org_id = any ((select app.orgs_with_role(array['owner', 'admin', 'dispatcher']))::uuid[]));

-- A technician may only touch jobs they lead. Money columns are withheld by
-- giving techs no policy on quotes/invoices at all, rather than by column
-- grants -- Supabase has a single `authenticated` role, so per-column grants
-- cannot distinguish a tech from an admin.
create policy jobs_tech_update on jobs
  for update to authenticated
  using (
    org_id = any ((select app.orgs_with_role(array['tech']))::uuid[])
    and lead_tech_id = (select auth.uid())
  )
  with check (
    org_id = any ((select app.orgs_with_role(array['tech']))::uuid[])
    and lead_tech_id = (select auth.uid())
  );

create policy jobs_admin_delete on jobs
  for delete to authenticated
  using (org_id = any ((select app.orgs_with_role(array['owner', 'admin']))::uuid[]));

-- ---------------------------------------------------------------------------
-- job_status_events: append-only audit trail.
--
-- No INSERT policy (written by the definer trigger), and no UPDATE or DELETE
-- policy for ANYONE including owners. That is what makes it an audit trail
-- rather than a log.
-- ---------------------------------------------------------------------------
create policy job_status_events_staff_select on job_status_events
  for select to authenticated
  using (org_id = any ((select app.staff_orgs())::uuid[]));

-- Uncorrelated: the inner query's only input is an InitPlan, so Postgres runs
-- it once and hashes the result rather than probing per row.
create policy job_status_events_portal_select on job_status_events
  for select to authenticated
  using (
    job_id in (
      select j.id
      from jobs j
      where j.client_id = any ((select app.portal_clients())::uuid[])
        and j.status <> 'draft'
    )
  );

-- ---------------------------------------------------------------------------
-- job_status_transitions: non-sensitive reference data. The UI reads it to
-- decide which actions to offer, so it is world-readable to signed-in users
-- and writable by no one.
-- ---------------------------------------------------------------------------
create policy job_status_transitions_select on job_status_transitions
  for select to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- number_sequences and auth_claim_epochs: intentionally NO policies.
-- Reachable only through SECURITY DEFINER functions and service_role.
-- ---------------------------------------------------------------------------
