import { queryOptions } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { withStaleClaimsRetry } from '@/lib/auth/refresh-on-stale-claims'
import type { OrgMemberRow } from './settings-mutations'

export const memberKeys = {
  list: (orgId: string) => ['org', orgId, 'members'] as const,
}

/**
 * The org's staff.
 *
 * There is no email here: `profiles` does not carry one, and `auth.users` is
 * not reachable from the client at all -- deliberately, since it holds every
 * user in the project rather than every user in this org. A member who has not
 * completed signup therefore shows as an unnamed pending row, which is honest
 * about what we know rather than inventing a placeholder.
 */
export const orgMembersQuery = (orgId: string) =>
  queryOptions({
    queryKey: memberKeys.list(orgId),
    queryFn: () =>
      withStaleClaimsRetry(async (): Promise<Array<OrgMemberRow>> => {
        // `staff_member_v`, not an embed: `org_members.user_id` references
        // `auth.users`, so there is no relationship between org_members and
        // profiles for PostgREST to traverse. The view expresses the join and
        // stays security_invoker, so both halves remain the caller's own
        // policies.
        const { data, error } = await supabase
          .from('staff_member_v')
          .select('user_id, role, accepted_at, invited_at, full_name')
          .eq('org_id', orgId)
          .order('role', { ascending: true })
        if (error) throw error
        return data.map((row) => ({
          user_id: row.user_id ?? '',
          role: row.role ?? 'unknown',
          accepted_at: row.accepted_at,
          invited_at: row.invited_at,
          full_name: row.full_name,
          email: null,
        }))
      }),
  })

/**
 * The settings-only org fields.
 *
 * `my_memberships()` carries what routing and branding need -- name, slug,
 * timezone, currency -- but not `default_tax_rate`, `invoice_prefix` or
 * `invoice_terms_days`. The settings form must load them before it renders,
 * because a form seeded with hardcoded defaults would silently overwrite
 * whatever the org had actually set the moment somebody pressed Save.
 */
export interface OrgSettings {
  name: string
  timezone: string
  currency: string
  default_tax_rate: string
  invoice_prefix: string
  invoice_terms_days: number
}

export const orgSettingsQuery = (orgId: string) =>
  queryOptions({
    queryKey: ['org', orgId, 'settings'] as const,
    queryFn: () =>
      withStaleClaimsRetry(async (): Promise<OrgSettings> => {
        const { data, error } = await supabase
          .from('organizations')
          .select(
            'name, timezone, currency, default_tax_rate, invoice_prefix, invoice_terms_days',
          )
          .eq('id', orgId)
          .single()
        if (error) throw error
        return {
          name: data.name,
          timezone: data.timezone,
          currency: data.currency,
          // Back to a string immediately: `numeric` arrives as a JSON number,
          // and every downstream use of a tax rate is decimal-exact only if it
          // never stays one.
          default_tax_rate: String(data.default_tax_rate),
          invoice_prefix: data.invoice_prefix,
          invoice_terms_days: data.invoice_terms_days,
        }
      }),
  })
