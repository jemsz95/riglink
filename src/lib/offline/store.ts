import Dexie from 'dexie'
import type { EntityTable } from 'dexie'
import type { EvidenceKind, QueueItem, QueueStatus } from './queue-state'

/**
 * The durable upload queue.
 *
 * IndexedDB rather than memory because the point is surviving things that kill
 * a page: a locked phone, a backgrounded tab reaped for memory, a browser
 * restart, a tech driving out of coverage and finishing the day before
 * reconnecting. A queue that lives in a React ref loses the photo the moment
 * iOS decides to reclaim the tab, which it will.
 *
 * The blob is stored alongside the metadata. Browsers persist Blobs in
 * IndexedDB as file-backed references rather than copying bytes into the
 * record, so a 3MB photo does not become 4MB of base64 in a structured clone.
 */
export interface QueuedUpload extends QueueItem {
  /** The compressed bytes, or the original where compression was skipped.
   *  Deleted when the row is committed -- see `evict`. */
  blob: Blob | null
  mimeType: string
  byteSize: number
  width: number | null
  height: number | null
  caption: string | null
  body: string | null
  /** The device clock at capture. Kept even though it can be wrong; the server
   *  records its own `created_at` alongside it. */
  capturedAt: string
  capturedBy: string
  createdAt: number
  updatedAt: number
}

class OfflineDb extends Dexie {
  uploads!: EntityTable<QueuedUpload, 'clientRef'>

  constructor() {
    super('riglink-offline')
    this.version(1).stores({
      // clientRef is the primary key on purpose: it is the idempotency key for
      // the whole pipeline, so the queue physically cannot hold the same
      // capture twice.
      uploads: 'clientRef, status, jobId, orgId, [orgId+status], createdAt',
    })
  }
}

/**
 * Lazily constructed. Opening IndexedDB at module scope breaks SSR, unit tests
 * and Storybook, and throws outright in a Safari private window -- none of
 * which should stop the module being imported.
 */
let db: OfflineDb | null = null

export function offlineDb(): OfflineDb {
  db ??= new OfflineDb()
  return db
}

/**
 * Whether a durable queue is available at all.
 *
 * Safari in private browsing, and any browser with site data blocked, throws
 * on `indexedDB.open`. The app must still work there -- it just cannot promise
 * that a capture survives a page reload, and the UI says so rather than
 * pretending.
 */
export async function isQueueAvailable(): Promise<boolean> {
  try {
    await offlineDb().open()
    return true
  } catch {
    return false
  }
}

export async function enqueue(
  entry: Omit<
    QueuedUpload,
    | 'createdAt'
    | 'updatedAt'
    | 'status'
    | 'attempts'
    | 'nextAttemptAt'
    | 'lastError'
    | 'tusUrl'
  >,
): Promise<void> {
  const now = Date.now()
  // `put`, not `add`: re-enqueueing the same clientRef is a no-op rather than
  // a ConstraintError, which keeps a double-tap on the capture button harmless.
  await offlineDb().uploads.put({
    ...entry,
    status: 'queued',
    attempts: 0,
    nextAttemptAt: null,
    lastError: null,
    tusUrl: null,
    createdAt: now,
    updatedAt: now,
  })
}

export async function patchUpload(
  clientRef: string,
  patch: Partial<QueuedUpload>,
): Promise<void> {
  await offlineDb().uploads.update(clientRef, {
    ...patch,
    updatedAt: Date.now(),
  })
}

/**
 * Drops the blob but keeps the record briefly.
 *
 * Committed items are not deleted outright: keeping the row for a moment lets
 * the UI show "uploaded" rather than having the item vanish from the list the
 * instant it lands, which reads as data loss to someone watching.
 */
export async function evictBlob(clientRef: string): Promise<void> {
  await patchUpload(clientRef, { blob: null, status: 'committed' })
}

export async function forget(clientRef: string): Promise<void> {
  await offlineDb().uploads.delete(clientRef)
}

export async function pendingForJob(
  jobId: string,
): Promise<Array<QueuedUpload>> {
  return offlineDb().uploads.where('jobId').equals(jobId).toArray()
}

export async function allPending(): Promise<Array<QueuedUpload>> {
  return offlineDb().uploads.toArray()
}

/** Committed records older than this are cleaned up on the next pump. */
const KEEP_COMMITTED_MS = 60_000

export async function sweepCommitted(
  now: number = Date.now(),
): Promise<number> {
  const stale = await offlineDb()
    .uploads.where('status')
    .equals('committed' satisfies QueueStatus)
    .filter((u) => now - u.updatedAt > KEEP_COMMITTED_MS)
    .toArray()
  await offlineDb().uploads.bulkDelete(stale.map((u) => u.clientRef))
  return stale.length
}

export type { EvidenceKind }
