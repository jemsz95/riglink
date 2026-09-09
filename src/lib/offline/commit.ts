import { supabase } from '@/lib/supabase/client'
import { isCommitAlreadyApplied } from './queue-state'
import { evidenceObjectPath } from './upload'
import type { QueuedUpload } from './store'

/**
 * The object name a committed photo points at.
 *
 * Recomputed from the item rather than read back from the upload result, so a
 * commit resumed in a later session -- after the upload finished but before
 * the row was written -- derives the same path instead of depending on state
 * that was never persisted.
 */
function storagePathFor(item: QueuedUpload): string {
  return evidenceObjectPath(item)
}

export class CommitError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number | null,
  ) {
    super(message)
    this.name = 'CommitError'
  }
}

/**
 * Writes the `job_evidence` row for one queued capture.
 *
 * Idempotent by construction: `unique (org_id, client_ref)` means a replay of
 * a commit whose response was lost conflicts instead of duplicating, and this
 * function reports that conflict as success. Without that, the most likely
 * failure in the field -- a request that arrived but whose reply did not --
 * would put the same photo on the job twice, every time.
 *
 * `captured_by` is sent explicitly and checked by the insert policy against
 * `auth.uid()`, so evidence cannot be attributed to a colleague.
 */
export async function commitEvidence(item: QueuedUpload): Promise<void> {
  const { error } = await supabase.from('job_evidence').insert({
    org_id: item.orgId,
    job_id: item.jobId,
    client_id: item.clientId,
    kind: item.kind,
    storage_path: item.kind === 'note' ? null : storagePathFor(item),
    mime_type: item.kind === 'note' ? null : item.mimeType,
    byte_size: item.kind === 'note' ? null : item.byteSize,
    width: item.width,
    height: item.height,
    caption: item.caption,
    body: item.body,
    captured_at: item.capturedAt,
    captured_by: item.capturedBy,
    client_ref: item.clientRef,
  })

  if (!error) return

  // supabase-js gives the POSTGRES code here, not an HTTP status, so the
  // already-applied check keys on the code. The unique violation on
  // (org_id, client_ref) is what a replayed commit produces, and it means the
  // first attempt worked.
  if (isCommitAlreadyApplied(0, error.code)) return

  throw new CommitError(error.message, httpStatusFromPostgrest(error.code))
}

/**
 * Maps the PostgREST/Postgres error code to the HTTP status the queue's
 * retry classifier expects. Only the cases that change the decision are
 * mapped; anything else is treated as no-status, i.e. retryable, which is the
 * safe direction for evidence.
 */
function httpStatusFromPostgrest(
  code: string | null | undefined,
): number | null {
  switch (code) {
    case '42501': // RLS refused. Retrying will be refused identically.
      return 403
    case '23503': // FK violation: the job is gone, or the client_id is wrong.
      return 422
    case '23514': // Check violation: the row shape is wrong.
      return 422
    case '22P02': // Malformed input.
      return 400
    case 'PGRST301': // JWT expired -- worth another attempt after a refresh.
      return 401
    default:
      return null
  }
}
