-- ============================================================================
-- Phase 6: a team settings page needs to name colleagues.
--
-- `org_members.user_id` references `auth.users`, not `profiles` -- so there is
-- no relationship for PostgREST to embed through, and `profiles` carries only
-- a `profiles_self_select` policy, so a staff member could read their OWN
-- name and nobody else's. A team page built on that would list a column of
-- blanks.
--
-- Two narrow additions rather than one broad one:
--
-- 1. `profiles_org_mates_select` -- staff may read the profile of a user who
--    shares an org with them. Scoped through `org_members` on both sides, so
--    it grants nothing outside the caller's own orgs and nothing at all to a
--    portal contact, who has no `app.staff_orgs()`.
--
-- 2. `staff_member_v` -- the join, as a `security_invoker = on` view, so both
--    halves are still the caller's own policies. Without a real FK between
--    the two tables this join cannot be expressed as an embed at all.
--
-- WHAT THIS DELIBERATELY DOES NOT EXPOSE
--
-- `phone` and `avatar_url` are omitted from the view. A team list needs a
-- name and a role; a colleague's mobile number is not required to render it,
-- and `profiles` is the one table in this schema that holds personal data
-- about STAFF rather than about customers. The projection is the boundary --
-- the new policy grants row access to the whole profile row, so anything the
-- view does not select is available to a determined caller reading `profiles`
-- directly. Adding a staff-only column to `profiles` therefore needs the same
-- thought as adding one to `jobs`: see the README standard.
-- ============================================================================

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
    )
  );

create view public.staff_member_v with (security_invoker = on) as
select
  m.org_id,
  m.user_id,
  m.role,
  m.invited_at,
  m.accepted_at,
  p.full_name
from public.org_members m
left join public.profiles p on p.id = m.user_id;

comment on view public.staff_member_v is
  'The org''s staff with their display names. security_invoker = on: rows come '
  'from org_members'' own policies, and the name from profiles_org_mates_select. '
  'Deliberately omits profiles.phone and avatar_url.';

grant select on public.staff_member_v to authenticated;
