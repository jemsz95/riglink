-- ============================================================================
-- Email-keyed invitations, and the gate that makes signup invite-only.
--
-- THE GAP THIS FILLS
--
-- Client contacts were always invitable by email: `client_contacts` holds an
-- email before any `auth.users` row exists, and `bootstrap_session()` links
-- the two on first login. Staff were not. `org_members` is keyed by
-- `user_id`, so a staff "invitation" could only be written AFTER the person
-- already had an account -- which meant there was no way to invite a
-- colleague, and nothing for a signup gate to check against.
--
-- ONE TABLE, TWO KINDS OF INVITATION
--
--   org_id IS NOT NULL  join this organisation as `role`
--   org_id IS NULL      create your own organisation (onboarding a new
--                       contractor onto the platform)
--
-- The second kind is what keeps `create_organization()` from being an open
-- door once signup is closed: without it, an invited client contact could
-- sign in and spin up a contractor workspace of their own, which is not what
-- inviting them to see their own jobs was meant to permit.
--
-- Deliberately one table rather than two: both are "this email address is
-- expected, here is what it may do", both expire, both are consumed once, and
-- both are read by the same signup gate. Splitting them would duplicate the
-- lifecycle and the policies for a single nullable column.
--
-- EMAIL IS `citext`, matching `client_contacts.email`. An invitation sent to
-- `Sam@Firm.com` must match a signup as `sam@firm.com`; anything else is a
-- support ticket that looks like a bug in the email.
-- ============================================================================

create table public.org_invitations (
  id          uuid primary key default gen_random_uuid(),

  -- Null means "invited to create an organisation", not "invited to nothing".
  org_id      uuid references public.organizations (id) on delete cascade,
  email       extensions.citext not null,
  role        public.staff_role,

  invited_by  uuid references public.profiles (id) on delete set null,
  invited_at  timestamptz not null default now(),
  -- Invitations rot. An address that was right in March may belong to someone
  -- else by September, and an invitation is a key to a tenant's data.
  expires_at  timestamptz not null default now() + interval '14 days',

  accepted_at timestamptz,
  accepted_by uuid references public.profiles (id) on delete set null,
  revoked_at  timestamptz,
  note        text,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint org_invitations_email_shape
    check (length(btrim(email::text)) > 0 and email::text like '%@%'),

  -- A role only means something when joining an existing org. Someone
  -- invited to create their own is its owner by construction.
  constraint org_invitations_role_matches_kind
    check ((org_id is null) = (role is null)),

  constraint org_invitations_accepted_has_actor
    check ((accepted_at is null) = (accepted_by is null))
);

-- One live invitation per address per org. Accepted and revoked rows stay as
-- history, so the partial index is on the pending ones only.
create unique index org_invitations_pending_org_email_key
  on public.org_invitations (org_id, email)
  where accepted_at is null and revoked_at is null and org_id is not null;

-- NULLs never collide in a unique index, so platform invitations need their
-- own constraint or the same address could be invited to onboard repeatedly.
create unique index org_invitations_pending_platform_email_key
  on public.org_invitations (email)
  where accepted_at is null and revoked_at is null and org_id is null;

-- The signup gate and bootstrap_session both look up by email.
create index org_invitations_email_idx on public.org_invitations (email)
  where accepted_at is null and revoked_at is null;
create index org_invitations_org_idx on public.org_invitations (org_id, invited_at desc);
create index org_invitations_invited_by_idx on public.org_invitations (invited_by);

create trigger org_invitations_updated_at before update on public.org_invitations
  for each row execute function app.set_updated_at();

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------

alter table public.org_invitations enable row level security;

create policy org_invitations_staff_select on public.org_invitations
  for select to authenticated
  using (org_id = any ((select app.orgs_with_role(array['owner', 'admin']))::uuid[]));

-- Owners and admins invite into their OWN org. The `org_id is not null` in the
-- predicate is what stops an admin minting a platform invitation -- that is an
-- operator action, taken deliberately in SQL, not something the app exposes.
create policy org_invitations_admin_insert on public.org_invitations
  for insert to authenticated
  with check (
    org_id is not null
    and org_id = any ((select app.orgs_with_role(array['owner', 'admin']))::uuid[])
    and invited_by = (select auth.uid())
  );

create policy org_invitations_admin_update on public.org_invitations
  for update to authenticated
  using (org_id = any ((select app.orgs_with_role(array['owner', 'admin']))::uuid[]))
  with check (org_id = any ((select app.orgs_with_role(array['owner', 'admin']))::uuid[]));

-- The signup hook runs as supabase_auth_admin and must read pending
-- invitations to decide. Same pattern as auth_claim_epochs_auth_admin_read:
-- an explicit read policy rather than a SECURITY DEFINER function, so what
-- the hook can see is visible in the catalogue.
create policy org_invitations_auth_admin_read on public.org_invitations
  for select to supabase_auth_admin
  using (true);

grant select, insert, update on public.org_invitations to authenticated;
grant select on public.org_invitations to supabase_auth_admin;

-- No DELETE grant at all. An invitation is revoked, not erased: "who invited
-- this person, and when" is the question you ask after something goes wrong.

-- ----------------------------------------------------------------------------
-- Is this address expected?
--
-- SECURITY INVOKER so it is subject to the caller's policies -- which for the
-- hook means the `_auth_admin_read` policies above, and for anyone else means
-- almost nothing. It is not granted to `authenticated` at all: letting a
-- signed-in user probe which addresses are invited is an enumeration oracle
-- over another tenant's staff list.
-- ----------------------------------------------------------------------------

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
      where i.email = p_email
        and i.accepted_at is null
        and i.revoked_at is null
        and i.expires_at > now()
    )
    or exists (
      -- A client contact invited to the portal. Already email-keyed, and the
      -- reason `client_contacts` rows can exist before any auth user does.
      select 1 from public.client_contacts c
      where c.email = p_email
        and c.revoked_at is null
        and c.user_id is null
    );
$$;

revoke execute on function app.signup_is_invited(extensions.citext)
  from public, anon, authenticated;
grant execute on function app.signup_is_invited(extensions.citext) to supabase_auth_admin;
