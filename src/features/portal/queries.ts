import { queryOptions } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { withStaleClaimsRetry } from '@/lib/auth/refresh-on-stale-claims'
import { portalKeys } from '@/features/jobs/keys'
import type { QueryData } from '@supabase/supabase-js'
import type {
  PrintableLine,
  PrintableQuote,
} from '@/features/quotes/quote-preview'

/**
 * The portal reads VIEWS, never base tables.
 *
 * `portal_job_v` and friends are column projections: `internal_notes`,
 * `access_notes` and `internal_note` do not exist in them, so a client cannot
 * receive them even if a future policy change widened row access. Row
 * filtering still comes from RLS on the base tables, because the views are
 * `security_invoker = on` -- both halves are needed.
 */
const PORTAL_JOB_SELECT = `
  id, org_id, client_id, site_id, number, title, description,
  status, priority, source, requested_for, scheduled_start, scheduled_end,
  completed_at, created_at, updated_at,
  portal_site_v (id, name, address, timezone)
` as const

const portalJobsBase = () =>
  supabase.from('portal_job_v').select(PORTAL_JOB_SELECT)

export type PortalJobRow = QueryData<ReturnType<typeof portalJobsBase>>[number]

export const portalJobsQuery = (clientId: string) =>
  queryOptions({
    queryKey: portalKeys.jobs(clientId),
    queryFn: () =>
      withStaleClaimsRetry(async (): Promise<Array<PortalJobRow>> => {
        const { data, error } = await supabase
          .from('portal_job_v')
          .select(PORTAL_JOB_SELECT)
          .eq('client_id', clientId)
          .order('created_at', { ascending: false })
        if (error) throw error
        return data
      }),
  })

export const portalJobQuery = (clientId: string, jobId: string) =>
  queryOptions({
    queryKey: portalKeys.job(clientId, jobId),
    queryFn: () =>
      withStaleClaimsRetry(async (): Promise<PortalJobRow> => {
        const { data, error } = await supabase
          .from('portal_job_v')
          .select(PORTAL_JOB_SELECT)
          .eq('client_id', clientId)
          .eq('id', jobId)
          .single()
        if (error) throw error
        return data
      }),
  })

export interface PortalQuoteBundle {
  quote: PrintableQuote
  quoteId: string
  status: string
  lines: Array<PrintableLine>
}

/**
 * The quote awaiting (or holding) a decision on one job.
 *
 * Nullability is resolved HERE, at the boundary: view columns are typed
 * nullable because Postgres cannot prove otherwise through a view, while the
 * base columns are all NOT NULL. A missing total would mean the schema
 * changed under us, so this fails loudly rather than printing a zero -- the
 * one thing a money document must never do.
 */
export const portalQuoteQuery = (clientId: string, jobId: string) =>
  queryOptions({
    queryKey: portalKeys.quote(clientId, jobId),
    queryFn: () =>
      withStaleClaimsRetry(async (): Promise<PortalQuoteBundle | null> => {
        // maybeSingle rather than limit(1) plus an index: without
        // noUncheckedIndexedAccess, `quotes[0]` types as defined and the
        // emptiness check looks like dead code to the linter while being the
        // common case (most jobs have no quote yet).
        const { data: quote, error } = await supabase
          .from('portal_quote_v')
          .select('*')
          .eq('client_id', clientId)
          .eq('job_id', jobId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (error) throw error
        if (!quote) return null

        if (
          quote.id == null ||
          quote.number == null ||
          quote.currency == null ||
          quote.subtotal_cents == null ||
          quote.tax_cents == null ||
          quote.total_cents == null ||
          quote.status == null
        ) {
          throw new Error(
            'portal_quote_v returned a row with missing totals; the view and the base table have diverged',
          )
        }

        const { data: lines, error: linesError } = await supabase
          .from('portal_quote_line_v')
          .select('*')
          .eq('quote_id', quote.id)
          .order('position', { ascending: true })
        if (linesError) throw linesError

        return {
          quoteId: quote.id,
          status: quote.status,
          quote: {
            number: quote.number,
            status: quote.status,
            currency: quote.currency,
            subtotal_cents: quote.subtotal_cents,
            tax_cents: quote.tax_cents,
            total_cents: quote.total_cents,
            notes: quote.notes,
            terms: quote.terms,
            valid_until: quote.valid_until,
            sent_at: quote.sent_at,
          },
          lines: lines.map((line) => ({
            id: line.id ?? String(line.position),
            position: line.position ?? 0,
            kind: line.kind ?? 'material',
            description: line.description ?? '',
            unit: line.unit ?? '',
            quantity: String(line.quantity ?? 0),
            unit_price_cents: line.unit_price_cents ?? 0,
            line_total_cents: line.line_total_cents ?? 0,
          })),
        }
      }),
  })

export const portalSitesQuery = (clientId: string) =>
  queryOptions({
    queryKey: portalKeys.sites(clientId),
    queryFn: () =>
      withStaleClaimsRetry(async () => {
        const { data, error } = await supabase
          .from('portal_site_v')
          .select('id, name, address, timezone')
          .eq('client_id', clientId)
          .order('name', { ascending: true })
        if (error) throw error
        return data
      }),
    staleTime: 5 * 60_000,
  })

export interface PortalContact {
  id: string
  client_id: string
  role: string
  full_name: string | null
  email: string
}

/**
 * The caller's own contact rows.
 *
 * Read directly from `client_contacts` via the `client_contacts_self_select`
 * policy (`user_id = auth.uid()`), which returns only the caller's own rows --
 * a contact cannot enumerate their colleagues.
 *
 * Needed because `my_memberships()` carries client identity but not the
 * contact's ROLE, and a `viewer` must not be shown approve buttons. This is a
 * UI gate only: `app.portal_contact_for(..., require_approver => true)`
 * refuses a viewer inside the RPC, so a stale page cannot approve anything.
 */
export const portalContactsQuery = () =>
  queryOptions({
    queryKey: ['portal', 'contacts'] as const,
    queryFn: () =>
      withStaleClaimsRetry(async (): Promise<Array<PortalContact>> => {
        const { data, error } = await supabase
          .from('client_contacts')
          .select('id, client_id, role, full_name, email')
          .is('revoked_at', null)
        if (error) throw error
        return data
      }),
    staleTime: 60_000,
  })
