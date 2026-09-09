-- Adds `app_metadata.claims_version` to the minted token.
--
-- It marks the claim shape, so claim-shape migrations are possible: any future
-- change to the shape bumps this number and ships alongside
-- `update auth_claim_epochs set epoch = epoch + 1`, so every live session
-- refreshes once and picks up the new shape. Without a version marker the
-- client has no way to tell an old token from a new one.
--
-- It is not a health check. A project where this hook is not enabled mints
-- tokens with no app_metadata at all, but that is a half-deployed instance --
-- config.toml carries the hook and ships with these migrations -- so it is
-- fixed at the deployment boundary, not detected at runtime.
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
  v_claims := jsonb_set(v_claims, '{app_metadata,claims_version}', to_jsonb(1));
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
