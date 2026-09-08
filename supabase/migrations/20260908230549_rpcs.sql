-- ============================================================================
-- SECURITY DEFINER RPCs.
--
-- NOTE: `set search_path = ''` is mandatory on every definer function, which
-- means NOTHING resolves unqualified -- including `citext`, which Supabase
-- installs into the `extensions` schema, not `public`. Hence
-- `extensions.citext` below. RPC parameters are plain `text` so the client
-- never has to know about a custom type.
--
-- These are now the largest attack surface in the application: a definer
-- function has turned RLS OFF, so its own authorization guard IS the security
-- boundary. Every function here begins with an explicit check that raises
-- errcode 42501, and every one has a test asserting an unauthorized caller is
-- rejected. Treat that as a review checklist item, not a convention.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Profile creation on signup.
--
-- Deliberately does NOT claim pending memberships: at INSERT time on
-- auth.users the email is typically unconfirmed, and claiming a client_contacts
-- row by unverified email is an account-takeover path (sign up as
-- cfo@bigclient.com, inherit their portal). Claiming happens in
-- bootstrap_session(), which requires a real authenticated session.
-- ---------------------------------------------------------------------------
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

  return null;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_new_user();

-- ---------------------------------------------------------------------------
-- bootstrap_session(): called by the client after every sign-in.
--
-- Idempotent. Links any pending client_contacts row whose email matches the
-- caller's VERIFIED address, and accepts any outstanding staff invitation.
-- Safe only because magic link and OAuth both prove control of the address --
-- hence the explicit email_confirmed_at check rather than trusting the JWT.
--
-- Also covers the case of a contact invited AFTER they already had an account,
-- which a signup-time trigger would miss entirely.
-- ---------------------------------------------------------------------------
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

    with accepted as (
      update public.org_members m
      set accepted_at = now()
      where m.user_id = v_uid
        and m.accepted_at is null
      returning 1
    )
    select count(*) into v_invites from accepted;
  end if;

  -- claims_stale tells the client whether to refresh its token immediately:
  -- either update above fired the epoch-bump trigger, which invalidates the
  -- token the caller is holding right now.
  return jsonb_build_object(
    'user_id', v_uid,
    'email_verified', v_verified,
    'contacts_claimed', v_contacts,
    'invitations_accepted', v_invites,
    'claims_stale', (v_contacts + v_invites) > 0
  );
end;
$$;

grant execute on function public.bootstrap_session() to authenticated;

-- ---------------------------------------------------------------------------
-- create_organization(): the ONLY path to a new org.
--
-- Deliberately not automatic on signup -- a client contact signing up must not
-- silently receive an organization of their own. The router sends a signed-in
-- user with zero memberships to /onboarding, which offers this or explains
-- that they have no invitations yet.
--
-- Creating the membership fires the epoch bump, so the caller's current token
-- becomes stale and their next request raises P0001 -> the client refreshes ->
-- the new token carries the new org. That handoff is automatic and intended.
-- ---------------------------------------------------------------------------
create or replace function public.create_organization(p_name text, p_slug text)
returns organizations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_org public.organizations;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if length(btrim(coalesce(p_name, ''))) = 0 then
    raise exception 'organization name is required' using errcode = 'check_violation';
  end if;

  insert into public.organizations (name, slug, created_by)
  values (btrim(p_name), lower(btrim(p_slug))::extensions.citext, v_uid)
  returning * into v_org;

  insert into public.org_members (org_id, user_id, role, accepted_at)
  values (v_org.id, v_uid, 'owner', now());

  return v_org;
end;
$$;

grant execute on function public.create_organization(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- my_memberships(): what the signed-in user can reach, in one round trip.
--
-- The router needs this before it can resolve /$orgSlug or decide between
-- /onboarding, the staff app and the portal. Reads through RLS via the
-- accessors rather than bypassing it, so it cannot leak.
-- ---------------------------------------------------------------------------
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
                  'id', o.id,
                  'slug', o.slug,
                  'name', o.name,
                  'logo_path', o.logo_path,
                  'brand_color', o.brand_color,
                  'timezone', o.timezone,
                  'currency', o.currency,
                  'role', app.role_in_org(o.id)
                )
                order by o.name
              )
       from public.organizations o
       where o.id = any ((select app.staff_orgs())::uuid[])),
      '[]'::jsonb
    ),
    'portal_clients', coalesce(
      (select jsonb_agg(
                jsonb_build_object(
                  'client_id', c.id,
                  'client_name', c.name,
                  'org_id', o.id,
                  'org_slug', o.slug,
                  'org_name', o.name
                )
                order by c.name
              )
       from public.clients c
       join public.organizations o on o.id = c.org_id
       where c.id = any ((select app.portal_clients())::uuid[])),
      '[]'::jsonb
    )
  );
$$;

grant execute on function public.my_memberships() to authenticated;
