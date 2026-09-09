import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { withStaleClaimsRetry } from '@/lib/auth/refresh-on-stale-claims'
import { jobKeys } from '@/features/jobs/keys'
import { invoiceKeys } from './keys'
import type { Invoice } from '@/lib/supabase/db'

/**
 * Raises a draft invoice for a job, copying the approved quote's lines.
 *
 * Idempotent by design rather than by client-side guarding: the RPC returns an
 * existing draft instead of creating a second one, so a double-click, a retry
 * or two dispatchers doing the same thing produce one invoice. Two drafts on
 * one job is how the wrong one gets sent.
 */
export function useCreateInvoice(orgId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: { jobId: string }) =>
      withStaleClaimsRetry(async (): Promise<Invoice> => {
        const { data, error } = await supabase.rpc('create_invoice_from_job', {
          p_job_id: input.jobId,
        })
        if (error) throw error
        return data
      }),
    onSuccess: (_data, input) => {
      void queryClient.invalidateQueries({ queryKey: invoiceKeys.all(orgId) })
      void queryClient.invalidateQueries({
        queryKey: jobKeys.detail(orgId, input.jobId),
      })
    },
  })
}

/**
 * Issues the invoice. Never optimistic.
 *
 * This is the moment the document becomes a demand for money and its lines
 * freeze. The RPC refuses an invoice with no lines and moves the job to
 * `invoiced` only if that edge is legal, so an already-closed job does not
 * abort the whole transaction -- the Phase 3 lesson, applied here from the
 * start rather than after it broke.
 */
export function useSendInvoice(orgId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: { invoiceId: string; jobId: string }) =>
      withStaleClaimsRetry(async (): Promise<Invoice> => {
        const { data, error } = await supabase.rpc('send_invoice', {
          p_invoice_id: input.invoiceId,
        })
        if (error) throw error
        return data
      }),
    onSuccess: (_data, input) => {
      void queryClient.invalidateQueries({ queryKey: invoiceKeys.all(orgId) })
      void queryClient.invalidateQueries({ queryKey: jobKeys.all(orgId) })
      void queryClient.invalidateQueries({
        queryKey: jobKeys.detail(orgId, input.jobId),
      })
    },
  })
}

/**
 * Records that an invoice was paid, or voids it.
 *
 * An ordinary update, not an RPC, because there is no payment integration to
 * reconcile with: somebody in the office knows the money arrived and says so.
 * `paid_at` and `voided_at` are set here because the check constraints require
 * a status and its timestamp to agree, and letting the caller send one without
 * the other would just produce a constraint violation with a worse message.
 */
export function useSetInvoiceStatus(orgId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: {
      invoiceId: string
      status: 'paid' | 'void'
      paymentRef?: string | null
    }) =>
      withStaleClaimsRetry(async () => {
        const now = new Date().toISOString()
        const patch =
          input.status === 'paid'
            ? {
                status: 'paid' as const,
                paid_at: now,
                payment_ref: input.paymentRef ?? null,
              }
            : { status: 'void' as const, voided_at: now }
        const { error } = await supabase
          .from('invoices')
          .update(patch)
          .eq('org_id', orgId)
          .eq('id', input.invoiceId)
        if (error) throw error
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: invoiceKeys.all(orgId) })
    },
  })
}
