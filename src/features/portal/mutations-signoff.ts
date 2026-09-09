import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { withStaleClaimsRetry } from '@/lib/auth/refresh-on-stale-claims'
import { portalKeys } from '@/features/jobs/keys'

/**
 * Accept or reject finished work. Never optimistic.
 *
 * Accepting authorises an invoice, so the UI must not claim it happened before
 * the server has written the approval row and its snapshot. Declining returns
 * `job_status_changed: false` by design -- see SignoffPanel.
 */
export function useDecideCompletion(decision: 'approve' | 'decline') {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: {
      jobId: string
      clientId: string
      note: string | null
    }) =>
      withStaleClaimsRetry(async () => {
        const { data, error } = await supabase.rpc(
          decision === 'approve' ? 'accept_completion' : 'decline_completion',
          { p_job_id: input.jobId, p_note: input.note ?? undefined },
        )
        if (error) throw error
        return data
      }),
    onSuccess: (_data, input) => {
      void queryClient.invalidateQueries({
        queryKey: portalKeys.all(input.clientId),
      })
    },
  })
}
