import * as tus from 'tus-js-client'
import { supabase } from '@/lib/supabase/client'
import { getEnv } from '@/lib/env/env'
import type { QueuedUpload } from './store'

/**
 * Resumable upload of one captured file, via tus.
 *
 * Resumable is the whole point on a phone: a 3MB photo on a bad connection
 * fails partway through often enough that a restart-from-zero pipeline never
 * finishes. tus stores an offset server-side, so a resumed transfer sends only
 * the remainder.
 *
 * Supabase's resumable endpoint requires a 6MB chunk size exactly -- not a
 * recommendation, a requirement -- so it is not configurable here.
 */
const CHUNK_SIZE = 6 * 1024 * 1024

export const EVIDENCE_BUCKET = 'evidence'

/**
 * `evidence/<org_id>/<job_id>/<client_ref>.<ext>`
 *
 * The first path segment is the tenant boundary enforced by the storage
 * policies, not a convention: uploading under another org's prefix is refused
 * with 42501. The filename is the idempotency key, so a resumed or replayed
 * upload targets exactly the same object rather than making a second copy.
 */
export function evidenceObjectPath(item: {
  orgId: string
  jobId: string
  clientRef: string
  mimeType: string
}): string {
  return `${item.orgId}/${item.jobId}/${item.clientRef}.${extensionFor(item.mimeType)}`
}

function extensionFor(mimeType: string): string {
  switch (mimeType) {
    case 'image/jpeg':
      return 'jpg'
    case 'image/png':
      return 'png'
    case 'image/webp':
      return 'webp'
    case 'image/heic':
      return 'heic'
    case 'application/pdf':
      return 'pdf'
    default:
      return 'bin'
  }
}

export interface UploadResult {
  /**
   * The object name WITHOUT the bucket prefix.
   *
   * `storage.objects.name` does not include the bucket -- that is `bucket_id`,
   * a separate column -- and the portal's storage policy authorises a read by
   * joining `job_evidence.storage_path = storage.objects.name`. Storing
   * `evidence/<org>/...` here would make that equality never match, so a
   * client-visible photo would return a signed URL that 403s. The bucket is
   * carried separately, in `EVIDENCE_BUCKET`.
   */
  storagePath: string
  tusUrl: string | null
}

export class UploadError extends Error {
  constructor(
    message: string,
    /** Null when the failure never reached an HTTP response -- the ordinary
     *  offline case, which the queue treats as retryable. */
    readonly httpStatus: number | null,
  ) {
    super(message)
    this.name = 'UploadError'
  }
}

/**
 * Uploads (or resumes) one item. Resolves with the object path on completion.
 *
 * The access token is read per attempt rather than captured once: an upload
 * resumed an hour later must not present the expired token it started with.
 */
export async function uploadEvidence(
  item: QueuedUpload,
  opts: {
    onProgress?: (sent: number, total: number) => void
    onUrl?: (tusUrl: string) => void
    signal?: AbortSignal
  } = {},
): Promise<UploadResult> {
  if (!item.blob) throw new UploadError('nothing to upload', 400)

  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new UploadError('not signed in', 401)

  const objectPath = evidenceObjectPath(item)
  const env = getEnv()

  return new Promise<UploadResult>((resolve, reject) => {
    let resolvedUrl: string | null = item.tusUrl

    const upload = new tus.Upload(item.blob as Blob, {
      endpoint: `${env.VITE_SUPABASE_URL}/storage/v1/upload/resumable`,
      // Resume from a previous attempt when we have its URL.
      uploadUrl: item.tusUrl ?? undefined,
      retryDelays: [],
      // Retrying is the queue's job, not the transport's. Two layers of
      // backoff interleave badly and make the UI lie about progress.
      chunkSize: CHUNK_SIZE,
      headers: {
        authorization: `Bearer ${token}`,
        // Overwrite rather than fail: a replayed upload of the same
        // client_ref is the same bytes for the same evidence row.
        'x-upsert': 'true',
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      metadata: {
        bucketName: EVIDENCE_BUCKET,
        objectName: objectPath,
        contentType: item.mimeType,
        cacheControl: '3600',
      },
      onAfterResponse: (_req, res) => {
        const location = res.getHeader('Location')
        if (location && location !== resolvedUrl) {
          resolvedUrl = location
          opts.onUrl?.(location)
        }
      },
      onProgress: (sent, total) => opts.onProgress?.(sent, total),
      onError: (error) => {
        const status =
          error instanceof tus.DetailedError
            ? (error.originalResponse?.getStatus() ?? null)
            : null
        reject(new UploadError(error.message, status))
      },
      onSuccess: () => {
        resolve({ storagePath: objectPath, tusUrl: resolvedUrl })
      },
    })

    opts.signal?.addEventListener('abort', () => upload.abort(), { once: true })
    upload.start()
  })
}
