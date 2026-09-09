import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { evidenceKeys } from '@/features/evidence/keys'
import { commitEvidence } from './commit'
import { nextAction, afterFailure, comparePriority } from './queue-state'
import {
  allPending,
  evictBlob,
  forget,
  offlineDb,
  patchUpload,
  sweepCommitted,
} from './store'
import { UploadError, uploadEvidence } from './upload'
import { useOnline } from './use-online'

export interface QueueSummary {
  /** Items still to send. */
  pending: number
  /** Items that need a person: refused, or out of attempts. */
  blocked: number
  /** 0..1 for the item currently transferring, or null when idle. */
  progress: number | null
  online: boolean
}

const IDLE_POLL_MS = 15_000

/**
 * Drives the queue. One pump for the whole app.
 *
 * Serial, not parallel: a phone on a weak uplink gets worse throughput from
 * three concurrent uploads than from one, and a serial pump means the progress
 * number on screen refers to something specific rather than an average of
 * three unrelated transfers.
 *
 * The pump is re-entrant-safe via a ref rather than state, because a
 * re-render must never start a second drain.
 */
export function useUploadQueue(): QueueSummary {
  const online = useOnline()
  const queryClient = useQueryClient()
  const draining = useRef(false)
  const [summary, setSummary] = useState<QueueSummary>({
    pending: 0,
    blocked: 0,
    progress: null,
    online,
  })

  const refreshSummary = useCallback(async (progress: number | null) => {
    const items = await allPending()
    setSummary({
      pending: items.filter(
        (i) => i.status !== 'committed' && i.status !== 'blocked',
      ).length,
      blocked: items.filter((i) => i.status === 'blocked').length,
      progress,
      online: navigator.onLine,
    })
  }, [])

  const drain = useCallback(async () => {
    if (draining.current) return
    draining.current = true
    try {
      // Loop until nothing is actionable, re-reading the queue each pass so a
      // capture added mid-drain is picked up without waiting for the poll.
      for (;;) {
        const items = (await allPending()).sort(comparePriority)
        const ctx = { online: navigator.onLine, now: Date.now() }

        let actedOn = false
        for (const item of items) {
          const action = nextAction(item, ctx)

          if (action.type === 'evict') {
            if (item.blob) await evictBlob(item.clientRef)
            continue
          }
          if (
            action.type === 'none' ||
            action.type === 'wait' ||
            action.type === 'blocked'
          ) {
            continue
          }

          actedOn = true
          try {
            if (action.type === 'upload') {
              await patchUpload(item.clientRef, { status: 'uploading' })
              const result = await uploadEvidence(item, {
                onProgress: (sent, total) =>
                  void refreshSummary(total > 0 ? sent / total : null),
                onUrl: (tusUrl) => void patchUpload(item.clientRef, { tusUrl }),
              })
              await patchUpload(item.clientRef, {
                status: 'uploaded',
                tusUrl: result.tusUrl,
                attempts: 0,
                lastError: null,
                nextAttemptAt: null,
              })
            } else {
              await commitEvidence(item)
              await evictBlob(item.clientRef)
              // The gallery is server state; the queue is local. Invalidate so
              // the committed item appears from the source of truth rather
              // than being trusted from the queue.
              void queryClient.invalidateQueries({
                queryKey: evidenceKeys.forJob(item.orgId, item.jobId),
              })
            }
          } catch (error) {
            const status =
              error instanceof UploadError
                ? error.httpStatus
                : httpStatusOf(error)
            const message =
              error instanceof Error ? error.message : String(error)
            // Re-read before recording the failure: `onUrl` may have persisted
            // a tus URL mid-attempt, and writing back the stale in-memory copy
            // would discard it and restart the transfer from zero next time.
            const latest =
              (await offlineDb().uploads.get(item.clientRef)) ?? item
            const decided = afterFailure(latest, status, message)
            await patchUpload(item.clientRef, {
              status: decided.status,
              attempts: decided.attempts,
              nextAttemptAt: decided.nextAttemptAt,
              lastError: decided.lastError,
            })
          }
          await refreshSummary(null)
        }

        await sweepCommitted()
        if (!actedOn) break
      }
    } finally {
      draining.current = false
      await refreshSummary(null)
    }
  }, [queryClient, refreshSummary])

  // Drain on mount, whenever the browser reports the network back, and on a
  // slow poll so a backoff window that expires while the app sits idle is
  // still picked up.
  useEffect(() => {
    void drain()
    const onOnline = () => void drain()
    window.addEventListener('online', onOnline)
    const timer = setInterval(() => void drain(), IDLE_POLL_MS)
    return () => {
      window.removeEventListener('online', onOnline)
      clearInterval(timer)
    }
  }, [drain, online])

  return summary
}

function httpStatusOf(error: unknown): number | null {
  if (error && typeof error === 'object' && 'httpStatus' in error) {
    const { httpStatus } = error
    return typeof httpStatus === 'number' ? httpStatus : null
  }
  return null
}

export { forget as forgetQueuedUpload }
