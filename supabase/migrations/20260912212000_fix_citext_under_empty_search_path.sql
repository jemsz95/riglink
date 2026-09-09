-- ============================================================================
-- Fix: citext comparisons silently became case-SENSITIVE.
--
-- THE TRAP
--
-- Every function in this project pins `set search_path = ''`, which is correct
-- and is what stops a mutable search_path being a privilege-escalation surface
-- on a SECURITY DEFINER function.
--
-- But operators are resolved through the search_path by name. The `=` for
-- `citext` lives in the `extensions` schema, so with an empty search_path it
-- is not visible -- and PostgreSQL does not error. It falls back to the
-- implicit cast citext -> text and uses `text = text` from pg_catalog, which
-- is case-sensitive. Same syntax, opposite semantics, no warning:
--
--   set search_path = '';  'A@B.com'::citext = 'a@b.com'::citext   -> FALSE
--   default search_path;   'A@B.com'::citext = 'a@b.com'::citext   -> TRUE
--
-- The second line is what you get when you check it by hand in psql, which is
-- why this survived.
--
-- WHAT IT BROKE
--
-- `bootstrap_session` claims a client contact's invitation by matching
-- `client_contacts.email` -- a citext column chosen precisely so that case
-- would not matter. Under the empty search_path it did matter. A contact
-- invited as `Sam@Firm.com` who signed up as `sam@firm.com` would have had
-- their invitation silently NOT claimed: no error, no contact link, no portal
-- access, and nothing in the logs to explain it. Phase 3's end-to-end tests
-- all used lower-case addresses, so they never touched it.
--
-- THE FIX
--
-- Name the operator's schema explicitly: `a operator(extensions.=) b`. This
-- keeps `search_path = ''` and keeps the citext index usable, because it is
-- the same operator the index was built with. `lower()` on both sides would
-- also work but would not use the index and would quietly change what the
-- column means.
--
-- `scripts/check-sql-conventions.mjs` now fails the build on a bare `=`
-- between email columns in an empty-search_path function, so this cannot come
-- back unnoticed.
-- ============================================================================

create or replace function app.signup_is_invited(p_email extensions.citext)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select
    exists (
      select 1 from public.org_invitations i
      where i.email operator(extensions.=) p_email
        and i.accepted_at is null
        and i.revoked_at is null
        and i.expires_at > now()
    )
    or exists (
      select 1 from public.client_contacts c
      where c.email operator(extensions.=) p_email
        and c.revoked_at is null
        and c.user_id is null
    );
$$;

revoke execute on function app.signup_is_invited(extensions.citext)
  from public, anon, authenticated;
grant execute on function app.signup_is_invited(extensions.citext) to supabase_auth_admin;

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
        -- operator(extensions.=), not `=`. See the migration header.
        and c.email operator(extensions.=) v_email
      returning 1
    )
    select count(*) into v_contacts from claimed;

    with usable as (
      select i.id, i.org_id, i.role
      from public.org_invitations i
      where i.email operator(extensions.=) v_email
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
    'claims_stale', (v_contacts + v_invites + v_joined) > 0
  );
end;
$$;

revoke execute on function public.bootstrap_session() from public, anon;
grant execute on function public.bootstrap_session() to authenticated;

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
  where i.email operator(extensions.=) v_email
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
