-- ============================================================================
-- A policy cannot read a deny-all table.
--
-- 20260912214000 rewrote profiles_org_mates_select with the suspension test
-- inlined:
--
--   and not exists (select 1 from public.org_suspensions s
--                   where s.org_id = mine.org_id and s.lifted_at is null)
--
-- A policy expression is evaluated as the CALLER, and `authenticated` holds no
-- privilege on public.org_suspensions -- that is the entire point of the table.
-- So every authenticated read of `profiles` failed with
--
--   42501 permission denied for table org_suspensions
--
-- Granting SELECT on org_suspensions to make the policy work would have undone
-- the design: the suspension reason is operator-facing and must never be
-- readable by the tenant, and a table nobody can read is what makes that true.
--
-- The fix routes through app.my_suspended_orgs() instead -- already SECURITY
-- DEFINER, already granted to authenticated, zero parameters and derived
-- entirely from auth.uid(), so it is not an oracle over anyone else's orgs.
-- Called with the `= any ((select f())::uuid[])` cast convention so it hoists
-- into a per-statement InitPlan rather than being evaluated per row.
--
-- General rule this is an instance of: inside a policy, reach for a definer
-- accessor, never a table the caller cannot read. Both of this migration and
-- its predecessor's bugs were the same mistake in two places, and both were
-- invisible when testing as `postgres`.
-- ============================================================================

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
        and mine.org_id <> all ((select app.my_suspended_orgs())::uuid[])
    )
  );
