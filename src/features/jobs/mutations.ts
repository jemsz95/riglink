import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { withStaleClaimsRetry } from '@/lib/auth/refresh-on-stale-claims'
import { jobKeys } from './keys'
import type { JobInsert, JobStatus } from '@/lib/supabase/db'

export interface CreateJobInput {
  client_id: string
  site_id: string | null
  title: string
  description: string | null
  priority: JobInsert['priority']
  requested_for: string | null
  internal_notes: string | null
}

/**
 * Creates a job, with its internal note, in one transaction.
 *
 * `create_job` rather than a plain insert because `internal_notes` moved to
 * `job_internal_notes` -- a staff-only side table, so that a portal contact
 * holding RLS row access to their own job rows cannot read it. Writing a job
 * and its note is therefore two statements, and two statements from a browser
 * are two PostgREST requests and two transactions. The RPC keeps them one.
 *
 * It is SECURITY INVOKER, so the caller's own policies decide exactly as they
 * did for the insert this replaces. `org_id` is not sent: the RPC derives it
 * from the client, which is one less thing a caller can assert and makes a job
 * disagreeing with its client impossible rather than merely constrained.
 *
 * The trigger-assigned `number` no longer needs a cast, because the RPC's
 * generated Args type describes parameters rather than a row.
 */
export function useCreateJob(orgId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: CreateJobInput) =>
      withStaleClaimsRetry(async () => {
        const { data, error } = await supabase.rpc('create_job', {
          p_client_id: input.client_id,
          p_title: input.title,
          p_description: input.description ?? undefined,
          p_site_id: input.site_id ?? undefined,
          p_priority: input.priority ?? undefined,
          p_requested_for: input.requested_for ?? undefined,
          p_internal_notes: input.internal_notes ?? undefined,
        })
        if (error) throw error
        return data
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: jobKeys.all(orgId) })
    },
  })
}

export interface UpdateJobInput {
  jobId: string
  patch: {
    title?: string
    description?: string | null
    site_id?: string | null
    priority?: JobInsert['priority']
    requested_for?: string | null
    lead_tech_id?: string | null
    scheduled_start?: string | null
    scheduled_end?: string | null
  }
}

/**
 * Sets or clears a job's internal note.
 *
 * Separate from `useUpdateJob` because the note is a different table now, and
 * separate from `useCreateJob` because it is edited on its own afterwards. A
 * blank value deletes the row: absence is how "no note" is stored, so there is
 * no such thing as a note that exists and says nothing.
 */
export function useSetJobInternalNotes(orgId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: { jobId: string; notes: string | null }) =>
      withStaleClaimsRetry(async () => {
        const { error } = await supabase.rpc('set_job_internal_notes', {
          p_job_id: input.jobId,
          // Not `undefined`: the RPC declares p_notes without a default, and
          // blank is what it treats as "delete the row".
          p_notes: input.notes ?? '',
        })
        if (error) throw error
      }),
    onSuccess: (_data, { jobId }) => {
      void queryClient.invalidateQueries({
        queryKey: jobKeys.detail(orgId, jobId),
      })
    },
  })
}

export function useUpdateJob(orgId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ jobId, patch }: UpdateJobInput) =>
      withStaleClaimsRetry(async () => {
        const { data, error } = await supabase
          .from('jobs')
          .update(patch)
          .eq('org_id', orgId)
          .eq('id', jobId)
          .select('id')
          .single()
        if (error) throw error
        return data
      }),
    onSuccess: (_data, { jobId }) => {
      void queryClient.invalidateQueries({
        queryKey: jobKeys.detail(orgId, jobId),
      })
      void queryClient.invalidateQueries({ queryKey: jobKeys.all(orgId) })
    },
  })
}

/**
 * Moves a job through the lifecycle.
 *
 * Deliberately NOT optimistic. The legal graph lives in the database and the
 * trigger is the only authority on it, so an optimistic badge would show a new
 * status and then snap back on a check violation -- worse than a half-second
 * spinner, especially with a client on the phone. The same trigger writes the
 * audit row, so history cannot diverge from state.
 *
 * `actor_kind` is not passed: it defaults to 'staff' inside the trigger. A
 * client-caused transition goes through a SECURITY DEFINER RPC that sets it,
 * which is why staff cannot forge a client approval.
 */
export function useTransitionJob(orgId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ jobId, to }: { jobId: string; to: JobStatus }) =>
      withStaleClaimsRetry(async () => {
        const { data, error } = await supabase
          .from('jobs')
          .update({ status: to })
          .eq('org_id', orgId)
          .eq('id', jobId)
          .select('id, status')
          .single()
        if (error) throw error
        return data
      }),
    onSuccess: (_data, { jobId }) => {
      void queryClient.invalidateQueries({
        queryKey: jobKeys.detail(orgId, jobId),
      })
      void queryClient.invalidateQueries({
        queryKey: jobKeys.statusEvents(orgId, jobId),
      })
      void queryClient.invalidateQueries({ queryKey: jobKeys.all(orgId) })
    },
  })
}
