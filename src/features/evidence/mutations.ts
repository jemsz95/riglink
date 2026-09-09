import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { withStaleClaimsRetry } from '@/lib/auth/refresh-on-stale-claims'
import { compressImage } from '@/lib/offline/image'
import { enqueue } from '@/lib/offline/store'
import { evidenceKeys } from './keys'
import type { EvidenceKind } from '@/lib/supabase/db'

export interface CaptureInput {
  orgId: string
  jobId: string
  clientId: string
  capturedBy: string
  file: File
  caption: string | null
}

/**
 * Accepts a captured file into the durable queue and returns immediately.
 *
 * Deliberately NOT an upload. The tech taps the shutter, the photo is
 * compressed and written to IndexedDB, and the function is done -- so the UI
 * confirms the capture in a few hundred milliseconds whether or not there is
 * any signal. The pump takes it from there and will still be trying tomorrow
 * morning if it has to.
 *
 * `client_ref` is minted HERE, once, before anything can fail. It becomes both
 * the storage filename and the row's dedup key, so every subsequent attempt
 * addresses the same object and the same row.
 */
export function useCaptureEvidence() {
  return useMutation({
    mutationFn: async (input: CaptureInput) => {
      const clientRef = crypto.randomUUID()
      const compressed = await compressImage(input.file, input.file.type)

      await enqueue({
        clientRef,
        orgId: input.orgId,
        jobId: input.jobId,
        clientId: input.clientId,
        kind: input.file.type === 'application/pdf' ? 'document' : 'photo',
        blob: compressed.blob,
        mimeType: compressed.mimeType,
        byteSize: compressed.blob.size,
        width: compressed.width || null,
        height: compressed.height || null,
        caption: input.caption,
        body: null,
        capturedAt: new Date().toISOString(),
        capturedBy: input.capturedBy,
      })

      return { clientRef, bytes: compressed.blob.size }
    },
  })
}

export interface NoteInput {
  orgId: string
  jobId: string
  clientId: string
  capturedBy: string
  body: string
}

/**
 * Queues a field note. Same pipeline, no transfer.
 *
 * Notes go through the queue rather than straight to the API so that a note
 * typed in a basement is not lost, and so the ordering guarantee holds: the
 * pump sends notes ahead of photos, because a few hundred bytes saying "valve
 * seized, need the 24mm" is what the office is actually waiting for.
 */
export function useAddNote() {
  return useMutation({
    mutationFn: async (input: NoteInput) => {
      const clientRef = crypto.randomUUID()
      await enqueue({
        clientRef,
        orgId: input.orgId,
        jobId: input.jobId,
        clientId: input.clientId,
        kind: 'note' satisfies EvidenceKind,
        blob: null,
        mimeType: 'text/plain',
        byteSize: new Blob([input.body]).size,
        width: null,
        height: null,
        caption: null,
        body: input.body,
        capturedAt: new Date().toISOString(),
        capturedBy: input.capturedBy,
      })
      return { clientRef }
    },
  })
}

/**
 * Toggles whether the client can see one piece of evidence.
 *
 * Not optimistic. This decides what a customer sees about their own job, and
 * showing "visible" a moment before the server agrees -- or worse, leaving the
 * toggle looking on after a refused update -- is the wrong way to be wrong.
 *
 * Flipping this off takes effect for new signed URLs immediately, because the
 * storage policy consults `client_visible`. A URL already issued stays valid
 * until it expires, which is why evidence URLs are signed for 60 seconds.
 */
export function useSetEvidenceVisibility(orgId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: { id: string; jobId: string; visible: boolean }) =>
      withStaleClaimsRetry(async () => {
        const { error } = await supabase
          .from('job_evidence')
          .update({ client_visible: input.visible })
          .eq('org_id', orgId)
          .eq('id', input.id)
        if (error) throw error
      }),
    onSuccess: (_data, input) => {
      void queryClient.invalidateQueries({
        queryKey: evidenceKeys.forJob(orgId, input.jobId),
      })
    },
  })
}

/** Fixes a caption or a note body after the fact. */
export function useUpdateEvidenceText(orgId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: {
      id: string
      jobId: string
      caption?: string | null
      body?: string | null
    }) =>
      withStaleClaimsRetry(async () => {
        const patch: { caption?: string | null; body?: string | null } = {}
        if (input.caption !== undefined) patch.caption = input.caption
        if (input.body !== undefined) patch.body = input.body
        const { error } = await supabase
          .from('job_evidence')
          .update(patch)
          .eq('org_id', orgId)
          .eq('id', input.id)
        if (error) throw error
      }),
    onSuccess: (_data, input) => {
      void queryClient.invalidateQueries({
        queryKey: evidenceKeys.forJob(orgId, input.jobId),
      })
    },
  })
}
