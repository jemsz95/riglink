import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { withStaleClaimsRetry } from '@/lib/auth/refresh-on-stale-claims'
import { platformKeys } from './keys'

/**
 * Suspending an organisation.
 *
 * Takes effect on the tenant's very NEXT statement -- enforcement is a live
 * read of `org_suspensions` inside the role accessors, not a claim, so there is
 * no token to wait out and no epoch fan-out to perform. Their already-loaded
 * SPA keeps rendering its shell for up to the 10s `staleTime` on
 * `my_memberships()`, but every query underneath it returns empty immediately.
 *
 * The reason is operator-facing and is never shown to the tenant; the app shows
 * them a generic message. Write it for whoever reads the audit log next year.
 */
export function useSuspendOrg() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ orgId, reason }: { orgId: string; reason: string }) =>
      withStaleClaimsRetry(async () => {
        const { error } = await supabase.rpc('platform_suspend_org', {
          p_org_id: orgId,
          p_reason: reason,
        })
        if (error) throw error
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: platformKeys.orgs() })
      void queryClient.invalidateQueries({ queryKey: platformKeys.audit() })
    },
  })
}

export function useUnsuspendOrg() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ orgId, reason }: { orgId: string; reason?: string }) =>
      withStaleClaimsRetry(async () => {
        const { error } = await supabase.rpc('platform_unsuspend_org', {
          p_org_id: orgId,
          p_reason: reason,
        })
        if (error) throw error
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: platformKeys.orgs() })
      void queryClient.invalidateQueries({ queryKey: platformKeys.audit() })
    },
  })
}

/**
 * Invites someone to create their own organisation.
 *
 * Writes an `org_invitations` row with `org_id IS NULL` -- the shape that table
 * was built for, and the one `app.signup_is_invited()` and
 * `create_organization()` already consult. The RPC takes no org parameter at
 * all, which is what makes "a platform operator cannot invite themselves into
 * someone else's workspace" structural rather than a rule.
 */
export function useInviteFounder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ email, note }: { email: string; note?: string }) =>
      withStaleClaimsRetry(async () => {
        const { error } = await supabase.rpc('platform_invite_founder', {
          p_email: email,
          p_note: note,
        })
        if (error) throw error
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: platformKeys.invitations(),
      })
      void queryClient.invalidateQueries({ queryKey: platformKeys.audit() })
    },
  })
}

export function useRevokeFounderInvitation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (invitationId: string) =>
      withStaleClaimsRetry(async () => {
        const { error } = await supabase.rpc('platform_revoke_invitation', {
          p_invitation_id: invitationId,
        })
        if (error) throw error
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: platformKeys.invitations(),
      })
      void queryClient.invalidateQueries({ queryKey: platformKeys.audit() })
    },
  })
}
