import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { withStaleClaimsRetry } from '@/lib/auth/refresh-on-stale-claims'
import { orgKeys } from './queries'

export interface OrgSettingsInput {
  name: string
  timezone: string
  currency: string
  default_tax_rate: string
  invoice_prefix: string
  invoice_terms_days: number
}

/**
 * Updates the org profile.
 *
 * `default_tax_rate` goes over the wire as a decimal STRING for the same
 * reason quote line rates do: PostgREST casts it to `numeric` server-side,
 * which is exact, whereas a JSON number has already been through a double by
 * the time it leaves the browser. A tax rate that drifts in the sixth decimal
 * place produces invoices that are a cent out and nobody can explain why.
 *
 * The `organizations_admin_update` policy restricts this to owners and
 * admins; there is no INSERT path here at all, because an org is created only
 * by `create_organization`, which also makes the caller its owner.
 */
export function useUpdateOrgSettings(orgId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: OrgSettingsInput) =>
      withStaleClaimsRetry(async () => {
        const { error } = await supabase
          .from('organizations')
          .update({
            name: input.name,
            timezone: input.timezone,
            currency: input.currency,
            default_tax_rate: input.default_tax_rate as unknown as number,
            invoice_prefix: input.invoice_prefix,
            invoice_terms_days: input.invoice_terms_days,
          })
          .eq('id', orgId)
        if (error) throw error
      }),
    onSuccess: () => {
      // The org name and currency are in the route context, which is seeded
      // from memberships -- so invalidate that, not just a settings key.
      void queryClient.invalidateQueries({ queryKey: orgKeys.memberships() })
      void queryClient.invalidateQueries({ queryKey: orgKeys.detail(orgId) })
    },
  })
}

export interface OrgMemberRow {
  user_id: string
  role: string
  accepted_at: string | null
  invited_at: string | null
  full_name: string | null
  email: string | null
}
