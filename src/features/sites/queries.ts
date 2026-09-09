import { queryOptions } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { withStaleClaimsRetry } from '@/lib/auth/refresh-on-stale-claims'
import { siteKeys } from '@/features/jobs/keys'
import { toSearchPattern } from '@/features/jobs/queries'
import type { Json } from '@/lib/supabase/database.types'

/**
 * The list reads `staff_site_list_v`, which carries the owning client's name
 * and the job count. `client_name` is nullable because the view LEFT JOINs --
 * a site is never dropped from the list because its client row was
 * unreadable.
 */
export interface SiteListRow {
  id: string
  client_id: string
  name: string
  address: Json | null
  timezone: string | null
  lat: number | null
  lng: number | null
  site_contact_name: string | null
  site_contact_phone: string | null
  archived_at: string | null
  client_name: string | null
  job_count: number
}

export const siteListQuery = (orgId: string, search: string) =>
  queryOptions({
    queryKey: siteKeys.list(orgId, search),
    queryFn: () =>
      withStaleClaimsRetry(async (): Promise<Array<SiteListRow>> => {
        let query = supabase
          .from('staff_site_list_v')
          .select('*')
          .eq('org_id', orgId)
          .is('archived_at', null)

        if (search) {
          query = query.ilike('search_text', toSearchPattern(search))
        }

        const { data, error } = await query.order('name', { ascending: true })
        if (error) throw error
        return data.map((row) => {
          if (row.id == null || row.name == null || row.client_id == null) {
            throw new Error(
              'staff_site_list_v returned a row missing a NOT NULL site column; the view and the base table have diverged',
            )
          }
          return {
            id: row.id,
            client_id: row.client_id,
            name: row.name,
            address: row.address,
            timezone: row.timezone,
            lat: row.lat,
            lng: row.lng,
            site_contact_name: row.site_contact_name,
            site_contact_phone: row.site_contact_phone,
            archived_at: row.archived_at,
            client_name: row.client_name,
            job_count: Number(row.job_count ?? 0),
          }
        })
      }),
  })

export interface SiteOption {
  id: string
  name: string
  timezone: string | null
}

/**
 * Sites belonging to one client, for the dependent picker on the job form.
 *
 * Scoped by client rather than filtered client-side because a composite FK
 * makes a job's site and client provably same-tenant, but nothing stops a UI
 * from offering another client's site -- which the FK would then reject with a
 * confusing error. Narrowing the options is the fix.
 */
export const sitesForClientQuery = (orgId: string, clientId: string | null) =>
  queryOptions({
    queryKey: siteKeys.forClient(orgId, clientId ?? 'none'),
    queryFn: () =>
      withStaleClaimsRetry(async (): Promise<Array<SiteOption>> => {
        if (!clientId) return []
        const { data, error } = await supabase
          .from('sites')
          .select('id, name, timezone')
          .eq('org_id', orgId)
          .eq('client_id', clientId)
          .is('archived_at', null)
          .order('name', { ascending: true })
        if (error) throw error
        return data
      }),
    enabled: clientId !== null,
    staleTime: 5 * 60_000,
  })
