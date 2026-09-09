-- ============================================================================
-- Platform administrators.
--
-- The operator of this deployment: onboards new contractors, and can suspend
-- an organisation. NOT a tenant role -- there is no new `staff_role` value,
-- and this confers no RLS access to any org's business data anywhere in the
-- schema.
--
-- THE INVARIANT THAT MAKES IT SAFE
--
--   No RLS policy in this schema mentions app.is_platform_admin(). Ever.
--
-- A platform admin reading /rest/v1/jobs sees exactly what their own org
-- memberships permit, which for an operator with no memberships is zero rows.
-- Every platform power is a named public.platform_* RPC whose return type is a
-- hand-written column projection -- so the complete list of what an operator
-- can see is enumerable by reading one migration, and checkable with:
--
--   select * from pg_policies where qual ~ 'is_platform_admin';   -- must be empty
--
-- The tempting alternative -- adding `or app.is_platform_admin()` to
-- organizations_staff_select, since org metadata is exactly what they need --
-- was rejected and is worth naming so nobody re-proposes it. `organizations`
-- is a base table with `grant select` to authenticated, so that one `or` turns
-- /rest/v1/organizations?select=* into every tenant's branding, default tax
-- rate and invoice terms, with no column control, forever.
--
-- WHY THERE IS NO JWT CLAIM
--
-- Every other authorization fact in this project rides in the token. This one
-- deliberately does not:
--
--   * Revocation would be stale for up to jwt_expiry (600s) -- wrong direction
--     for the highest-blast-radius power in the system. Reading the table means
--     revocation takes effect on the operator's very next RPC.
--   * It would cost a claims_version bump, and therefore an epoch bump for
--     EVERY user in the project plus an EXPECTED_CLAIMS_VERSION bump in the
--     client, for a flag that roughly one account will ever hold.
--   * No policy reads it, so there is nothing for the accessors to consume.
--
-- The UI learns the flag from my_memberships(), which calls the definer
-- predicate below.
-- ============================================================================

create table public.platform_admins (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  granted_at timestamptz not null default now(),
  granted_by uuid references public.profiles (id) on delete set null,
  note       text
);

-- RLS on with ZERO policies and ZERO grants -- the auth_claim_epochs posture.
--
-- A self-select policy ("so an admin can see their own row") plus a select
-- grant would make /rest/v1/platform_admins a live endpoint whose only defence
-- is a single predicate. With neither, reaching this table needs two
-- independent mistakes. The UI never needs the row: app.is_platform_admin()
-- answers the only question it asks.
alter table public.platform_admins enable row level security;

comment on table public.platform_admins is
  'Platform operators. NOT a tenant role: confers no RLS access to any org''s '
  'business data anywhere in this schema. Its entire effect is that the '
  'public.platform_* RPCs will answer. Granting a row is a service_role SQL '
  'action, deliberately not exposed as an RPC -- see the header of '
  '20260912215500_platform_rpcs.sql.';

-- ----------------------------------------------------------------------------
-- Audit.
--
-- Suspension is the only power in this system one person exercises
-- unilaterally against a tenant they cannot otherwise see. Without a trail,
-- "why did our account stop working on Tuesday" has no answer.
--
-- Append-only by construction: no grants at all, so nothing but the definer
-- RPCs can write it, and no UPDATE or DELETE path exists for anyone. Same
-- treatment as `approvals` and `job_status_events`.
-- ----------------------------------------------------------------------------

create table public.platform_audit_events (
  id            bigint generated always as identity primary key,

  -- No `on delete` clause, deliberately: deleting a profile that has audit
  -- history should RAISE, not silently erase the attribution. `set null`
  -- beside `not null` would have been a self-contradiction.
  actor_user_id uuid not null references public.profiles (id),

  action        text not null check (action in (
                  'suspend_org', 'unsuspend_org',
                  'invite_founder', 'revoke_invitation'
                )),

  -- The audit row must outlive the org it describes.
  org_id        uuid references public.organizations (id) on delete set null,
  invitation_id uuid references public.org_invitations (id) on delete set null,

  reason        text,
  created_at    timestamptz not null default now()
);

alter table public.platform_audit_events enable row level security;

create index platform_audit_events_created_idx
  on public.platform_audit_events (created_at desc);
create index platform_audit_events_org_idx
  on public.platform_audit_events (org_id, created_at desc);

-- ----------------------------------------------------------------------------
-- The predicate
-- ----------------------------------------------------------------------------

-- Deliberately does NOT call app.claims_fresh(). Every other accessor does,
-- because they read the claim and a stale claim is a wrong answer. This one
-- reads the table, so there is nothing to be stale -- and folding the gate in
-- would make a platform admin whose org membership happened to change get
-- P0001 from an RPC that never touched their memberships.
create or replace function app.is_platform_admin()
returns boolean
language sql
stable
security definer
parallel restricted
set search_path = ''
as $$
  select exists (
    select 1 from public.platform_admins a
    where a.user_id = (select auth.uid())
  );
$$;

grant execute on function app.is_platform_admin() to authenticated;

-- The guard every platform RPC opens with. Not granted to authenticated: it is
-- only ever called from inside definer functions running as the owner.
create or replace function app.require_platform_admin()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.is_platform_admin() then
    raise exception 'not a platform administrator' using errcode = '42501';
  end if;
  return v_uid;
end;
$$;

revoke execute on function app.require_platform_admin() from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- Bootstrap: the first user on an empty deployment.
--
-- TWO conditions, not one, and the second is the important one.
--
-- Guarding only on "platform_admins is empty" is a privilege-escalation path,
-- not merely a race: revoke the last platform admin and the next person to
-- sign up -- including an invited CLIENT CONTACT, who is a customer of a
-- customer -- silently inherits the platform. The `auth.users` test closes it.
--
-- After the backfill below, that second condition is false forever, so this
-- branch is dead code in production. It is still correct and still necessary
-- on `db:reset` and in local development. Do not delete it as unreachable.
--
-- The advisory lock serialises the genuine first-signup race. The two existing
-- first-run checks in this project (before_user_created_hook on an empty
-- auth.users, create_organization on empty organizations) accept their races
-- because the prize is "first user of an empty deployment". Here the prize is
-- a permanent cross-tenant power, which is worth one lock.
--
-- Keying on "auth.users has exactly one row" instead does NOT work: inside an
-- AFTER INSERT trigger each concurrent transaction sees its own row and not
-- the other's, so count(*) = 1 is true in both.
-- ----------------------------------------------------------------------------

create or replace function app.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    nullif(btrim(coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      ''
    )), ''),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;

  perform pg_advisory_xact_lock(hashtext('platform_admins_bootstrap'));

  insert into public.platform_admins (user_id, note)
  select new.id, 'first user on an empty deployment'
  where not exists (select 1 from public.platform_admins)
    and not exists (select 1 from auth.users u where u.id <> new.id);

  return null;
end;
$$;

-- ----------------------------------------------------------------------------
-- Never leave the table empty.
--
-- Without this, "delete every row" is a supported way to re-arm the bootstrap
-- above, and a profile cascade could empty it by accident.
--
-- DEFERRABLE INITIALLY DEFERRED so a swap (delete the old operator, insert the
-- new one) in one transaction succeeds, while a bare delete fails at commit.
-- ----------------------------------------------------------------------------

create or replace function app.protect_last_platform_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.platform_admins) then
    raise exception 'cannot remove the last platform administrator'
      using errcode = '23514',
            hint = 'Grant it to someone else first, in SQL as service_role.';
  end if;
  return null;
end;
$$;

create constraint trigger platform_admins_keep_one
  after delete on public.platform_admins
  deferrable initially deferred
  for each row execute function app.protect_last_platform_admin();

-- ----------------------------------------------------------------------------
-- Backfill the existing deployment.
--
-- Keyed on the earliest OWNER membership rather than on "the only auth.users
-- row": it states the intent (the person who runs this deployment) and is a
-- no-op rather than a mis-grant if a second user appears between this being
-- written and being applied.
-- ----------------------------------------------------------------------------

insert into public.platform_admins (user_id, note)
select m.user_id, 'backfill: sole owner when platform administration shipped'
from public.org_members m
where m.role = 'owner'
  and not exists (select 1 from public.platform_admins)
order by m.created_at
limit 1
on conflict (user_id) do nothing;

-- ----------------------------------------------------------------------------
-- `platform` becomes a reserved slug.
--
-- /platform is a top-level route, and TanStack ranks a static segment above
-- /$orgSlug -- so an org that slugged itself `platform` would be permanently
-- unreachable, with no error to explain why.
-- ----------------------------------------------------------------------------

alter table public.organizations drop constraint organizations_slug_not_reserved;

alter table public.organizations add constraint organizations_slug_not_reserved
  check (
    slug not in (
      'login', 'logout', 'portal', 'callback', 'auth', 'join', 'invite',
      'api', 'admin', 'settings', 'app', 'health', 'onboarding', 'static',
      'assets', 'public', 'www', 'help', 'support', 'status', 'billing',
      'platform'
    )
  );
