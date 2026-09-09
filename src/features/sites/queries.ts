import { queryOptions } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { withStaleClaimsRetry } from '@/lib/auth/refresh-on-stale-claims'
import { siteKeys } from '@/features/jobs/keys'
import { escapeOrFilterTerm } from '@/features/jobs/queries'
import type { QueryData } from '@supabase/supabase-js'

const SITE_LIST_SELECT = `
  id, name, address, timezone, lat, lng,
  site_contact_name, site_contact_phone, archived_at, client_id,
  clients!sites_client_fk (id, name),
  jobs!jobs_site_fk (count)
` as const

const siteListBase = () => supabase.from('sites').select(SITE_LIST_SELECT)
export type SiteListRow = QueryData<ReturnType<typeof siteListBase>>[number]

export const siteListQuery = (orgId: string, search: string) =>
  queryOptions({
    queryKey: siteKeys.list(orgId, search),
    queryFn: () =>
      withStaleClaimsRetry(async (): Promise<Array<SiteListRow>> => {
        let query = supabase
          .from('sites')
          .select(SITE_LIST_SELECT)
          .eq('org_id', orgId)
          .is('archived_at', null)

        if (search) {
          const term = escapeOrFilterTerm(search)
          query = query.or(`name.ilike."%${term}%"`)
        }

        const { data, error } = await query.order('name', { ascending: true })
        if (error) throw error
        return data
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
