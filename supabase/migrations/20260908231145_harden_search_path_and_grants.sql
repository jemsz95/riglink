-- ============================================================================
-- Hardening, from the Supabase security advisor.
--
-- 1. Pin search_path on the three functions that were missing it. The hook is
--    the important one: it runs as supabase_auth_admin and queries
--    public.org_members, so a mutable search_path on it is a genuine
--    privilege-escalation surface. Every reference inside is already
--    schema-qualified, and jsonb/current_setting live in pg_catalog, so an
--    empty search_path is safe.
--
-- 2. Revoke EXECUTE from PUBLIC on the definer RPCs. Postgres grants EXECUTE
--    to PUBLIC on every new function by default, so `grant ... to
--    authenticated` did not stop `anon` reaching them via /rest/v1/rpc/*.
--    Both already refuse an unauthenticated caller with 42501, so this is
--    defence in depth rather than a live hole -- but the default is wrong and
--    should not be relied on.
--
-- Remaining advisor findings after this migration are all intentional:
--   * rls_enabled_no_policy on auth_claim_epochs / number_sequences -- the
--     deny-all posture, reachable only through definer functions.
--   * authenticated_security_definer_function_executable on bootstrap_session
--     and create_organization -- signed-in users calling them IS the point.
--   * anything naming public.rls_auto_enable() -- Supabase-managed event
--     trigger, not ours, and an event_trigger function cannot be invoked via
--     RPC regardless.
-- ============================================================================

create or replace function app.claims()
returns jsonb
language sql
stable
parallel safe
set search_path = ''
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata',
    '{}'::jsonb
  );
$$;

create or replace function app.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function app.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_claims    jsonb := event -> 'claims';
  v_uid       uuid := (event ->> 'user_id')::uuid;
  v_orgs      jsonb;
  v_clients   jsonb;
  v_epoch     bigint;
  v_n_orgs    integer;
  v_n_clients integer;
begin
  select jsonb_object_agg(m.org_id::text, m.role::text), count(*)
  into v_orgs, v_n_orgs
  from public.org_members m
  where m.user_id = v_uid
    and m.accepted_at is not null;

  select jsonb_agg(distinct c.client_id::text), count(distinct c.client_id)
  into v_clients, v_n_clients
  from public.client_contacts c
  where c.user_id = v_uid
    and c.revoked_at is null
    and c.accepted_at is not null;

  select e.epoch into v_epoch
  from public.auth_claim_epochs e
  where e.user_id = v_uid;

  v_claims := jsonb_set(
    v_claims, '{app_metadata}', coalesce(v_claims -> 'app_metadata', '{}'::jsonb)
  );
  v_claims := jsonb_set(v_claims, '{app_metadata,orgs}', coalesce(v_orgs, '{}'::jsonb));
  v_claims := jsonb_set(v_claims, '{app_metadata,clients}', coalesce(v_clients, '[]'::jsonb));
  v_claims := jsonb_set(v_claims, '{app_metadata,epoch}', to_jsonb(coalesce(v_epoch, 0)));
  v_claims := jsonb_set(
    v_claims, '{app_metadata,overflow}',
    to_jsonb(coalesce(v_n_orgs, 0) > 50 or coalesce(v_n_clients, 0) > 200)
  );

  return jsonb_build_object('claims', v_claims);
end;
$$;

grant execute on function app.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function app.custom_access_token_hook(jsonb) from public, anon, authenticated;

revoke execute on function public.bootstrap_session() from public, anon;
grant execute on function public.bootstrap_session() to authenticated;

revoke execute on function public.create_organization(text, text) from public, anon;
grant execute on function public.create_organization(text, text) to authenticated;

revoke execute on function public.my_memberships() from public, anon;
grant execute on function public.my_memberships() to authenticated;

revoke execute on function app.claims() from public, anon;
revoke execute on function app.claims_fresh() from public, anon;
revoke execute on function app.staff_orgs() from public, anon;
revoke execute on function app.orgs_with_role(text[]) from public, anon;
revoke execute on function app.portal_clients() from public, anon;
revoke execute on function app.portal_orgs() from public, anon;
revoke execute on function app.role_in_org(uuid) from public, anon;
revoke execute on function app.debug_claims() from public, anon;
revoke execute on function app.next_number(uuid, text, text) from public, anon, authenticated;
