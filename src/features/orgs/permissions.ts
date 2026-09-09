import type { StaffRole } from '@/lib/supabase/db'

/**
 * The role set that may write tenant data.
 *
 * Mirrors the `*_staff_insert` / `*_staff_update` policies on clients, sites
 * and jobs, which all use `app.orgs_with_role(array['owner','admin',
 * 'dispatcher'])`. This is a UI gate ONLY -- RLS is the security boundary. It
 * exists so users are not shown forms the database will refuse, because a
 * button that always errors teaches people to distrust the whole app.
 *
 * Keep this list in step with those policies. If they diverge, prefer changing
 * this one: being too strict here hides a feature, while being too loose shows
 * a form that fails on submit.
 */
export const DISPATCH_ROLES: ReadonlyArray<StaffRole> = [
  'owner',
  'admin',
  'dispatcher',
]

export function canDispatch(role: string): boolean {
  return (DISPATCH_ROLES as ReadonlyArray<string>).includes(role)
}

/** Deleting and managing members is narrower: `*_admin_*` policies. */
export const ADMIN_ROLES: ReadonlyArray<StaffRole> = ['owner', 'admin']

export function canAdminister(role: string): boolean {
  return (ADMIN_ROLES as ReadonlyArray<string>).includes(role)
}

/**
 * The owner, and there is exactly one per org -- enforced by the partial
 * unique index `org_members_one_owner_per_org`, not by convention.
 *
 * An owner cannot be demoted or removed by anyone, including themselves: a
 * deferred constraint trigger refuses any statement that would leave an org
 * with no owner. The only way out is `public.transfer_ownership()`, which
 * demotes the outgoing owner to `admin` in the same transaction.
 */
export function isOwner(role: string): boolean {
  return role === 'owner'
}

/** Only the owner may hand the organisation over. */
export const canTransferOwnership = isOwner
