-- ============================================================================
-- Explicit grants: make `auto_expose_new_tables = false` real.
--
-- WHY THIS EXISTS
--
-- `auto_expose_new_tables = false` in config.toml describes the intent, but it
-- does not remove what is already there. A Supabase project ships with
--
--   alter default privileges in schema public
--     grant all on tables to anon, authenticated, service_role;
--
-- recorded twice in pg_default_acl (once for `postgres`, once for
-- `supabase_admin`). Those entries survive a `config push`, so every table
-- created since -- including the Phase 3 quote tables, whose migration granted
-- precisely and deliberately said nothing about `anon` -- came out of CREATE
-- TABLE with the full eight privileges for `anon` anyway. An explicit
-- `grant select, insert, update, delete ... to authenticated` next to a
-- default ACL that already granted everything to everyone reads like a
-- restriction and is a no-op.
--
-- RLS still denied every one of those rows, so this was never an open door.
-- But the second lock the plan asked for was not fitted, and "the policy is
-- the only thing standing between anon and the quotes table" is not the
-- posture we chose.
--
-- WHAT THIS DOES
--
-- 1. Rewrites the default ACL so future tables arrive closed.
-- 2. Revokes everything from `anon`, which needs nothing: nothing in the app
--    touches PostgREST before sign-in. The login page talks to GoTrue, and
--    GoTrue connects as `supabase_auth_admin`, not `anon`.
-- 3. Revokes everything from `authenticated` and re-grants per table, one
--    verb at a time, matching the policies that exist. From here a table with
--    no grant is unreachable even if someone later adds a permissive policy,
--    and a table with no policy is unreachable even if someone later adds a
--    grant. Two independent mistakes are needed to expose a row.
--
-- `service_role` keeps its default privileges. It is the trusted backend
-- identity, it bypasses RLS by design, and its key never reaches a browser --
-- narrowing it would buy nothing and would break Edge Functions added later.
--
-- NOT IN SCOPE: the `supabase_admin` default ACL. Altering another role's
-- default privileges requires membership in it, which `postgres` does not
-- have on the hosted platform. It only governs objects `supabase_admin`
-- itself creates in `public` -- i.e. platform-managed objects, not ours. Our
-- migrations run as `postgres`, so the entry rewritten below is the one that
-- decides how our tables are born.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Future objects arrive closed.
-- ----------------------------------------------------------------------------

alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on functions from anon, authenticated;

-- Postgres grants EXECUTE on every new function to PUBLIC, which is how a
-- definer RPC becomes anon-callable without anyone granting anything. The
-- existing RPCs each revoke it by hand; this makes the next one safe by
-- default instead of by remembering.
alter default privileges for role postgres in schema public
  revoke execute on functions from public;
alter default privileges for role postgres in schema app
  revoke execute on functions from public;
alter default privileges for role postgres in schema app
  revoke all on functions from anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2. anon: nothing.
--
-- USAGE on the schema stays. PostgREST introspects as its authenticator role
-- and needs the schema to resolve at all; with no object privileges inside it,
-- an anon request has nothing to reach. Revoking USAGE would change error
-- shapes for no additional protection.
-- ----------------------------------------------------------------------------

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;
revoke all on all tables in schema app from anon;
revoke all on all functions in schema app from anon;

-- ----------------------------------------------------------------------------
-- 3. authenticated: reset, then re-grant deliberately.
-- ----------------------------------------------------------------------------

revoke all on all tables in schema public from authenticated;
revoke all on all sequences in schema public from authenticated;

-- Identity ------------------------------------------------------------------
-- `profiles` has self-select and self-update policies and no insert path: the
-- row is created by the on-signup trigger, so INSERT is withheld.
grant select, update on public.profiles to authenticated;

-- `organizations` is created only through public.create_organization(), which
-- is SECURITY DEFINER, so INSERT is withheld here on purpose -- a direct
-- insert would produce an org with no owner membership.
grant select, update, delete on public.organizations to authenticated;

grant select, insert, update, delete on public.org_members to authenticated;

-- Client records ------------------------------------------------------------
grant select, insert, update, delete on public.clients to authenticated;
grant select, insert, update, delete on public.client_contacts to authenticated;
grant select, insert, update, delete on public.sites to authenticated;

-- Jobs ----------------------------------------------------------------------
grant select, insert, update, delete on public.jobs to authenticated;

-- Append-only audit trail: rows are written by the status trigger, read by
-- staff and by the portal. No INSERT, no UPDATE, no DELETE, to anyone.
grant select on public.job_status_events to authenticated;

-- Reference data, effectively read-only.
grant select on public.job_status_transitions to authenticated;

-- Quotes --------------------------------------------------------------------
grant select, insert, update, delete on public.catalog_items to authenticated;
grant select, insert, update, delete on public.quotes to authenticated;
grant select, insert, update, delete on public.quote_line_items to authenticated;

-- Approvals are the client's signature on a price. Written only by
-- app.decide_quote() inside approve_quote/decline_quote, and never amended:
-- SELECT is the whole grant, which is why an owner's UPDATE affects no rows.
grant select on public.approvals to authenticated;

-- Portal views --------------------------------------------------------------
-- Column projections, read-only. `security_invoker = on` means row access is
-- still decided by the base-table policies of whoever is asking.
grant select on public.portal_job_v to authenticated;
grant select on public.portal_site_v to authenticated;
grant select on public.portal_quote_v to authenticated;
grant select on public.portal_quote_line_v to authenticated;

-- Deliberately granted nothing -----------------------------------------------
--   public.number_sequences  -- RLS on, zero policies; allocated only by
--                               app.next_number(), a definer function.
--   public.auth_claim_epochs -- read by the access-token hook as
--                               supabase_auth_admin; bumped by definer code.
-- Both were carrying all eight privileges from the default ACL until now.

-- ----------------------------------------------------------------------------
-- 4. Functions: re-grant the RPCs the app actually calls.
--
-- Step 2 only touched `anon`, so these are still in place; they are repeated
-- because a grant list that is not written down is a grant list nobody can
-- audit. `revoke ... from public` guards against the PUBLIC default on any
-- function that predates step 1.
-- ----------------------------------------------------------------------------

-- Trigger and event-trigger functions were left with the Postgres default of
-- EXECUTE to PUBLIC. Revoking it is safe: a trigger's function privilege is
-- checked at CREATE TRIGGER time, not when it fires. Verified against this
-- project -- a BEFORE INSERT trigger whose function had EXECUTE revoked from
-- PUBLIC still fired for `authenticated` and still modified the row.
--
-- This also closes public.rls_auto_enable(), which carried both a PUBLIC and
-- an explicit `anon` grant. It is Supabase's own event-trigger function for
-- auto-enabling RLS, but it is owned by `postgres`, so it is ours to lock. It
-- was already unreachable over the API -- calling it yields `0A000 cannot
-- display a value of type event_trigger` -- and event triggers do not consult
-- EXECUTE either, so the auto-enable behaviour is unaffected.
revoke execute on all functions in schema public from public, anon;
revoke execute on all functions in schema app from public, anon, authenticated;

grant execute on function public.bootstrap_session() to authenticated;
grant execute on function public.create_organization(text, text) to authenticated;
grant execute on function public.my_memberships() to authenticated;
grant execute on function public.submit_job_request(uuid, text, text, uuid, date) to authenticated;
grant execute on function public.send_quote(uuid) to authenticated;
grant execute on function public.approve_quote(uuid, text) to authenticated;
grant execute on function public.decline_quote(uuid, text) to authenticated;

-- The RLS accessors: policies call these as the invoking role, so they must
-- stay executable by `authenticated` even though no client calls them.
grant execute on function app.claims() to authenticated;
grant execute on function app.claims_fresh() to authenticated;
grant execute on function app.staff_orgs() to authenticated;
grant execute on function app.orgs_with_role(text[]) to authenticated;
grant execute on function app.portal_clients() to authenticated;
grant execute on function app.portal_orgs() to authenticated;
grant execute on function app.role_in_org(uuid) to authenticated;
grant execute on function app.debug_claims() to authenticated;
