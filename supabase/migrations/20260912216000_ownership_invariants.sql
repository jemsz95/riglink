-- ============================================================================
-- Exactly one owner per organisation, and a deliberate way to hand it over.
--
-- Before this, nothing stopped an org having two owners, or zero: an owner
-- could demote themselves, or delete their own membership row, and leave a
-- workspace nobody could administer. And there was no way to transfer a
-- company's account to a colleague.
--
-- THE INVARIANT
--
--   At every commit boundary, an organisation has exactly one owner.
--
--   <= 1   org_members_one_owner_per_org, a partial unique index
--   >= 1   org_members_ownership_guard, a DEFERRED constraint trigger
--
-- There is NO transaction-local flag. The first draft of this used the
-- `app.actor_kind` pattern -- set_config(..., true) in the RPC, read by the
-- trigger -- and it is unnecessary here: because the >= 1 check runs at
-- commit, the RPC's demote-then-promote passes on its own. That pattern earns
-- its place where it conveys INTENT that cannot be derived from the data
-- (app.actor_kind distinguishes a client-driven status change from a staff
-- one, which the row does not record). Ownership is derivable, so a flag would
-- only add a failure mode: left set, it disarms the guard for the rest of the
-- transaction.
--
-- A DEFERRED trigger is also what makes `delete from organizations` possible.
-- A BEFORE trigger would see the cascade remove the owner's membership row and
-- refuse, making the org undeletable.
--
-- WHY THE INDEX CANNOT BE DEFERRED, AND WHY THAT MATTERS
--
-- A unique INDEX is never deferrable; DEFERRABLE is a property of a
-- CONSTRAINT. PostgreSQL has no partial unique constraints, and
-- `add constraint ... unique using index` rejects a partial index. So two
-- owners must never exist, not even between two statements of one transaction
-- -- which makes the statement order inside transfer_ownership load-bearing,
-- not stylistic.
-- ============================================================================

create unique index org_members_one_owner_per_org
  on public.org_members (org_id) where role = 'owner';

-- ----------------------------------------------------------------------------
-- >= 1 owner
-- ----------------------------------------------------------------------------

create or replace function app.enforce_org_ownership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- The org itself is being deleted and took its members with it by cascade.
  -- There is no invariant left to hold, and without this branch
  -- `delete from organizations` is impossible.
  if not exists (select 1 from public.organizations o where o.id = old.org_id) then
    return null;
  end if;

  if not exists (
    select 1 from public.org_members m
    where m.org_id = old.org_id and m.role = 'owner'
  ) then
    raise exception 'organization % would be left with no owner', old.org_id
      using errcode = '23514',
            hint = 'Use public.transfer_ownership(org_id, new_owner_id).';
  end if;

  return null;
end;
$$;

-- Covers demotion AND self-deletion with no special case: the deleting owner
-- is the only owner, so the check finds none and raises with the hint.
create constraint trigger org_members_ownership_guard
  after delete or update on public.org_members
  deferrable initially deferred
  for each row execute function app.enforce_org_ownership();

-- ----------------------------------------------------------------------------
-- An org cannot be created without one.
--
-- Compatible with create_organization(), whose org_members insert lands in the
-- same transaction, before commit. Closes the "org with no owner" state that
-- until now was prevented only by convention -- organizations has no INSERT
-- policy, so the RPC was the only writer, and the RPC happened to be correct.
-- ----------------------------------------------------------------------------

create or replace function app.enforce_org_has_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.org_members m
    where m.org_id = new.id and m.role = 'owner'
  ) then
    raise exception 'organization % was created without an owner', new.id
      using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger organizations_require_owner
  after insert on public.organizations
  deferrable initially deferred
  for each row execute function app.enforce_org_has_owner();

-- ----------------------------------------------------------------------------
-- The transfer.
--
-- SECURITY DEFINER, and NOT for convenience. As SECURITY INVOKER this function
-- cannot work at all:
--
--   The demote fires org_members_bump_epoch, which writes auth_claim_epochs in
--   THIS transaction. The promote's RLS policy then calls app.orgs_with_role(),
--   which calls app.claims_fresh(), which reads auth_claim_epochs at a new
--   snapshot, sees the caller's own uncommitted bump, and raises P0001 --
--   against the caller who caused it. It would fail on its second statement,
--   every time.
--
-- That is a general trap worth knowing: any SECURITY INVOKER RPC that writes
-- org_members or client_contacts and then reads anything RLS-protected in the
-- same transaction destroys itself the same way.
--
-- Definer means RLS is off inside, so the guard below IS the security
-- boundary. It reads org_members LIVE rather than through an accessor -- live
-- is stricter than a token, and calling an accessor here would reintroduce the
-- same trap.
--
-- Two arguments, not one: org_members is `primary key (org_id, user_id)` with
-- no surrogate key, and a user can be a member of several orgs, so a bare
-- p_new_owner would be ambiguous.
-- ----------------------------------------------------------------------------

create or replace function public.transfer_ownership(
  p_org_id      uuid,
  p_new_owner_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if p_new_owner_id = v_uid then
    raise exception 'you already own this organization' using errcode = '23514';
  end if;

  if not exists (
    select 1 from public.org_members m
    where m.org_id = p_org_id and m.user_id = v_uid
      and m.role = 'owner' and m.accepted_at is not null
  ) then
    raise exception 'only the owner may transfer ownership' using errcode = '42501';
  end if;

  -- A suspended workspace changes nothing about itself.
  if exists (
    select 1 from public.org_suspensions s
    where s.org_id = p_org_id and s.lifted_at is null
  ) then
    raise exception 'this workspace is suspended' using errcode = '42501';
  end if;

  -- Accepted member of the SAME org. A pending invitee cannot be made owner:
  -- an org whose owner has never signed in is an org nobody can administer.
  if not exists (
    select 1 from public.org_members m
    where m.org_id = p_org_id and m.user_id = p_new_owner_id
      and m.accepted_at is not null
  ) then
    raise exception 'that person is not an accepted member of this organization'
      using errcode = '42501';
  end if;

  -- ORDER IS LOAD-BEARING. org_members_one_owner_per_org is a partial unique
  -- INDEX and cannot be deferred, so two owners must not exist even between
  -- these two statements. Demote, then promote -- never the reverse, and never
  -- a single multi-row `update ... set role = case ...`, which checks the
  -- index per row in an unspecified order.
  --
  -- No `for update` locking: the unique index serialises concurrent transfers
  -- and the loser gets 23505.
  update public.org_members set role = 'admin'
   where org_id = p_org_id and user_id = v_uid;

  update public.org_members set role = 'owner'
   where org_id = p_org_id and user_id = p_new_owner_id;
end;
$$;

grant execute on function public.transfer_ownership(uuid, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- A note on deleting the sole owner's account.
--
-- org_members.user_id references auth.users (id) ON DELETE CASCADE, so
-- deleting the sole owner's auth.users row cascades to their membership; the
-- deferred guard above then finds the org still present and ownerless and
-- ABORTS THE WHOLE DELETE. GoTrue's admin delete-user returns a 500.
--
-- That is the intended behaviour: transfer first, then delete. Rejected
-- alternatives were auto-promoting the longest-serving admin (which picks who
-- owns a company's data by accident of tenure) and changing the FK to ON
-- DELETE RESTRICT (which would block deleting any user with any membership --
-- much wider than the problem).
--
-- GoTrue's soft-delete path does not cascade and is the operationally
-- preferable way to disable an account.
-- ----------------------------------------------------------------------------
