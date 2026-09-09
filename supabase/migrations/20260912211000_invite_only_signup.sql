-- ============================================================================
-- Invite-only signup, and closing the second door.
--
-- Two independent things had to change, because signup was not the only way in:
--
--   1. ANYONE COULD CREATE AN ACCOUNT. `signInWithOtp` defaults to
--      `shouldCreateUser: true`, so any address typed into the login form got
--      a user and a magic link. The `before_user_created` hook below rejects a
--      signup unless the address was invited.
--
--   2. ANYONE WITH AN ACCOUNT COULD CREATE AN ORGANISATION.
--      `create_organization()` was granted to `authenticated` with no further
--      check. Closing only signup would have left an invited CLIENT CONTACT --
--      someone invited to view their own jobs -- able to sign in and spin up a
--      contractor workspace of their own. Gated below on a platform
--      invitation.
--
-- FIRST-RUN BOOTSTRAP
--
-- On a brand-new project there is nobody to issue an invitation, so the hook
-- allows the signup when `auth.users` is empty, and `create_organization`
-- allows the first org when `organizations` is empty. After that both are
-- closed. Two simultaneous first signups could both pass the check -- the read
-- is not serialised against the insert -- which is an acceptable race for
-- "who gets to be the first user of an empty deployment", and is written down
-- here rather than discovered later.
--
-- WHAT THIS DOES NOT AFFECT
--
-- Existing users. `before_user_created` fires only on CREATE, so everyone who
-- already has an account keeps signing in exactly as before. Turning this on
-- cannot lock out the people already using the system.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. The signup gate.
--
-- SECURITY INVOKER, matching app.custom_access_token_hook: what the hook can
-- see is the `_auth_admin_read` policies, visible in the catalogue, rather
-- than the unbounded reach of a definer function.
--
-- It fires for OAuth as well as email, so enabling Google later does not open
-- a side entrance.
-- ----------------------------------------------------------------------------

create or replace function app.before_user_created_hook(event jsonb)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_email extensions.citext := nullif(btrim(event -> 'user' ->> 'email'), '')::extensions.citext;
begin
  -- No address to check. Phone and anonymous sign-ins are both disabled, so
  -- this is a shape we do not expect; refuse rather than fall open.
  if v_email is null then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message', 'Sign-up requires an email address.'
      )
    );
  end if;

  -- First run: an empty project has nobody who could have invited anyone.
  if not exists (select 1 from auth.users) then
    return '{}'::jsonb;
  end if;

  if app.signup_is_invited(v_email) then
    return '{}'::jsonb;
  end if;

  -- Deliberately does NOT say whether the address is known, invited but
  -- expired, or already registered. A signup form that distinguishes those is
  -- an account-enumeration oracle, and the person who needs the difference
  -- explained is on the phone to the contractor anyway.
  return jsonb_build_object(
    'error', jsonb_build_object(
      'http_code', 403,
      'message', 'This email has not been invited. Ask your contractor to send you an invitation.'
    )
  );
end;
$$;

grant execute on function app.before_user_created_hook(jsonb) to supabase_auth_admin;
revoke execute on function app.before_user_created_hook(jsonb) from public, anon, authenticated;

-- The hook reads auth.users to detect an empty project. supabase_auth_admin
-- owns that table, so no extra grant is needed there -- but it does need to
-- reach the two public tables app.signup_is_invited() consults. client_contacts
-- already has client_contacts_auth_admin_read; org_invitations got its own in
-- the previous migration.

-- ----------------------------------------------------------------------------
-- 2. Accepting a staff invitation on first sign-in.
--
-- Previously `bootstrap_session` could only mark an EXISTING org_members row
-- accepted, which required someone to have added the person by user_id after
-- they already had an account. Now an emailed invitation becomes a membership
-- the first time they log in, which is what makes inviting a colleague work
-- end to end.
-- ----------------------------------------------------------------------------

create or replace function public.bootstrap_session()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_email    extensions.citext;
  v_verified boolean;
  v_contacts integer := 0;
  v_invites  integer := 0;
  v_joined   integer := 0;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select u.email::extensions.citext, (u.email_confirmed_at is not null)
  into v_email, v_verified
  from auth.users u
  where u.id = v_uid;

  if v_email is null then
    raise exception 'no user record' using errcode = '42501';
  end if;

  insert into public.profiles (id) values (v_uid) on conflict (id) do nothing;

  if v_verified then
    with claimed as (
      update public.client_contacts c
      set user_id = v_uid,
          accepted_at = coalesce(c.accepted_at, now())
      where c.user_id is null
        and c.revoked_at is null
        and c.email = v_email
      returning 1
    )
    select count(*) into v_contacts from claimed;

    -- Emailed staff invitations become memberships. `on conflict do nothing`
    -- because a person may already be a member -- an invitation that arrives
    -- late should be consumed, not raise.
    with usable as (
      select i.id, i.org_id, i.role
      from public.org_invitations i
      where i.email = v_email
        and i.org_id is not null
        and i.accepted_at is null
        and i.revoked_at is null
        and i.expires_at > now()
    ),
    joined as (
      insert into public.org_members (org_id, user_id, role, accepted_at)
      select u.org_id, v_uid, u.role, now() from usable u
      on conflict (org_id, user_id) do nothing
      returning 1
    ),
    consumed as (
      update public.org_invitations i
      set accepted_at = now(), accepted_by = v_uid
      where i.id in (select id from usable)
      returning 1
    )
    select
      (select count(*) from joined),
      (select count(*) from consumed)
    into v_joined, v_invites;

    -- Memberships created before this function existed, or added directly by
    -- an admin, still need accepting.
    with accepted as (
      update public.org_members m
      set accepted_at = now()
      where m.user_id = v_uid
        and m.accepted_at is null
      returning 1
    )
    select v_invites + count(*) into v_invites from accepted;
  end if;

  return jsonb_build_object(
    'user_id', v_uid,
    'email_verified', v_verified,
    'contacts_claimed', v_contacts,
    'invitations_accepted', v_invites,
    'memberships_created', v_joined,
    -- Any of the writes above fires the epoch-bump trigger, which invalidates
    -- the token the caller is holding right now.
    'claims_stale', (v_contacts + v_invites + v_joined) > 0
  );
end;
$$;

revoke execute on function public.bootstrap_session() from public, anon;
grant execute on function public.bootstrap_session() to authenticated;

-- ----------------------------------------------------------------------------
-- 3. The second door: creating an organisation.
--
-- Allowed when the caller holds a PLATFORM invitation (org_id is null), or on
-- a project with no organisations yet. The invitation is consumed, so it
-- cannot onboard two workspaces.
-- ----------------------------------------------------------------------------

create or replace function public.create_organization(p_name text, p_slug text)
returns public.organizations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_email  extensions.citext;
  v_invite uuid;
  v_org    public.organizations;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select u.email::extensions.citext into v_email from auth.users u where u.id = v_uid;

  select i.id into v_invite
  from public.org_invitations i
  where i.email = v_email
    and i.org_id is null
    and i.accepted_at is null
    and i.revoked_at is null
    and i.expires_at > now()
  limit 1;

  if v_invite is null and exists (select 1 from public.organizations) then
    raise exception 'not invited to create an organisation'
      using errcode = '42501',
            hint = 'Ask the operator for an onboarding invitation, or accept an invitation to join an existing organisation.';
  end if;

  insert into public.organizations (name, slug, created_by)
  values (p_name, p_slug, v_uid)
  returning * into v_org;

  insert into public.org_members (org_id, user_id, role, accepted_at)
  values (v_org.id, v_uid, 'owner', now());

  if v_invite is not null then
    update public.org_invitations
    set accepted_at = now(), accepted_by = v_uid
    where id = v_invite;
  end if;

  return v_org;
end;
$$;

revoke execute on function public.create_organization(text, text) from public, anon;
grant execute on function public.create_organization(text, text) to authenticated;
