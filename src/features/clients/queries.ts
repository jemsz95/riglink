import { queryOptions } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { withStaleClaimsRetry } from '@/lib/auth/refresh-on-stale-claims'
import { clientKeys } from '@/features/jobs/keys'
import { escapeOrFilterTerm } from '@/features/jobs/queries'
import type { QueryData } from '@supabase/supabase-js'

const CLIENT_LIST_SELECT = `
  id, name, billing_email, phone, external_ref, archived_at, created_at,
  sites!sites_client_fk (count),
  jobs!jobs_client_fk (count)
` as const

const clientListBase = () => supabase.from('clients').select(CLIENT_LIST_SELECT)
export type ClientListRow = QueryData<ReturnType<typeof clientListBase>>[number]

export const clientListQuery = (orgId: string, search: string) =>
  queryOptions({
    queryKey: clientKeys.list(orgId, search),
    queryFn: () =>
      withStaleClaimsRetry(async (): Promise<Array<ClientListRow>> => {
        let query = supabase
          .from('clients')
          .select(CLIENT_LIST_SELECT)
          .eq('org_id', orgId)
          .is('archived_at', null)

        if (search) {
          const term = escapeOrFilterTerm(search)
          query = query.or(
            `name.ilike."%${term}%",billing_email.ilike."%${term}%"`,
          )
        }

        const { data, error } = await query.order('name', { ascending: true })
        if (error) throw error
        return data
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
