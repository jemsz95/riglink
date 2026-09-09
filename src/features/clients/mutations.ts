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
        const { data, error } = await supabase
          .from('sites')
          .insert({ ...input, org_id: orgId })
          .select('id, name')
          .single()
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
