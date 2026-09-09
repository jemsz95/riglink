/**
 * The upload queue's decision logic, as pure functions.
 *
 * Everything that decides whether a technician's photo survives lives here,
 * separately from Dexie, tus and React, because this is the part that must be
 * right and the only part that can be tested without a browser. The IO layers
 * are deliberately thin wrappers that ask this module what to do next.
 *
 * The pipeline is: compress -> store in IndexedDB -> upload resumably ->
 * insert the row. A phone can lose the network, lose the tab or be locked at
 * any point in that sequence, and resume hours later.
 */

/**
 * `queued`     the blob is in IndexedDB and nothing has been sent
 * `uploading`  a tus upload is in flight or was interrupted mid-flight
 * `uploaded`   the object is complete in storage; the row is not written yet
 * `committed`  the row exists; the blob is dead weight and can be dropped
 * `failed`     the last attempt failed; retryable until MAX_ATTEMPTS
 * `blocked`    permanently failed, or out of attempts. Needs a person.
 */
export type QueueStatus =
  'queued' | 'uploading' | 'uploaded' | 'committed' | 'failed' | 'blocked'

export type EvidenceKind = 'photo' | 'document' | 'note'

export interface QueueItem {
  /** Minted before the first attempt and never regenerated. It is the storage
   *  filename AND the `client_ref` the commit is deduplicated on, so a resumed
   *  item addresses exactly the same object and row as its first attempt. */
  clientRef: string
  orgId: string
  jobId: string
  clientId: string
  kind: EvidenceKind
  status: QueueStatus
  attempts: number
  /** Epoch ms. Null means "eligible now". */
  nextAttemptAt: number | null
  lastError: string | null
  /** The tus upload URL, so an interrupted transfer resumes instead of
   *  restarting. Null until the first PATCH has been accepted. */
  tusUrl: string | null
}

export type NextAction =
  | { type: 'upload' }
  | { type: 'commit' }
  /** Committed: the blob has served its purpose and should be evicted. */
  | { type: 'evict' }
  | { type: 'wait'; untilMs: number }
  /** Out of attempts or permanently rejected. Surfaced to the user. */
  | { type: 'blocked' }
  | { type: 'none' }

export const MAX_ATTEMPTS = 8

/** Retryable statuses. 408 and 429 are the server asking us to come back. */
const RETRYABLE_HTTP = new Set([408, 425, 429, 500, 502, 503, 504, 507, 509])

/**
 * A commit that returns 409 has ALREADY SUCCEEDED.
 *
 * `unique (org_id, client_ref)` means a replayed insert -- the case where the
 * first commit worked and its response was lost -- conflicts instead of
 * duplicating. Treating that conflict as failure is how you end up with the
 * same photo three times; treating it as success is the entire point of
 * minting `client_ref` up front. PostgREST maps 23505 to 409.
 */
export function isCommitAlreadyApplied(
  httpStatus: number,
  pgCode?: string | null,
): boolean {
  return httpStatus === 409 || pgCode === '23505'
}

/**
 * Whether a failed attempt is worth repeating.
 *
 * `null` means the request never got an HTTP status -- offline, DNS failure, a
 * dropped socket -- which is the normal case in the field and always
 * retryable. A 4xx that is not 408/425/429 means the server understood and
 * refused: retrying it just burns battery. 403 in particular means RLS said
 * no, and no amount of waiting changes that.
 */
export function classifyFailure(
  httpStatus: number | null,
): 'retryable' | 'permanent' {
  if (httpStatus == null) return 'retryable'
  if (RETRYABLE_HTTP.has(httpStatus)) return 'retryable'
  if (httpStatus >= 500) return 'retryable'
  return 'permanent'
}

const BASE_DELAY_MS = 2_000
const MAX_DELAY_MS = 5 * 60_000

/**
 * Exponential backoff with full jitter, capped at five minutes.
 *
 * Jitter is not decoration: a crew of six vans coming back into coverage at
 * the same moment would otherwise retry in lockstep and keep colliding. `rand`
 * is injectable so the curve can be asserted without stubbing globals.
 */
export function backoffMs(attempt: number, rand: () => number = Math.random) {
  const exponential = Math.min(
    BASE_DELAY_MS * 2 ** Math.max(0, attempt - 1),
    MAX_DELAY_MS,
  )
  // Full jitter: anywhere in [0, exponential]. Keeps the worst case bounded
  // while spreading a fleet out.
  return Math.round(exponential * rand())
}

export interface QueueContext {
  online: boolean
  now: number
}

/**
 * What to do with one item, right now.
 *
 * A single switch rather than scattered `if (item.status === ...)` checks at
 * the call sites, so the whole lifecycle is readable in one place and the
 * tests can enumerate it.
 */
export function nextAction(item: QueueItem, ctx: QueueContext): NextAction {
  if (item.status === 'committed') return { type: 'evict' }
  if (item.status === 'blocked') return { type: 'blocked' }

  if (item.attempts >= MAX_ATTEMPTS) return { type: 'blocked' }

  if (item.nextAttemptAt != null && item.nextAttemptAt > ctx.now) {
    return { type: 'wait', untilMs: item.nextAttemptAt }
  }

  // Everything past here needs the network. Checked after the terminal states
  // so an offline device still evicts committed blobs and still reports
  // blocked items.
  if (!ctx.online) return { type: 'none' }

  switch (item.status) {
    case 'uploaded':
      return { type: 'commit' }
    case 'queued':
    case 'uploading':
    case 'failed':
      // A note has no object to upload, so it goes straight to the commit. It
      // is the same pipeline -- queued offline, retried, deduplicated on
      // client_ref -- minus the transfer.
      return item.kind === 'note' ? { type: 'commit' } : { type: 'upload' }
  }
}

/** The item as it should be stored after a failure. */
export function afterFailure(
  item: QueueItem,
  httpStatus: number | null,
  message: string,
  rand: () => number = Math.random,
  now: number = Date.now(),
): QueueItem {
  const attempts = item.attempts + 1
  const permanent = classifyFailure(httpStatus) === 'permanent'
  const exhausted = attempts >= MAX_ATTEMPTS
  return {
    ...item,
    attempts,
    status: permanent || exhausted ? 'blocked' : 'failed',
    lastError: message,
    nextAttemptAt:
      permanent || exhausted ? null : now + backoffMs(attempts, rand),
  }
}

/**
 * Ordering for the pump: oldest first, and notes ahead of photos.
 *
 * A note is a few hundred bytes and often the thing a dispatcher is waiting
 * on ("valve seized, need the 24mm"), while a photo is megabytes. Sending the
 * cheap, high-value item first means one bar of signal delivers the message
 * even if the photo never gets through this window.
 */
export function comparePriority(a: QueueItem, b: QueueItem): number {
  if (a.kind !== b.kind) {
    if (a.kind === 'note') return -1
    if (b.kind === 'note') return 1
  }
  return a.clientRef.localeCompare(b.clientRef)
}
