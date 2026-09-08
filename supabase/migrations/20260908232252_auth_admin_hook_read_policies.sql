-- ============================================================================
-- CRITICAL FIX: let the access-token hook actually read its inputs.
--
-- GoTrue invokes app.custom_access_token_hook as `supabase_auth_admin`, and
-- that role does NOT have BYPASSRLS (verified: pg_roles.rolbypassrls = false;
-- only `postgres` bypasses). The table-level GRANT SELECT was therefore not
-- enough -- RLS still applied, no policy matched that role, and the hook read
-- ZERO rows. Every token would have been minted with empty claims, so every
-- policy would deny and the whole app would look broken for no visible reason.
--
-- This was invisible in testing because a session running as `postgres`
-- bypasses RLS, so calling the hook by hand appeared to work perfectly. The
-- lesson: exercise the hook as supabase_auth_admin, or not at all.
--
-- Narrow read policies for that one role are preferred over making the hook
-- SECURITY DEFINER: the hook keeps the lowest privilege that works, and the
-- access is auditable per table. supabase_auth_admin has SELECT on exactly
-- these three tables and no write privilege anywhere.
-- ============================================================================

create policy org_members_auth_admin_read on org_members
  for select to supabase_auth_admin
  using (true);

create policy client_contacts_auth_admin_read on client_contacts
  for select to supabase_auth_admin
  using (true);

create policy auth_claim_epochs_auth_admin_read on auth_claim_epochs
  for select to supabase_auth_admin
  using (true);
