import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { withStaleClaimsRetry } from '@/lib/auth/refresh-on-stale-claims'
import { portalKeys } from '@/features/jobs/keys'

export interface SubmitRequestInput {
  clientId: string
  title: string
  description: string | null
  siteId: string | null
  requestedFor: string | null
}

/**
 * The only write a portal contact makes to `jobs`, and it goes through an
 * RPC because a contact deliberately has no insert or update policy on that
 * table at all.
 */
export function useSubmitJobRequest() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: SubmitRequestInput) =>
      withStaleClaimsRetry(async () => {
        // `?? undefined`, not `null`: these parameters are `default null`
        // server-side, and the generated types model an omitted argument as
        // undefined. The two are equivalent in Postgres.
        const { data, error } = await supabase.rpc('submit_job_request', {
          p_client_id: input.clientId,
          p_title: input.title,
          p_description: input.description ?? undefined,
          p_site_id: input.siteId ?? undefined,
          p_requested_for: input.requestedFor ?? undefined,
        })
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

export interface DecideQuoteInput {
  quoteId: string
  clientId: string
  jobId: string
  note: string | null
}

/**
 * Approve or decline. Never optimistic.
 *
 * This is the most consequential button in the product -- it commits the
 * client to a price. The server freezes a snapshot of exactly what they saw,
 * writes an append-only approval row and moves the job, all in one
 * transaction. Showing "approved" before that returns would be claiming an
 * outcome we do not yet have.
 */
export function useDecideQuote(decision: 'approve' | 'decline') {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: DecideQuoteInput) =>
      withStaleClaimsRetry(async () => {
        const { data, error } = await supabase.rpc(
          decision === 'approve' ? 'approve_quote' : 'decline_quote',
          { p_quote_id: input.quoteId, p_note: input.note ?? undefined },
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
