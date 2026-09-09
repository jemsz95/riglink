-- ============================================================================
-- Split the note tables' `for all` write policies into per-action policies.
--
-- `job_internal_notes`, `client_internal_notes` and `site_access_notes` each
-- had a staff SELECT policy plus a dispatch `for all` policy. `for all`
-- includes SELECT, so each table ended up with two permissive SELECT policies
-- for `authenticated` -- which the performance advisor flags
-- (`multiple_permissive_policies`), correctly: Postgres must evaluate every
-- permissive policy for the action and OR the results, so the second one is
-- real per-row work for no additional access. Dispatch roles are a subset of
-- staff, so the `for all` SELECT branch could never widen anything.
--
-- Now every action on these tables has exactly one policy. `quote_internal_notes`
-- is left as a single `for all`, because there it is the only policy on the
-- table -- dispatch-only for reads as well as writes is the tech exclusion,
-- not a duplicate.
-- ============================================================================

drop policy job_internal_notes_staff_write    on public.job_internal_notes;
drop policy client_internal_notes_staff_write on public.client_internal_notes;
drop policy site_access_notes_staff_write     on public.site_access_notes;

create policy job_internal_notes_staff_insert on public.job_internal_notes
  for insert to authenticated
  with check (org_id = any ((select app.orgs_with_role(array['owner', 'admin', 'dispatcher']))::uuid[]));

create policy job_internal_notes_staff_update on public.job_internal_notes
  for update to authenticated
  using (org_id = any ((select app.orgs_with_role(array['owner', 'admin', 'dispatcher']))::uuid[]))
  with check (org_id = any ((select app.orgs_with_role(array['owner', 'admin', 'dispatcher']))::uuid[]));

create policy job_internal_notes_staff_delete on public.job_internal_notes
  for delete to authenticated
  using (org_id = any ((select app.orgs_with_role(array['owner', 'admin', 'dispatcher']))::uuid[]));

create policy client_internal_notes_staff_insert on public.client_internal_notes
  for insert to authenticated
  with check (org_id = any ((select app.orgs_with_role(array['owner', 'admin', 'dispatcher']))::uuid[]));

create policy client_internal_notes_staff_update on public.client_internal_notes
  for update to authenticated
  using (org_id = any ((select app.orgs_with_role(array['owner', 'admin', 'dispatcher']))::uuid[]))
  with check (org_id = any ((select app.orgs_with_role(array['owner', 'admin', 'dispatcher']))::uuid[]));

create policy client_internal_notes_staff_delete on public.client_internal_notes
  for delete to authenticated
  using (org_id = any ((select app.orgs_with_role(array['owner', 'admin', 'dispatcher']))::uuid[]));

create policy site_access_notes_staff_insert on public.site_access_notes
  for insert to authenticated
  with check (org_id = any ((select app.orgs_with_role(array['owner', 'admin', 'dispatcher']))::uuid[]));

create policy site_access_notes_staff_update on public.site_access_notes
  for update to authenticated
  using (org_id = any ((select app.orgs_with_role(array['owner', 'admin', 'dispatcher']))::uuid[]))
  with check (org_id = any ((select app.orgs_with_role(array['owner', 'admin', 'dispatcher']))::uuid[]));

create policy site_access_notes_staff_delete on public.site_access_notes
  for delete to authenticated
  using (org_id = any ((select app.orgs_with_role(array['owner', 'admin', 'dispatcher']))::uuid[]));

-- Index the composite FK targets the performance advisor names. The primary
-- key covers `(parent_id)` and therefore any lookup by parent alone, but the
-- FK is on `(parent_id, org_id)` and cascade deletes probe both columns.
-- One row per parent, so these are cheap.
create index job_internal_notes_job_org_idx    on public.job_internal_notes (job_id, org_id);
create index client_internal_notes_client_org_idx on public.client_internal_notes (client_id, org_id);
create index site_access_notes_site_org_idx    on public.site_access_notes (site_id, org_id);
create index quote_internal_notes_quote_org_idx on public.quote_internal_notes (quote_id, org_id);
