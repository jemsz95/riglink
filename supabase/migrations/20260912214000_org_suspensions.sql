-- ============================================================================
-- Org suspension.
--
-- A platform operator can switch an entire organisation off. Members and
-- client contacts can still SIGN IN -- suspension is not an auth-level ban,
-- because a user who belongs to two orgs must keep working in the healthy one
-- -- but every row of the suspended org's data becomes unreadable.
--
-- WHY THE FLAG IS NOT A COLUMN ON `organizations`
--
-- The obvious shape is `organizations.suspended_at`. It does not work.
-- `organizations_admin_update` is a ROW policy, and RLS filters rows, not
-- columns, so an owner or admin of the suspended org could simply
-- `update organizations set suspended_at = null` and switch themselves back
-- on. `WITH CHECK` cannot reference OLD, so no policy edit fixes it. The
-- state therefore lives ONLY in this deny-all table, which no `authenticated`
-- role holds any privilege on.
--
-- WHERE IT IS ENFORCED -- three points, not one
--
--   1. The role accessors. `app.staff_orgs()`, `app.orgs_with_role()`,
--      `app.portal_clients()` and `app.portal_orgs()` keep their exact
--      signatures and become one-line wrappers that subtract suspended orgs.
--      Every table policy, every storage policy in the `evidence`/`branding`/
--      `exports` buckets, Realtime, and the overflow fallback branch are all
--      covered without a single policy being edited.
--
--   2. `app.portal_contact_for()`. It reads `client_contacts` DIRECTLY and
--      never touches an accessor, and it is the authorization guard for all
--      five portal write RPCs (submit_job_request, approve_quote,
--      decline_quote, accept_completion, decline_completion). Without the fix
--      below, a contact of a suspended org could still approve quotes.
--
--   3. `profiles_org_mates_select`. Also a live `org_members` join with no
--      accessor, so a member of a suspended org would keep reading colleagues'
--      whole profile rows.
--
-- Points 2 and 3 are the reason "enforce it in the accessors" is not by itself
-- a complete answer, and they were found by auditing every policy and view
-- rather than by assuming.
--
-- WHY NOT BAKE IT INTO THE CLAIMS
--
-- Omitting suspended orgs from `app_metadata.orgs` in the token hook was
-- rejected. It does not cover the overflow branch (which reads `org_members`
-- live) or point 2 (which reads tables, not claims); it needs an unbounded
-- `auth_claim_epochs` fan-out at both suspend and unsuspend time, and the
-- simultaneous token-refresh storm that follows; and the org would vanish from
-- the claim entirely, so `my_memberships()` could not report "suspended"
-- without a SECOND claim -- meaning a `claims_version` bump and an
-- `EXPECTED_CLAIMS_VERSION` bump in the client for every user in the project.
--
-- Reading the table is immediate, atomic and reversible with one UPDATE.
-- `claims_version` stays 1 and `app.claims_fresh()` is untouched: suspension
-- is orthogonal to the epoch mechanism, which exists for claim STALENESS, and
-- a suspension never makes a claim stale.
--
-- LOAD-BEARING DEPENDENCY
--
-- `app.drop_suspended()` reads `public.org_suspensions` while being used,
-- transitively, inside `organizations`' own policies. That is not recursive
-- only because these functions are SECURITY DEFINER, run as the table owner,
-- and `FORCE ROW LEVEL SECURITY` is deliberately never enabled anywhere in
-- this schema (see 20260908225419_identity.sql). Enabling FORCE on
-- `org_suspensions` or `clients` would turn this into infinite recursion at
-- query time. Do not.
--
-- KNOWN CONSEQUENCE, ACCEPTED
--
-- An UPDATE or DELETE whose USING clause stops matching affects ZERO ROWS
-- rather than raising, and PostgREST answers 204. So a write already in flight
-- when the suspension lands fails silently; an INSERT is loud (42501), an
-- UPDATE is quiet. Guard triggers on a dozen tables to catch a millisecond-
-- wide race cost more than the race does. A suspension is a deliberate action
-- against a tenant who is about to be told.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- The table
-- ----------------------------------------------------------------------------

create table public.org_suspensions (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations (id) on delete cascade,

  suspended_at  timestamptz not null default now(),
  suspended_by  uuid not null references public.profiles (id),
  reason        text not null check (length(btrim(reason)) > 0),

  lifted_at     timestamptz,
  lifted_by     uuid references public.profiles (id),
  lifted_reason text,

  created_at    timestamptz not null default now(),

  constraint org_suspensions_lifted_has_actor
    check ((lifted_at is null) = (lifted_by is null))
);

-- At most one LIVE suspension per org. Lifted rows stay as history -- "why did
-- our account stop working in March" is a question asked months later.
--
-- This index is also the hot path: app.drop_suspended() probes it on every
-- statement that touches an org-scoped table, and in a healthy deployment it
-- is EMPTY, so the probe is a single page touch.
create unique index org_suspensions_live_key
  on public.org_suspensions (org_id) where lifted_at is null;

create index org_suspensions_org_idx
  on public.org_suspensions (org_id, suspended_at desc);

-- RLS on with ZERO policies, the auth_claim_epochs / number_sequences posture.
-- No grants either: 20260909170200_explicit_grants.sql rewrote the default ACL
-- so new tables arrive with nothing granted to anon or authenticated, which is
-- why you will not find a REVOKE here. The only readers are SECURITY DEFINER
-- functions running as the owner, and service_role.
alter table public.org_suspensions enable row level security;

comment on table public.org_suspensions is
  'Platform-operator suspensions. Deny-all: no authenticated role holds any '
  'privilege on this table. The `reason` is operator-facing and never reaches '
  'the suspended tenant -- the app shows a generic message.';

-- ----------------------------------------------------------------------------
-- The subtraction
-- ----------------------------------------------------------------------------

-- NOT granted to authenticated. With a uuid[] parameter it would be an oracle
-- over other tenants' suspension state. Called only from the accessors below,
-- which run as the owner.
create or replace function app.drop_suspended(p_orgs uuid[])
returns uuid[]
language sql
stable
security definer
parallel restricted
set search_path = ''
as $$
  select coalesce(
    (select array_agg(o)
     from unnest(p_orgs) o
     where not exists (
       select 1 from public.org_suspensions s
       where s.org_id = o and s.lifted_at is null
     )),
    '{}'::uuid[]
  );
$$;

-- ----------------------------------------------------------------------------
-- The unfiltered primitives.
--
-- These hold the EXACT bodies the four public accessors had before this
-- migration -- claims_fresh() call, overflow branch and all. They exist so the
-- filtered accessors can be one-liners, which keeps claims_fresh() called
-- exactly once per accessor invocation rather than twice.
--
-- None of them is granted to authenticated: they are called only from other
-- definer functions running as the owner. The revoke_public_execute event
-- trigger already strips the PUBLIC default, so silence is sufficient.
-- ----------------------------------------------------------------------------

create or replace function app.member_orgs_all()
returns uuid[]
language plpgsql
stable
security definer
parallel restricted
set search_path = ''
as $$
declare v_claims jsonb;
begin
  perform app.claims_fresh();
  v_claims := app.claims();
  if coalesce((v_claims ->> 'overflow')::boolean, false) then
    return coalesce((select array_agg(m.org_id) from public.org_members m
                     where m.user_id = (select auth.uid()) and m.accepted_at is not null), '{}'::uuid[]);
  end if;
  return coalesce((select array_agg(k::uuid)
                   from jsonb_object_keys(coalesce(v_claims -> 'orgs', '{}'::jsonb)) k), '{}'::uuid[]);
end;
$$;

create or replace function app.member_orgs_with_role_all(p_roles text[])
returns uuid[]
language plpgsql
stable
security definer
parallel restricted
set search_path = ''
as $$
declare v_claims jsonb;
begin
  perform app.claims_fresh();
  v_claims := app.claims();
  if coalesce((v_claims ->> 'overflow')::boolean, false) then
    return coalesce((select array_agg(m.org_id) from public.org_members m
                     where m.user_id = (select auth.uid()) and m.accepted_at is not null
                       and m.role::text = any (p_roles)), '{}'::uuid[]);
  end if;
  return coalesce((select array_agg(e.key::uuid)
                   from jsonb_each_text(coalesce(v_claims -> 'orgs', '{}'::jsonb)) e
                   where e.value = any (p_roles)), '{}'::uuid[]);
end;
$$;

create or replace function app.portal_clients_all()
returns uuid[]
language plpgsql
stable
security definer
parallel restricted
set search_path = ''
as $$
declare v_claims jsonb;
begin
  perform app.claims_fresh();
  v_claims := app.claims();
  if coalesce((v_claims ->> 'overflow')::boolean, false) then
    return coalesce((select array_agg(distinct c.client_id) from public.client_contacts c
                     where c.user_id = (select auth.uid()) and c.revoked_at is null
                       and c.accepted_at is not null), '{}'::uuid[]);
  end if;
  return coalesce((select array_agg(v::uuid)
                   from jsonb_array_elements_text(coalesce(v_claims -> 'clients', '[]'::jsonb)) v), '{}'::uuid[]);
end;
$$;

create or replace function app.portal_orgs_all()
returns uuid[]
language sql
stable
security definer
parallel restricted
set search_path = ''
as $$
  select coalesce(
    (select array_agg(distinct c.org_id)
     from public.clients c
     where c.id = any (app.portal_clients_all())),
    '{}'::uuid[]
  );
$$;

-- ----------------------------------------------------------------------------
-- The four public accessors, unchanged in signature, now filtered.
--
-- Every policy in the project already calls these. Because the signatures are
-- identical, not one policy needs editing -- which is the whole reason
-- suspension is enforced here rather than table by table.
-- ----------------------------------------------------------------------------

create or replace function app.staff_orgs()
returns uuid[]
language sql
stable
security definer
parallel restricted
set search_path = ''
as $$
  select app.drop_suspended(app.member_orgs_all());
$$;

create or replace function app.orgs_with_role(p_roles text[])
returns uuid[]
language sql
stable
security definer
parallel restricted
set search_path = ''
as $$
  select app.drop_suspended(app.member_orgs_with_role_all(p_roles));
$$;

create or replace function app.portal_clients()
returns uuid[]
language sql
stable
security definer
parallel restricted
set search_path = ''
as $$
  select coalesce(
    (select array_agg(c.id)
     from public.clients c
     where c.id = any (app.portal_clients_all())
       and not exists (
         select 1 from public.org_suspensions s
         where s.org_id = c.org_id and s.lifted_at is null
       )),
    '{}'::uuid[]
  );
$$;

create or replace function app.portal_orgs()
returns uuid[]
language sql
stable
security definer
parallel restricted
set search_path = ''
as $$
  select app.drop_suspended(app.portal_orgs_all());
$$;

-- app.role_in_org() is deliberately left UNFILTERED. It labels a membership
-- for my_memberships() and the UI; it appears in no policy. Do not reach for
-- it as an authorization guard -- it will happily report 'owner' for an org
-- the caller can read nothing from.
comment on function app.role_in_org(uuid) is
  'Labels a membership for the UI. NOT suspension-filtered and NOT used by any '
  'policy. Use app.orgs_with_role() for authorization.';

-- ----------------------------------------------------------------------------
-- Enforcement point 2: the portal write guard.
--
-- Five RPCs share this function, and each already raises 42501 on a NULL
-- result, so adding the suspension test here blocks all five with no caller
-- changes. The error message says "not a contact for this client" rather than
-- "suspended", which is slightly wrong and not worth five more replaces --
-- every portal write is blocked at the route level as well.
-- ----------------------------------------------------------------------------

create or replace function app.portal_contact_for(
  p_client_id uuid,
  p_require_approver boolean default false
)
returns client_contacts
language sql
stable
security definer
set search_path = ''
as $$
  select c.*
  from public.client_contacts c
  join public.clients cl on cl.id = c.client_id
  where c.client_id = p_client_id
    and c.user_id = (select auth.uid())
    and c.revoked_at is null
    and c.accepted_at is not null
    and (not p_require_approver or c.role in ('primary', 'standard'))
    and not exists (
      select 1 from public.org_suspensions s
      where s.org_id = cl.org_id and s.lifted_at is null
    )
  limit 1;
$$;

-- ----------------------------------------------------------------------------
-- Enforcement point 3: the staff directory.
-- ----------------------------------------------------------------------------

drop policy profiles_org_mates_select on public.profiles;

create policy profiles_org_mates_select on public.profiles
  for select to authenticated
  using (
    exists (
      select 1
      from public.org_members mine
      join public.org_members theirs on theirs.org_id = mine.org_id
      where mine.user_id = (select auth.uid())
        and mine.accepted_at is not null
        and theirs.user_id = public.profiles.id
        and not exists (
          select 1 from public.org_suspensions s
          where s.org_id = mine.org_id and s.lifted_at is null
        )
    )
  );

-- ----------------------------------------------------------------------------
-- Keeping the shell renderable.
--
-- The accessors now return {} for a suspended org, which would make the
-- `organizations` row itself unreadable -- and the app would show "Workspace
-- not found", which is a lie. These two policies are therefore recreated
-- against the UNFILTERED accessors so a member or contact of a suspended org
-- can still read the org's name and branding, and nothing else at all.
--
-- This is the ONLY place the unfiltered accessors may be used in a policy.
--
-- organizations_admin_update and organizations_owner_delete keep the filtered
-- app.orgs_with_role(), so a suspended owner can neither edit nor delete.
-- ----------------------------------------------------------------------------

drop policy organizations_staff_select  on public.organizations;
drop policy organizations_portal_select on public.organizations;

create policy organizations_staff_select on public.organizations
  for select to authenticated
  using (id = any ((select app.member_orgs_all())::uuid[]));

create policy organizations_portal_select on public.organizations
  for select to authenticated
  using (id = any ((select app.portal_orgs_all())::uuid[]));

-- ----------------------------------------------------------------------------
-- What the client needs in order to render the explanation.
-- ----------------------------------------------------------------------------

-- Zero parameters, derives everything from auth.uid() -- so it is not an
-- oracle over anyone else's orgs, and can safely be granted.
create or replace function app.my_suspended_orgs()
returns uuid[]
language sql
stable
security definer
parallel restricted
set search_path = ''
as $$
  select coalesce(
    (select array_agg(o)
     from unnest(app.member_orgs_all()) o
     where exists (
       select 1 from public.org_suspensions s
       where s.org_id = o and s.lifted_at is null
     )),
    '{}'::uuid[]
  );
$$;

grant execute on function app.my_suspended_orgs() to authenticated;

-- my_memberships() is SECURITY INVOKER and its portal branch joins
-- public.clients, whose portal policy uses the FILTERED accessor -- so a
-- contact of a suspended org would get an empty portal_clients array and the
-- portal would render "not found". Relaxing clients_portal_select would
-- re-open the whole client row, which is exactly what suspension is for. One
-- narrow definer projection instead.
create or replace function app.portal_memberships_all()
returns jsonb
language sql
stable
security definer
parallel restricted
set search_path = ''
as $$
  select coalesce(
    (select jsonb_agg(
              jsonb_build_object(
                'client_id', c.id, 'client_name', c.name,
                'org_id', o.id, 'org_slug', o.slug, 'org_name', o.name,
                'org_suspended', exists (
                  select 1 from public.org_suspensions s
                  where s.org_id = o.id and s.lifted_at is null
                )
              ) order by c.name)
     from public.clients c
     join public.organizations o on o.id = c.org_id
     where c.id = any (app.portal_clients_all())),
    '[]'::jsonb
  );
$$;

grant execute on function app.portal_memberships_all() to authenticated;

create or replace function public.my_memberships()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'orgs', coalesce(
      (select jsonb_agg(
                jsonb_build_object(
                  'id', o.id, 'slug', o.slug, 'name', o.name,
                  'logo_path', o.logo_path, 'brand_color', o.brand_color,
                  'timezone', o.timezone, 'currency', o.currency,
                  'role', app.role_in_org(o.id),
                  'suspended', o.id = any ((select app.my_suspended_orgs())::uuid[])
                ) order by o.name)
       from public.organizations o
       where o.id = any ((select app.member_orgs_all())::uuid[])),
      '[]'::jsonb
    ),
    'portal_clients', app.portal_memberships_all()
  );
$$;

revoke execute on function public.my_memberships() from public, anon;
grant execute on function public.my_memberships() to authenticated;

-- A suspension that does not show up here is the next confusing hour.
create or replace function app.debug_claims()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'uid', (select auth.uid()),
    'app_metadata', app.claims(),
    'staff_orgs', to_jsonb(app.staff_orgs()),
    'member_orgs_all', to_jsonb(app.member_orgs_all()),
    'suspended_orgs', to_jsonb(app.my_suspended_orgs()),
    'portal_clients', to_jsonb(app.portal_clients()),
    'overflow', coalesce((app.claims() ->> 'overflow')::boolean, false)
  );
$$;

grant execute on function app.debug_claims() to authenticated;

-- The event trigger strips PUBLIC/anon from every function created above;
-- these restate the explicit grants that survive a create-or-replace, so the
-- API surface stays legible in one place.
grant execute on function app.staff_orgs() to authenticated;
grant execute on function app.orgs_with_role(text[]) to authenticated;
grant execute on function app.portal_clients() to authenticated;
grant execute on function app.portal_orgs() to authenticated;
