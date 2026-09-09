import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { withStaleClaimsRetry } from '@/lib/auth/refresh-on-stale-claims'
import { clientKeys, siteKeys } from '@/features/jobs/keys'

export interface CreateClientInput {
  name: string
  billing_email: string | null
  phone: string | null
}

export function useCreateClient(orgId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: CreateClientInput) =>
      withStaleClaimsRetry(async () => {
        const { data, error } = await supabase
          .from('clients')
          .insert({ ...input, org_id: orgId })
          .select('id, name')
          .single()
        if (error) throw error
        return data
      }),
    onSuccess: () => {
      // Includes the options query the job form's client picker reads, so a
      // client created in one tab is immediately selectable in the other.
      void queryClient.invalidateQueries({ queryKey: clientKeys.all(orgId) })
    },
  })
}

export interface CreateSiteInput {
  client_id: string
  name: string
  address: {
    line1?: string
    city?: string
    postcode?: string
  } | null
  timezone: string | null
  access_notes: string | null
  site_contact_name: string | null
  site_contact_phone: string | null
}

export function useCreateSite(orgId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: CreateSiteInput) =>
      withStaleClaimsRetry(async () => {
        // `create_site`, not a plain insert: `access_notes` moved to the
        // staff-only `site_access_notes` table, so a site and its access
        // notes are two statements and need one transaction. SECURITY
        // INVOKER, and `org_id` is derived from the client inside the RPC.
        const { data, error } = await supabase.rpc('create_site', {
          p_client_id: input.client_id,
          p_name: input.name,
          p_address: input.address ?? undefined,
          p_timezone: input.timezone ?? undefined,
          p_access_notes: input.access_notes ?? undefined,
          p_site_contact_name: input.site_contact_name ?? undefined,
          p_site_contact_phone: input.site_contact_phone ?? undefined,
        })
        if (error) throw error
        return data
      }),
    onSuccess: (_data, input) => {
      void queryClient.invalidateQueries({ queryKey: siteKeys.all(orgId) })
      // The client detail page lists its sites, so that cache is stale too.
      void queryClient.invalidateQueries({
        queryKey: clientKeys.detail(orgId, input.client_id),
      })
    },
  })
}
