import { queryOptions } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { withStaleClaimsRetry } from '@/lib/auth/refresh-on-stale-claims'
import { EVIDENCE_BUCKET } from '@/lib/offline/upload'
import { evidenceKeys, portalEvidenceKeys } from './keys'
import type { EvidenceKind } from '@/lib/supabase/db'

const EVIDENCE_COLUMNS = `
  id, job_id, client_id, kind, storage_path, mime_type, byte_size,
  width, height, caption, body, client_visible, captured_at, captured_by,
  client_ref, created_at
` as const

export interface EvidenceRow {
  id: string
  job_id: string
  client_id: string
  kind: EvidenceKind
  storage_path: string | null
  mime_type: string | null
  byte_size: number | null
  width: number | null
  height: number | null
  caption: string | null
  body: string | null
  client_visible: boolean
  captured_at: string | null
  captured_by: string | null
  client_ref: string
  created_at: string
}

/**
 * One job's field log, newest first.
 *
 * Ordered by the DEVICE clock where it exists, falling back to the server's.
 * A tech who photographed three things in sequence expects them in that
 * sequence, and if the queue drained out of order -- notes go first, and a
 * failed photo retries after later captures -- `created_at` would shuffle them.
 * The index matches this expression.
 */
export const jobEvidenceQuery = (orgId: string, jobId: string) =>
  queryOptions({
    queryKey: evidenceKeys.forJob(orgId, jobId),
    queryFn: () =>
      withStaleClaimsRetry(async (): Promise<Array<EvidenceRow>> => {
        const { data, error } = await supabase
          .from('job_evidence')
          .select(EVIDENCE_COLUMNS)
          .eq('org_id', orgId)
          .eq('job_id', jobId)
          .order('captured_at', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false })
        if (error) throw error
        return data
      }),
  })

/** What the client sees: only `client_visible` rows, through the view. */
export const portalJobEvidenceQuery = (clientId: string, jobId: string) =>
  queryOptions({
    queryKey: portalEvidenceKeys.forJob(clientId, jobId),
    queryFn: () =>
      withStaleClaimsRetry(async () => {
        const { data, error } = await supabase
          .from('portal_job_evidence_v')
          .select('*')
          .eq('client_id', clientId)
          .eq('job_id', jobId)
          .order('captured_at', { ascending: false, nullsFirst: false })
        if (error) throw error
        return data
      }),
  })

/**
 * Short-lived signed URL for one object.
 *
 * SIXTY SECONDS, deliberately. A signed URL is a bearer token: once issued it
 * works for anyone holding it until it expires, regardless of what the storage
 * policy says afterwards. So un-toggling `client_visible` stops NEW urls being
 * issued but cannot recall one already sent. A short TTL is what bounds that
 * window, and the cost is re-signing when a gallery is left open -- which the
 * query's staleTime handles.
 *
 * Signing is itself authorised: `createSignedUrl` requires SELECT on the
 * object, so a client asking for a hidden photo's URL is refused rather than
 * handed a link that 403s later.
 */
const SIGNED_URL_TTL_SECONDS = 60

export const evidenceSignedUrlQuery = (orgId: string, storagePath: string) =>
  queryOptions({
    queryKey: evidenceKeys.signedUrl(orgId, storagePath),
    queryFn: async (): Promise<string> => {
      const { data, error } = await supabase.storage
        .from(EVIDENCE_BUCKET)
        .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS)
      if (error) throw error
      return data.signedUrl
    },
    // Re-sign a little before expiry rather than after, so an open gallery
    // never shows a broken image.
    staleTime: (SIGNED_URL_TTL_SECONDS - 10) * 1000,
    gcTime: SIGNED_URL_TTL_SECONDS * 1000,
  })

/**
 * The client's signed URL. Written out rather than spread from the staff
 * version, because `queryOptions` binds the key's literal type and a spread
 * with an overridden `queryKey` does not typecheck -- which is the point of
 * the key factory: the two audiences cannot accidentally share a cache entry.
 */
export const portalEvidenceSignedUrlQuery = (
  clientId: string,
  storagePath: string,
) =>
  queryOptions({
    queryKey: portalEvidenceKeys.signedUrl(clientId, storagePath),
    queryFn: async (): Promise<string> => {
      const { data, error } = await supabase.storage
        .from(EVIDENCE_BUCKET)
        .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS)
      if (error) throw error
      return data.signedUrl
    },
    staleTime: (SIGNED_URL_TTL_SECONDS - 10) * 1000,
    gcTime: SIGNED_URL_TTL_SECONDS * 1000,
  })
