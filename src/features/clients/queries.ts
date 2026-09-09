import { queryOptions } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { withStaleClaimsRetry } from '@/lib/auth/refresh-on-stale-claims'
import { clientKeys } from '@/features/jobs/keys'
import { toSearchPattern } from '@/features/jobs/queries'
import type { QueryData } from '@supabase/supabase-js'

/**
 * The list reads `staff_client_list_v`: the same projection, with the site and
 * job counts computed in SQL under the caller's own RLS rather than assembled
 * from two PostgREST embed aggregates.
 */
export interface ClientListRow {
  id: string
  name: string
  billing_email: string | null
  phone: string | null
  external_ref: string | null
  archived_at: string | null
  created_at: string
  site_count: number
  job_count: number
}

export const clientListQuery = (orgId: string, search: string) =>
  queryOptions({
    queryKey: clientKeys.list(orgId, search),
    queryFn: () =>
      withStaleClaimsRetry(async (): Promise<Array<ClientListRow>> => {
        let query = supabase
          .from('staff_client_list_v')
          .select('*')
          .eq('org_id', orgId)
          .is('archived_at', null)

        if (search) {
          query = query.ilike('search_text', toSearchPattern(search))
        }

        const { data, error } = await query.order('name', { ascending: true })
        if (error) throw error
        return data.map((row) => {
          // View columns all type as nullable; `id`, `name` and `created_at`
          // are NOT NULL on `clients`, and the counts cannot be null.
          if (row.id == null || row.name == null || row.created_at == null) {
            throw new Error(
              'staff_client_list_v returned a row missing a NOT NULL client column; the view and the base table have diverged',
            )
          }
          return {
            id: row.id,
            name: row.name,
            billing_email: row.billing_email,
            phone: row.phone,
            external_ref: row.external_ref,
            archived_at: row.archived_at,
            created_at: row.created_at,
            site_count: Number(row.site_count ?? 0),
            job_count: Number(row.job_count ?? 0),
          }
        })
      }),
  })

export interface ClientOption {
  id: string
  name: string
}

/**
 * Just id + name, for the picker on the job form.
 *
 * Separate from the list query on purpose: the list carries counts and
 * contact detail, and reusing it here would make every keystroke in a picker
 * re-fetch aggregates nobody is looking at.
 */
export const clientOptionsQuery = (orgId: string) =>
  queryOptions({
    queryKey: clientKeys.options(orgId),
    queryFn: () =>
      withStaleClaimsRetry(async (): Promise<Array<ClientOption>> => {
        const { data, error } = await supabase
          .from('clients')
          .select('id, name')
          .eq('org_id', orgId)
          .is('archived_at', null)
          .order('name', { ascending: true })
        if (error) throw error
        return data
      }),
    staleTime: 5 * 60_000,
  })

const CLIENT_DETAIL_SELECT = `
  *,
  client_contacts!client_contacts_client_fk (
    id, full_name, email, phone, role, accepted_at, revoked_at
  ),
  sites!sites_client_fk (id, name, address, timezone, archived_at)
` as const

const clientDetailBase = () =>
  supabase.from('clients').select(CLIENT_DETAIL_SELECT)
export type ClientDetail = QueryData<
  ReturnType<typeof clientDetailBase>
>[number]

export const clientDetailQuery = (orgId: string, clientId: string) =>
  queryOptions({
    queryKey: clientKeys.detail(orgId, clientId),
    queryFn: () =>
      withStaleClaimsRetry(async (): Promise<ClientDetail> => {
        const { data, error } = await supabase
          .from('clients')
          .select(CLIENT_DETAIL_SELECT)
          .eq('org_id', orgId)
          .eq('id', clientId)
          .single()
        if (error) throw error
        return data
      }),
  })
