import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { withStaleClaimsRetry } from '@/lib/auth/refresh-on-stale-claims'
import { jobKeys } from './keys'
import type { JobInsert, JobStatus } from '@/lib/supabase/db'
import type { TablesInsert } from '@/lib/supabase/database.types'

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
 * `number` is never sent: a BEFORE INSERT trigger assigns it from a per-org
 * gapless sequence. `JobInsert` omits it so this cannot be got wrong.
 *
 * The cast at the call is the one place that lie is told. The type generator
 * cannot see triggers, so the generated Insert type marks `number` required;
 * `satisfies JobInsert` still checks the shape we actually send, and the cast
 * is confined to this single line rather than loosening the column types.
 */
export function useCreateJob(orgId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: CreateJobInput) =>
      withStaleClaimsRetry(async () => {
        const row = { ...input, org_id: orgId } satisfies JobInsert
        const { data, error } = await supabase
          .from('jobs')
          .insert(row as TablesInsert<'jobs'>)
          .select('id, number')
          .single()
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
    internal_notes?: string | null
    lead_tech_id?: string | null
    scheduled_start?: string | null
    scheduled_end?: string | null
  }
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
