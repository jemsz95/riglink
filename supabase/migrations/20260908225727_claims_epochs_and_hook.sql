-- ============================================================================
-- JWT-borne authorization.
--
-- Authorization context is minted INTO the access token by a Custom Access
-- Token Hook and read from request.jwt.claims by every RLS policy. No policy
-- touches a membership table, which also means the classic 42P17 recursion
-- footgun on org_members is gone by construction.
--
-- The accepted cost -- a token outliving a permission change -- is managed
-- explicitly here (stage 1: a claim-epoch table), and bounded independently by
-- jwt_expiry = 600 in config.toml. Stage 2 moves the freshness check to the
-- edge (Cloudflare KV), at which point claims_fresh() becomes `select true`.
-- ============================================================================

create table auth_claim_epochs (
  user_id   uuid primary key references auth.users (id) on delete cascade,
  epoch     bigint not null default 1,
  bumped_at timestamptz not null default now(),
  reason    text
);
-- RLS on with ZERO policies: invisible to anon/authenticated entirely. Only
-- SECURITY DEFINER functions and service_role can see it.
alter table auth_claim_epochs enable row level security;

comment on table auth_claim_epochs is
  'Per-user authorization epoch. Bumped whenever a membership changes, which '
  'invalidates every access token minted before the bump. Deliberately NOT '
  'UNLOGGED: it is truncated on crash recovery, and a missing row fails OPEN, '
  'silently restoring access to every revoked token.';

-- ----------------------------------------------------------------------------
-- The freshness gate.
--
-- Raises rather than returning zero rows: a silently-empty result set after a
-- role change is indistinguishable from data loss and gets filed as a bug.
-- P0001 + hint 'refresh_session' gives the client something actionable.
-- ----------------------------------------------------------------------------

create or replace function app.claims()
returns jsonb
language sql
stable
parallel safe
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata',
    '{}'::jsonb
  );
$$;

create or replace function app.claims_fresh()
returns boolean
language plpgsql
stable
security definer
parallel restricted
set search_path = ''
as $$
declare
  v_token bigint := coalesce((app.claims() ->> 'epoch')::bigint, 0);
  v_current bigint;
begin
  select e.epoch into v_current
  from public.auth_claim_epochs e
  where e.user_id = (select auth.uid());

  -- No row means the user has never had a membership change: nothing to revoke.
  if v_current is null or v_token >= v_current then
    return true;
  end if;

  raise exception 'stale authorization claims (token epoch %, current %)',
    v_token, v_current
    using errcode = 'P0001', hint = 'refresh_session';
end;
$$;

comment on function app.claims_fresh is
  'Folded into the RLS accessor functions rather than appended to each policy: '
  'an `and claims_fresh()` you must remember in dozens of places will be '
  'forgotten exactly once, on the policy that matters.';

-- ----------------------------------------------------------------------------
-- Epoch bumps.
-- ----------------------------------------------------------------------------

create or replace function app.bump_claim_epoch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- unnest over both OLD and NEW covers an UPDATE that reassigns a membership
  -- to a different user: the losing and the gaining user both need a bump.
  insert into public.auth_claim_epochs as e (user_id, epoch, reason)
  select u, 1, tg_table_name || ':' || tg_op
  from unnest(array[
    case when tg_op <> 'INSERT' then old.user_id end,
    case when tg_op <> 'DELETE' then new.user_id end
  ]) as u
  where u is not null
  on conflict (user_id) do update
    set epoch = e.epoch + 1,
        bumped_at = now(),
        reason = excluded.reason;

  return null;
end;
$$;

create trigger org_members_bump_epoch
  after insert or update or delete on org_members
  for each row execute function app.bump_claim_epoch();

create trigger client_contacts_bump_epoch
  after insert or update or delete on client_contacts
  for each row execute function app.bump_claim_epoch();

-- ----------------------------------------------------------------------------
-- The hook. This is the authorization source of record: if it fails, tokens
-- mint without claims and every policy denies.
-- ----------------------------------------------------------------------------

create or replace function app.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
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
  -- org_id -> role, accepted memberships only.
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
  -- Claims ride in the header of every request. Above these bounds the token
  -- gets uncomfortably large, so policies fall back to a lookup instead. This
  -- path is exercised by a seeded overflow user in the tests, because it would
  -- otherwise first execute on a real customer.
  v_claims := jsonb_set(
    v_claims, '{app_metadata,overflow}',
    to_jsonb(coalesce(v_n_orgs, 0) > 50 or coalesce(v_n_clients, 0) > 200)
  );

  -- Only ever ADDS under app_metadata, so the required claims (iss, aud, exp,
  -- iat, sub, role, aal, session_id, email, phone, is_anonymous) are preserved.
  return jsonb_build_object('claims', v_claims);
end;
$$;

grant usage on schema app to supabase_auth_admin;
grant execute on function app.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function app.custom_access_token_hook(jsonb) from authenticated, anon, public;
grant select on public.org_members, public.client_contacts, public.auth_claim_epochs
  to supabase_auth_admin;
