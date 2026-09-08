import { queryOptions } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { withStaleClaimsRetry } from '@/lib/auth/refresh-on-stale-claims'
import type { StaffRole } from '@/lib/supabase/db'

export interface OrgMembership {
  id: string
  slug: string
  name: string
  logo_path: string | null
  brand_color: string | null
  timezone: string
  currency: string
  role: StaffRole
}

export interface PortalMembership {
  client_id: string
  client_name: string
  org_id: string
  org_slug: string
  org_name: string
}

export interface Memberships {
  orgs: Array<OrgMembership>
  portal_clients: Array<PortalMembership>
}

/**
 * Query keys are org-scoped from the first meaningful segment, so switching
 * org is a single invalidation and cross-tenant cache bleed is impossible.
 * Bleed looks exactly like an RLS breach to a customer even when it is not.
 */
export const orgKeys = {
  memberships: () => ['memberships'] as const,
  detail: (orgId: string) => ['org', orgId] as const,
}

async function fetchMemberships(): Promise<Memberships> {
  const { data, error } = await supabase.rpc('my_memberships')
  if (error) throw error
  return (data ?? { orgs: [], portal_clients: [] }) as unknown as Memberships
}

export const membershipsQuery = () =>
  queryOptions({
    queryKey: orgKeys.memberships(),
    queryFn: () => withStaleClaimsRetry(fetchMemberships),
    // Memberships gate routing, so a stale value sends users to the wrong
    // shell. Short window, and the epoch gate forces a refetch on any change.
    staleTime: 10_000,
  })

/**
 * Links a pending invitation to the freshly signed-in user, and reports
 * whether the caller must refresh its token before doing anything else.
 */
export async function bootstrapSession(): Promise<{ claimsStale: boolean }> {
  const { data, error } = await supabase.rpc('bootstrap_session')
  if (error) throw error
  const result = (data ?? {}) as { claims_stale?: boolean }
  return { claimsStale: result.claims_stale === true }
}

/**
 * Creates an org and makes the caller its owner.
 *
 * The membership insert bumps the caller's claim epoch, which invalidates the
 * token they are holding RIGHT NOW -- so the caller must refresh before its
 * next request or it will get P0001. We refresh proactively here rather than
 * letting the user's next action error and self-heal.
 */
export async function createOrganization(input: {
  name: string
  slug: string
}) {
  const { data, error } = await supabase.rpc('create_organization', {
    p_name: input.name,
    p_slug: input.slug,
  })
  if (error) throw error
  return data
}
