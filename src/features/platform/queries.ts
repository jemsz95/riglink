import { queryOptions } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { withStaleClaimsRetry } from '@/lib/auth/refresh-on-stale-claims'
import { platformKeys } from './keys'

/**
 * The platform operator's read surface.
 *
 * Every one of these is a `SECURITY DEFINER` RPC that opens with
 * `app.require_platform_admin()`. There is no table read anywhere in this file,
 * and that is the design: no RLS policy in the schema mentions
 * `app.is_platform_admin()`, so an operator querying `jobs` or `clients`
 * directly gets exactly what their own org memberships permit -- nothing, for
 * an operator who is a member of none. These RPCs are therefore the complete,
 * enumerable list of what they can see.
 *
 * Note what is NOT here: no job, client, quote or invoice counts. Those are a
 * revenue proxy, and nothing about managing an org needs them.
 */

export interface PlatformOrg {
  id: string
  name: string
  slug: string
  created_at: string
  suspended_at: string | null
  suspension_reason: string | null
  owners: number
  admins: number
  dispatchers: number
  techs: number
  members: number
}

export interface PlatformOrgAdmin {
  user_id: string
  role: string
  full_name: string | null
  email: string | null
  accepted_at: string | null
}

export interface FounderInvitation {
  id: string
  email: string
  note: string | null
  invited_at: string
  expires_at: string
  accepted_at: string | null
  revoked_at: string | null
}

export interface PlatformAuditEvent {
  id: number
  actor_name: string | null
  action: string
  org_id: string | null
  org_name: string | null
  invitation_id: string | null
  reason: string | null
  created_at: string
}

export const platformOrgsQuery = () =>
  queryOptions({
    queryKey: platformKeys.orgs(),
    queryFn: () =>
      withStaleClaimsRetry(async (): Promise<Array<PlatformOrg>> => {
        const { data, error } = await supabase.rpc('platform_list_orgs')
        if (error) throw error
        return data
      }),
  })

export const platformOrgAdminsQuery = (orgId: string) =>
  queryOptions({
    queryKey: platformKeys.orgAdmins(orgId),
    queryFn: () =>
      withStaleClaimsRetry(async (): Promise<Array<PlatformOrgAdmin>> => {
        const { data, error } = await supabase.rpc('platform_list_org_admins', {
          p_org_id: orgId,
        })
        if (error) throw error
        return data
      }),
  })

export const founderInvitationsQuery = () =>
  queryOptions({
    queryKey: platformKeys.invitations(),
    queryFn: () =>
      withStaleClaimsRetry(async (): Promise<Array<FounderInvitation>> => {
        const { data, error } = await supabase.rpc(
          'platform_list_founder_invitations',
        )
        if (error) throw error
        return data
      }),
  })

export const platformAuditQuery = () =>
  queryOptions({
    queryKey: platformKeys.audit(),
    queryFn: () =>
      withStaleClaimsRetry(async (): Promise<Array<PlatformAuditEvent>> => {
        const { data, error } = await supabase.rpc(
          'platform_list_audit_events',
          { p_limit: 200 },
        )
        if (error) throw error
        return data
      }),
  })

/** Mirrors `invitationState()` in features/orgs/invitations.ts. */
export function founderInvitationState(
  invitation: FounderInvitation,
): 'pending' | 'accepted' | 'revoked' | 'expired' {
  if (invitation.accepted_at) return 'accepted'
  if (invitation.revoked_at) return 'revoked'
  if (new Date(invitation.expires_at) < new Date()) return 'expired'
  return 'pending'
}
