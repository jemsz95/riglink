import {
  queryOptions,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { withStaleClaimsRetry } from '@/lib/auth/refresh-on-stale-claims'
import type { StaffRole } from '@/lib/supabase/db'

export const invitationKeys = {
  list: (orgId: string) => ['org', orgId, 'invitations'] as const,
}

export interface Invitation {
  id: string
  email: string
  role: StaffRole | null
  invited_at: string
  expires_at: string
  accepted_at: string | null
  revoked_at: string | null
}

/**
 * Pending and recently-settled invitations for one org.
 *
 * Accepted and revoked rows are kept and shown: "who invited this person, and
 * when" is the question asked after something goes wrong, and an invitation
 * list that only shows what is outstanding cannot answer it. There is no
 * DELETE grant on the table for the same reason.
 */
export const orgInvitationsQuery = (orgId: string) =>
  queryOptions({
    queryKey: invitationKeys.list(orgId),
    queryFn: () =>
      withStaleClaimsRetry(async (): Promise<Array<Invitation>> => {
        const { data, error } = await supabase
          .from('org_invitations')
          .select(
            'id, email, role, invited_at, expires_at, accepted_at, revoked_at',
          )
          .eq('org_id', orgId)
          .order('invited_at', { ascending: false })
          .limit(50)
        if (error) throw error
        return data
      }),
  })

/**
 * Invites a colleague by email.
 *
 * The email is all that is needed: `org_invitations` is email-keyed precisely
 * so the person does not have to exist yet. They sign up with that address --
 * which the signup hook now permits BECAUSE of this row -- and
 * `bootstrap_session()` turns the invitation into a membership on their first
 * sign-in.
 *
 * `invited_by` is sent explicitly and checked by the insert policy against
 * `auth.uid()`, so an invitation cannot be attributed to a colleague.
 */
export function useInviteTeammate(orgId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: { email: string; role: StaffRole; userId: string }) =>
      withStaleClaimsRetry(async () => {
        const { error } = await supabase.from('org_invitations').insert({
          org_id: orgId,
          email: input.email.trim(),
          role: input.role,
          invited_by: input.userId,
        })
        if (error) throw error
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: invitationKeys.list(orgId),
      })
    },
  })
}

/**
 * Withdraws an invitation.
 *
 * Sets `revoked_at` rather than deleting: the signup hook consults
 * `revoked_at is null`, so revoking also closes the door that the invitation
 * opened. Someone who was invited by mistake stops being able to create an
 * account at all.
 */
export function useRevokeInvitation(orgId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: { id: string }) =>
      withStaleClaimsRetry(async () => {
        const { error } = await supabase
          .from('org_invitations')
          .update({ revoked_at: new Date().toISOString() })
          .eq('org_id', orgId)
          .eq('id', input.id)
        if (error) throw error
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: invitationKeys.list(orgId),
      })
    },
  })
}

/** `pending` is the only state the signup hook will accept. */
export function invitationState(
  invitation: Invitation,
  now: Date = new Date(),
): 'pending' | 'accepted' | 'revoked' | 'expired' {
  if (invitation.accepted_at) return 'accepted'
  if (invitation.revoked_at) return 'revoked'
  if (new Date(invitation.expires_at) <= now) return 'expired'
  return 'pending'
}
