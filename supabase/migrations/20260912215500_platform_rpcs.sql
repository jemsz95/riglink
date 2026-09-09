-- ============================================================================
-- The platform operator's entire API surface.
--
-- Read the invariant in 20260912215000_platform_admins.sql first. Everything
-- here depends on it: these functions are SECURITY DEFINER, and the
-- definer-ness IS the security boundary. A platform admin has no RLS access to
-- any org's data, so this file is the complete, enumerable list of what they
-- can see -- and every return type below is a hand-written column projection
-- with no client name, job title, note, price or evidence in it.
--
-- WHAT IS DELIBERATELY ABSENT
--
--   * No job, client, quote or invoice COUNTS. They are a revenue proxy: "how
--     many jobs did Acme run last quarter" is commercially sensitive and no
--     requirement needs it. Member counts stay, because you cannot tell
--     whether an org still has an owner without them.
--
--   * No platform_grant_admin / platform_revoke_admin. An RPC that mints
--     another operator makes compromise of one session self-replicating and
--     permanent -- an attacker grants themselves and revokes you, and you are
--     locked out of your own platform. Recovery stays the service_role key,
--     which never reaches a browser. To add an operator, in SQL:
--
--       insert into public.platform_admins (user_id, granted_by, note)
--       values ('<user-id>', '<your-user-id>', 'second operator, agreed <date>');
--
--   * No RPC that writes org_members, and no RPC that accepts an org_id for an
--     invitation. This is what makes "a platform admin cannot enter a tenant"
--     structural rather than a rule. platform_invite_founder() hardcodes NULL
--     and takes no org parameter; keep it that way. An org-scoped invitation
--     would still hit org_invitations_admin_insert, and a direct org_members
--     insert would still hit its policy -- but the point is that no code path
--     exists to try.
--
-- ORG IDENTITY IS ALWAYS uuid, NEVER slug. `organizations.slug` is citext, and
-- under `search_path = ''` a bare `=` on citext silently becomes case-
-- SENSITIVE (see scripts/check-sql-conventions.mjs). Projecting `o.slug::text`
-- is safe; comparing it is not. Do not add a platform_org_by_slug().
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Orgs
-- ----------------------------------------------------------------------------

create or replace function public.platform_list_orgs()
returns table (
  id           uuid,
  name         text,
  slug         text,
  created_at   timestamptz,
  suspended_at timestamptz,
  suspension_reason text,
  owners       integer,
  admins       integer,
  dispatchers  integer,
  techs        integer,
  members      integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app.require_platform_admin();
  return query
    select
      o.id, o.name, o.slug::text, o.created_at,
      s.suspended_at, s.reason,
      count(m.*) filter (where m.role = 'owner')::integer,
      count(m.*) filter (where m.role = 'admin')::integer,
      count(m.*) filter (where m.role = 'dispatcher')::integer,
      count(m.*) filter (where m.role = 'tech')::integer,
      count(m.*)::integer
    from public.organizations o
    left join public.org_suspensions s
      on s.org_id = o.id and s.lifted_at is null
    left join public.org_members m
      on m.org_id = o.id and m.accepted_at is not null
    group by o.id, o.name, o.slug, o.created_at, s.suspended_at, s.reason
    order by o.name;
end;
$$;

-- The one genuine cross-tenant PII read in this surface, and it is restricted.
--
-- src/features/orgs/members-queries.ts documents that email is deliberately
-- absent from the staff directory, because auth.users holds every user in the
-- project rather than every user in one org. Here the reader IS the project
-- operator, and "manage orgs and their admins" is unperformable without a way
-- to contact them -- profiles.full_name is nullable and unverified.
--
-- Restricted to owner and admin. A tech's, a dispatcher's or any client
-- contact's address is never returned by anything in this file.
create or replace function public.platform_list_org_admins(p_org_id uuid)
returns table (
  user_id     uuid,
  role        public.staff_role,
  full_name   text,
  email       text,
  accepted_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app.require_platform_admin();
  return query
    select m.user_id, m.role, p.full_name, u.email::text, m.accepted_at
    from public.org_members m
    join public.profiles p on p.id = m.user_id
    join auth.users u on u.id = m.user_id
    where m.org_id = p_org_id
      and m.role in ('owner', 'admin')
    order by m.role, p.full_name nulls last;
end;
$$;

-- ----------------------------------------------------------------------------
-- Suspension
--
-- No claim epoch is bumped here, deliberately. Enforcement is a live read of
-- org_suspensions inside the role accessors, so a suspension takes effect on
-- the tenant's very next statement with no token involvement at all. See the
-- header of 20260912214000_org_suspensions.sql for why the claims-based
-- alternative was rejected.
-- ----------------------------------------------------------------------------

create or replace function public.platform_suspend_org(p_org_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor  uuid := app.require_platform_admin();
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if v_reason is null then
    raise exception 'a suspension reason is required'
      using errcode = '22023',
            hint = 'It is operator-facing and is never shown to the tenant.';
  end if;

  if not exists (select 1 from public.organizations o where o.id = p_org_id) then
    raise exception 'organization % not found', p_org_id using errcode = 'P0002';
  end if;

  -- org_suspensions_live_key makes a second live suspension a 23505; catch it
  -- here so the operator gets a sentence rather than a constraint name.
  if exists (
    select 1 from public.org_suspensions s
    where s.org_id = p_org_id and s.lifted_at is null
  ) then
    raise exception 'that organization is already suspended' using errcode = '23505';
  end if;

  insert into public.org_suspensions (org_id, suspended_by, reason)
  values (p_org_id, v_actor, v_reason);

  insert into public.platform_audit_events (actor_user_id, action, org_id, reason)
  values (v_actor, 'suspend_org', p_org_id, v_reason);
end;
$$;

create or replace function public.platform_unsuspend_org(p_org_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor  uuid := app.require_platform_admin();
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  update public.org_suspensions
  set lifted_at = now(), lifted_by = v_actor, lifted_reason = v_reason
  where org_id = p_org_id and lifted_at is null;

  if not found then
    raise exception 'that organization is not suspended' using errcode = 'P0002';
  end if;

  insert into public.platform_audit_events (actor_user_id, action, org_id, reason)
  values (v_actor, 'unsuspend_org', p_org_id, v_reason);
end;
$$;

-- ----------------------------------------------------------------------------
-- Founder invitations.
--
-- These reuse public.org_invitations with org_id IS NULL -- the shape that
-- table was built for, and the only representation app.signup_is_invited() and
-- public.create_organization() already consult. A separate table would mean
-- editing both, a second _auth_admin_read policy, a second expiry and
-- consumption lifecycle, and a second partial unique index: exactly the
-- duplication that table's header rejects in advance.
--
-- NOTHING ELSE CHANGES, and that is the point. org_invitations_admin_insert
-- keeps its `org_id is not null` clause -- that predicate is the wall stopping
-- an ORG admin minting a platform invitation, and it must stay. This function
-- is definer, owned by postgres, and FORCE ROW LEVEL SECURITY is never
-- enabled, so the insert succeeds with no policy change. Do NOT add a
-- platform-admin branch to that policy.
-- ----------------------------------------------------------------------------

create or replace function public.platform_invite_founder(p_email text, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := app.require_platform_admin();
  v_email extensions.citext := nullif(btrim(coalesce(p_email, '')), '')::extensions.citext;
  v_note  text := nullif(btrim(coalesce(p_note, '')), '');
  v_id    uuid;
begin
  if v_email is null then
    raise exception 'an email address is required' using errcode = '22023';
  end if;

  -- operator(extensions.=) is MANDATORY: with search_path = '' the citext `=`
  -- is invisible and PostgreSQL falls back to text = text, which is
  -- case-sensitive. This exact bug shipped once and hid for three phases.
  if exists (
    select 1 from public.org_invitations i
    where i.email operator(extensions.=) v_email
      and i.org_id is null
      and i.accepted_at is null
      and i.revoked_at is null
      and i.expires_at > now()
  ) then
    raise exception 'that address already has a pending founder invitation'
      using errcode = '23505';
  end if;

  insert into public.org_invitations (org_id, email, role, invited_by, note)
  values (null, v_email, null, v_actor, v_note)
  returning id into v_id;

  insert into public.platform_audit_events
    (actor_user_id, action, invitation_id, reason)
  values (v_actor, 'invite_founder', v_id, v_note);

  return v_id;
end;
$$;

create or replace function public.platform_revoke_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := app.require_platform_admin();
begin
  -- `org_id is null` is a SCOPE FENCE, not a filter: without it a platform
  -- admin could revoke an org's own internal staff invitations, which is that
  -- org's business and not theirs.
  update public.org_invitations
  set revoked_at = now()
  where id = p_invitation_id
    and org_id is null
    and accepted_at is null
    and revoked_at is null;

  if not found then
    raise exception 'no pending founder invitation with that id'
      using errcode = 'P0002',
            hint = 'It may already be accepted or revoked, or it may be an '
                   'organisation''s own staff invitation, which is not yours to revoke.';
  end if;

  insert into public.platform_audit_events (actor_user_id, action, invitation_id)
  values (v_actor, 'revoke_invitation', p_invitation_id);
end;
$$;

create or replace function public.platform_list_founder_invitations()
returns table (
  id          uuid,
  email       text,
  note        text,
  invited_at  timestamptz,
  expires_at  timestamptz,
  accepted_at timestamptz,
  revoked_at  timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app.require_platform_admin();
  return query
    select i.id, i.email::text, i.note, i.invited_at,
           i.expires_at, i.accepted_at, i.revoked_at
    from public.org_invitations i
    where i.org_id is null
    order by i.invited_at desc;
end;
$$;

-- ----------------------------------------------------------------------------
-- Audit log
-- ----------------------------------------------------------------------------

create or replace function public.platform_list_audit_events(p_limit integer default 100)
returns table (
  id            bigint,
  actor_name    text,
  action        text,
  org_id        uuid,
  org_name      text,
  invitation_id uuid,
  reason        text,
  created_at    timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app.require_platform_admin();
  return query
    select e.id, p.full_name, e.action, e.org_id, o.name,
           e.invitation_id, e.reason, e.created_at
    from public.platform_audit_events e
    join public.profiles p on p.id = e.actor_user_id
    left join public.organizations o on o.id = e.org_id
    order by e.created_at desc
    limit least(greatest(coalesce(p_limit, 100), 1), 500);
end;
$$;

-- ----------------------------------------------------------------------------
-- my_memberships() reports the flag, so the client can show the entry point.
-- ----------------------------------------------------------------------------

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
    'portal_clients', app.portal_memberships_all(),
    'is_platform_admin', app.is_platform_admin()
  );
$$;

-- ----------------------------------------------------------------------------
-- Grants.
--
-- The revoke_public_execute event trigger strips PUBLIC and anon from every
-- function created above. These are the explicit allowlist -- the only way a
-- browser reaches any of them. Mirrored in the block in
-- 20260909171800_close_rls_auto_enable.sql, which claims to be the API surface
-- written down in one place.
-- ----------------------------------------------------------------------------

grant execute on function public.platform_list_orgs()                          to authenticated;
grant execute on function public.platform_list_org_admins(uuid)                to authenticated;
grant execute on function public.platform_suspend_org(uuid, text)              to authenticated;
grant execute on function public.platform_unsuspend_org(uuid, text)            to authenticated;
grant execute on function public.platform_invite_founder(text, text)           to authenticated;
grant execute on function public.platform_revoke_invitation(uuid)              to authenticated;
grant execute on function public.platform_list_founder_invitations()           to authenticated;
grant execute on function public.platform_list_audit_events(integer)           to authenticated;
grant execute on function public.my_memberships()                              to authenticated;
