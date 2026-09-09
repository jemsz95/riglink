import { queryOptions } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { withStaleClaimsRetry } from '@/lib/auth/refresh-on-stale-claims'
import { catalogKeys, quoteKeys } from '@/features/jobs/keys'
import { escapeOrFilterTerm } from '@/features/jobs/queries'
import type { QueryData } from '@supabase/supabase-js'
import type { Approval, CatalogItem, Quote } from '@/lib/supabase/db'
import type { PrintableLine, PrintableQuote } from './quote-preview'

/**
 * One literal, not a concatenation: supabase-js infers the row type from the
 * select string, and a `+` expression degrades it to GenericStringError.
 */
const LINE_COLUMNS = `
  id, quote_id, position, kind, catalog_item_id, description, unit,
  quantity, unit_price_cents, tax_rate, line_total_cents, line_tax_cents
` as const

/**
 * The quotes on a job, newest first.
 *
 * A job can have several: a superseded quote stays on the record because the
 * client saw it, so the history is a list rather than a single row.
 */
export const jobQuotesQuery = (orgId: string, jobId: string) =>
  queryOptions({
    queryKey: quoteKeys.forJob(orgId, jobId),
    queryFn: () =>
      withStaleClaimsRetry(async (): Promise<Array<Quote>> => {
        const { data, error } = await supabase
          .from('quotes')
          .select('*')
          .eq('org_id', orgId)
          .eq('job_id', jobId)
          .order('created_at', { ascending: false })
        if (error) throw error
        return data
      }),
  })

export const quoteDetailQuery = (orgId: string, quoteId: string) =>
  queryOptions({
    queryKey: quoteKeys.detail(orgId, quoteId),
    queryFn: () =>
      withStaleClaimsRetry(async (): Promise<Quote> => {
        const { data, error } = await supabase
          .from('quotes')
          .select('*')
          .eq('org_id', orgId)
          .eq('id', quoteId)
          .single()
        if (error) throw error
        return data
      }),
  })

const quoteLinesBase = () =>
  supabase.from('quote_line_items').select(LINE_COLUMNS)

/**
 * The line as the editor and the preview use it -- the projection above, not
 * the whole row. `quantity` and `tax_rate` arrive as JSON numbers; both have
 * at most 3 and 4 decimal places respectively, which a double round-trips
 * exactly, and `computeTotals` re-parses them as decimal strings rather than
 * doing float arithmetic on them.
 */
export type QuoteLineRow = QueryData<ReturnType<typeof quoteLinesBase>>[number]

export const quoteLinesQuery = (orgId: string, quoteId: string) =>
  queryOptions({
    queryKey: quoteKeys.lines(orgId, quoteId),
    queryFn: () =>
      withStaleClaimsRetry(async (): Promise<Array<QuoteLineRow>> => {
        const { data, error } = await supabase
          .from('quote_line_items')
          .select(LINE_COLUMNS)
          .eq('org_id', orgId)
          .eq('quote_id', quoteId)
          .order('position', { ascending: true })
        if (error) throw error
        return data
      }),
  })

/** Decisions recorded against a job, for the staff-side audit view. */
export const jobApprovalsQuery = (orgId: string, jobId: string) =>
  queryOptions({
    queryKey: quoteKeys.approvals(orgId, jobId),
    queryFn: () =>
      withStaleClaimsRetry(async (): Promise<Array<Approval>> => {
        const { data, error } = await supabase
          .from('approvals')
          .select('*')
          .eq('org_id', orgId)
          .eq('job_id', jobId)
          .order('created_at', { ascending: false })
        if (error) throw error
        return data
      }),
  })

export const catalogQuery = (orgId: string, search: string) =>
  queryOptions({
    queryKey: catalogKeys.list(orgId, search),
    queryFn: () =>
      withStaleClaimsRetry(async (): Promise<Array<CatalogItem>> => {
        let query = supabase
          .from('catalog_items')
          .select('*')
          .eq('org_id', orgId)
          .eq('active', true)

        if (search) {
          const term = escapeOrFilterTerm(search)
          query = query.or(
            `name.ilike."%${term}%",sku.ilike."%${term}%",description.ilike."%${term}%"`,
          )
        }

        const { data, error } = await query
          .order('kind', { ascending: true })
          .order('name', { ascending: true })
          .limit(50)
        if (error) throw error
        return data
      }),
    staleTime: 5 * 60_000,
  })

/**
 * Narrows a staff quote row to the printable document shape.
 *
 * Trivial for staff rows -- the base table's columns are already NOT NULL --
 * but it exists so both callers go through a named boundary and the portal's
 * nullable view columns are answered in one place rather than at each use.
 */
export function toPrintableQuote(quote: Quote): PrintableQuote {
  return {
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
  }
}

export function toPrintableLine(line: QuoteLineRow): PrintableLine {
  return {
    id: line.id,
    position: line.position,
    kind: line.kind,
    description: line.description,
    unit: line.unit,
    quantity: String(line.quantity),
    unit_price_cents: line.unit_price_cents,
    // Generated columns are typed nullable because the generator cannot see
    // that the expression is total. They are never null in practice; 0 here
    // would only ever mask a schema change, so it is asserted instead.
    line_total_cents: line.line_total_cents ?? 0,
  }
}
