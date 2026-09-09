import { queryOptions } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { withStaleClaimsRetry } from '@/lib/auth/refresh-on-stale-claims'

export interface DashboardSummary {
  jobs: {
    new_requests: number
    awaiting_client_quote_decision: number
    to_schedule: number
    in_progress: number
    awaiting_client_signoff: number
    on_hold: number
    scheduled_today: number
    overdue_schedule: number
  }
  quotes: {
    awaiting_decision: number
    awaiting_decision_cents: number
    expired: number
  }
  invoices: {
    unpaid: number
    unpaid_cents: number
    overdue: number
    overdue_cents: number
    draft: number
    paid_30d_cents: number
  }
  currency: string
}

export const dashboardKeys = {
  summary: (orgId: string) => ['dashboard', orgId, 'summary'] as const,
}

/**
 * One round trip for the whole dashboard.
 *
 * The RPC is SECURITY INVOKER, so every count is already filtered by the
 * caller's own policies. That means a tech receives zeroes for quotes and
 * invoices rather than an error -- correct, but indistinguishable from
 * "nothing outstanding", so the component hides those tiles by role instead
 * of rendering them. A truthful zero can still mislead.
 */
export const dashboardSummaryQuery = (orgId: string) =>
  queryOptions({
    queryKey: dashboardKeys.summary(orgId),
    queryFn: () =>
      withStaleClaimsRetry(async (): Promise<DashboardSummary> => {
        const { data, error } = await supabase.rpc('dashboard_summary', {
          p_org_id: orgId,
        })
        if (error) throw error
        return data as unknown as DashboardSummary
      }),
    // A dashboard is glanced at, not watched. Short enough to be useful when
    // someone comes back to the tab, long enough not to re-run eight
    // aggregates on every focus change.
    staleTime: 30_000,
  })
