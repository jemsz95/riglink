-- ============================================================================
-- Grant EXECUTE on the two unfiltered accessors that appear in POLICIES.
--
-- 20260912214000 granted none of the new `app` primitives, on the reasoning
-- that they are called only from other SECURITY DEFINER functions running as
-- the owner. That is true of app.drop_suspended(),
-- app.member_orgs_with_role_all() and app.portal_clients_all().
--
-- It is NOT true of app.member_orgs_all() and app.portal_orgs_all(). Those two
-- are named directly in the recreated organizations_staff_select and
-- organizations_portal_select policies, and a policy expression is evaluated
-- as the CALLER, not as the table owner. Without EXECUTE, every authenticated
-- read of `organizations` fails outright with
--
--   42501 permission denied for function member_orgs_all
--
-- which is not a filtered result but a hard error on the query that every
-- route in the app makes first. Caught by reading org data as a real user
-- rather than as postgres -- the same class of mistake as the hook needing
-- explicit read policies because supabase_auth_admin lacks BYPASSRLS.
--
-- Granting them is safe on the same grounds the existing accessors are: both
-- take zero parameters and derive everything from auth.uid(), so neither is an
-- oracle over anyone else's memberships. They return the caller's own org list
-- WITHOUT the suspension filter, which is exactly what the two policies above
-- need and nothing more -- the org row carries a name and branding, and every
-- other table is still gated by the filtered accessors.
-- ============================================================================

grant execute on function app.member_orgs_all()  to authenticated;
grant execute on function app.portal_orgs_all()  to authenticated;

-- Still deliberately ungranted, because no policy names them:
--   app.drop_suspended(uuid[])             -- a uuid[] parameter would make it
--                                             an oracle over other tenants
--   app.member_orgs_with_role_all(text[])  -- reached via app.orgs_with_role()
--   app.portal_clients_all()               -- reached via app.portal_clients()
