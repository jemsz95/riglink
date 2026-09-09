-- ============================================================================
-- Authorization before argument validation, in transfer_ownership.
--
-- The first version checked `p_new_owner_id = auth.uid()` before checking that
-- the caller was the owner, so a TECH calling
--
--   transfer_ownership(<their org>, <themselves>)
--
-- was told "you already own this organization" -- flatly false, and a sentence
-- that could send someone hunting for a bug in their own membership.
--
-- Not a hole: the same tech targeting anyone else got the correct 42501, and
-- targeting themselves changed nothing either way. But an error message is
-- also an assertion about the world, and this one was wrong.
--
-- Order is now: authenticated, then authorised, then arguments. The self-check
-- keeps its 23514 -- by the time it is reached the caller IS the owner, so
-- "you already own this organization" has become true.
-- ============================================================================

create or replace function public.transfer_ownership(
  p_org_id       uuid,
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

  if not exists (
    select 1 from public.org_members m
    where m.org_id = p_org_id and m.user_id = v_uid
      and m.role = 'owner' and m.accepted_at is not null
  ) then
    raise exception 'only the owner may transfer ownership' using errcode = '42501';
  end if;

  -- Reachable only by the actual owner now, so the sentence is true.
  if p_new_owner_id = v_uid then
    raise exception 'you already own this organization' using errcode = '23514';
  end if;

  if exists (
    select 1 from public.org_suspensions s
    where s.org_id = p_org_id and s.lifted_at is null
  ) then
    raise exception 'this workspace is suspended' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.org_members m
    where m.org_id = p_org_id and m.user_id = p_new_owner_id
      and m.accepted_at is not null
  ) then
    raise exception 'that person is not an accepted member of this organization'
      using errcode = '42501';
  end if;

  -- ORDER IS LOAD-BEARING: org_members_one_owner_per_org is a partial unique
  -- INDEX and cannot be deferred. Demote, then promote.
  update public.org_members set role = 'admin'
   where org_id = p_org_id and user_id = v_uid;

  update public.org_members set role = 'owner'
   where org_id = p_org_id and user_id = p_new_owner_id;
end;
$$;

grant execute on function public.transfer_ownership(uuid, uuid) to authenticated;
