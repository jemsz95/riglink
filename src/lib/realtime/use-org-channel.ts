import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { refreshSessionForStaleClaims } from '@/lib/auth/refresh-on-stale-claims'
import { jobKeys } from '@/features/jobs/keys'

/**
 * One realtime channel per org, invalidating job queries when anything moves.
 *
 * Deliberately coarse: the payload is ignored and the whole job key space is
 * invalidated, so the refetch goes through PostgREST and RLS. Patching the
 * cache from the payload would be faster and wrong -- `new_record` arrives with
 * no embedded client or site, and merging a partial row produces a list that
 * disagrees with the database until the next hard refresh.
 *
 * Requires `jobs` to be in the `supabase_realtime` publication
 * (20260909145552_realtime_jobs.sql). Without it the channel subscribes
 * successfully and no event ever arrives.
 *
 * VERIFIED AGAINST THE REAL PROJECT, including one caveat worth knowing: when
 * the Realtime tenant is cold it logs "Tenant is initializing" and creates its
 * wal2json slot on first subscribe, and a change made in that same instant is
 * not captured -- SUBSCRIBED had already been reported. Refetch-on-event
 * tolerates this by design (a missed event costs staleness until the next
 * event or refetch, never a wrong write), which is the main reason this
 * invalidates rather than patching the cache from the payload.
 */
export function useOrgChannel(orgId: string | undefined): void {
  const queryClient = useQueryClient()
  const retriedRef = useRef(false)

  useEffect(() => {
    if (!orgId) return

    let cancelled = false
    let coalesceTimer: ReturnType<typeof setTimeout> | undefined

    /**
     * A status change writes to `jobs` AND `job_status_events` in one
     * transaction, so two events arrive within milliseconds -- confirmed
     * against the live project, which delivered both bindings' events for a
     * single transition. Coalescing keeps that to one refetch; a bulk import
     * would otherwise produce a refetch per row.
     */
    const invalidateSoon = () => {
      if (coalesceTimer) return
      coalesceTimer = setTimeout(() => {
        coalesceTimer = undefined
        if (cancelled) return
        void queryClient.invalidateQueries({ queryKey: jobKeys.all(orgId) })
      }, 250)
    }

    const channel = supabase
      .channel(`org:${orgId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'jobs',
          // Server-side filter. Without it every subscriber in every org is
          // woken by every job change and RLS-filters it client-side.
          filter: `org_id=eq.${orgId}`,
        },
        invalidateSoon,
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'job_status_events',
          filter: `org_id=eq.${orgId}`,
        },
        invalidateSoon,
      )
      .subscribe((status) => {
        // Realtime checks RLS with the token it was handed, and our policies
        // RAISE on a token minted before a membership change. That surfaces as
        // a channel error rather than an empty result, so refresh and let the
        // effect re-subscribe -- once, because a second failure is a real
        // authorization answer and retrying would loop.
        if (status === 'CHANNEL_ERROR' && !retriedRef.current) {
          retriedRef.current = true
          void refreshSessionForStaleClaims()
        }
      })

    return () => {
      cancelled = true
      if (coalesceTimer) clearTimeout(coalesceTimer)
      // Removing rather than unsubscribing: a stale channel for a previous org
      // keeps its socket open and keeps invalidating that org's keys after a
      // switch, which is both wasted work and confusing in the network tab.
      void supabase.removeChannel(channel)
    }
  }, [orgId, queryClient])
}
