import { queryOptions } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { withStaleClaimsRetry } from '@/lib/auth/refresh-on-stale-claims'
import { invoiceKeys, portalInvoiceKeys } from './keys'
import type { Invoice, InvoiceLineItem, InvoiceStatus } from '@/lib/supabase/db'
import type { InvoiceCsvRow } from './csv'

const LINE_COLUMNS = `
  id, invoice_id, position, kind, catalog_item_id, description, unit,
  quantity, unit_price_cents, tax_rate, line_total_cents, line_tax_cents
` as const

export const jobInvoicesQuery = (orgId: string, jobId: string) =>
  queryOptions({
    queryKey: invoiceKeys.forJob(orgId, jobId),
    queryFn: () =>
      withStaleClaimsRetry(async (): Promise<Array<Invoice>> => {
        const { data, error } = await supabase
          .from('invoices')
          .select('*')
          .eq('org_id', orgId)
          .eq('job_id', jobId)
          .order('number', { ascending: false })
        if (error) throw error
        return data
      }),
  })

export const invoiceLinesQuery = (orgId: string, invoiceId: string) =>
  queryOptions({
    queryKey: invoiceKeys.lines(orgId, invoiceId),
    queryFn: () =>
      withStaleClaimsRetry(async (): Promise<Array<InvoiceLineItem>> => {
        const { data, error } = await supabase
          .from('invoice_line_items')
          .select(LINE_COLUMNS)
          .eq('org_id', orgId)
          .eq('invoice_id', invoiceId)
          .order('position', { ascending: true })
        if (error) throw error
        return data as unknown as Array<InvoiceLineItem>
      }),
  })

export const invoiceListQuery = (
  orgId: string,
  status: InvoiceStatus | 'all',
) =>
  queryOptions({
    queryKey: invoiceKeys.list(orgId, status),
    queryFn: () =>
      withStaleClaimsRetry(async (): Promise<Array<Invoice>> => {
        let query = supabase
          .from('invoices')
          .select('*')
          .eq('org_id', orgId)
          .order('number', { ascending: false })
        if (status !== 'all') query = query.eq('status', status)
        const { data, error } = await query
        if (error) throw error
        return data
      }),
    placeholderData: (previous) => previous,
  })

/**
 * The export set: one row per invoice line, joined to the job and client.
 *
 * Only ISSUED invoices. A draft is staff working out what to charge, and an
 * accountant importing a draft would be recording revenue that nobody has
 * been asked to pay. `void` is excluded for the same reason; `sent` and `paid`
 * are both real.
 *
 * The window is on `issued_at`, not `created_at`: the date an invoice was
 * issued is the date it belongs to in a ledger, regardless of when someone
 * happened to draft it.
 */
export const invoiceExportQuery = (orgId: string, from: string, to: string) =>
  queryOptions({
    queryKey: invoiceKeys.export(orgId, from, to),
    queryFn: () =>
      withStaleClaimsRetry(async (): Promise<Array<InvoiceCsvRow>> => {
        const { data, error } = await supabase
          .from('invoices')
          // The client is reached THROUGH the job. `invoices` has no FK to
          // `clients`: `client_id` is constrained only by the composite FK to
          // `jobs (id, client_id)`, which is what makes an invoice provably
          // about the same client as its job. PostgREST needs a real
          // relationship to embed, so the nesting mirrors the constraint
          // rather than inventing an FK to satisfy a query.
          //
          // The line embed carries an explicit FK hint because
          // `invoice_line_items` has TWO foreign keys back to `invoices` --
          // one on (invoice_id, org_id) and one on (invoice_id, client_id) --
          // so the relationship is ambiguous and PostgREST refuses to guess.
          // Same reason the job queries name `jobs_client_fk`.
          .select(
            'number, status, currency, issued_at, due_at, paid_at, payment_ref, jobs!invoices_job_fk (number, title, clients!jobs_client_fk (name, billing_email)), invoice_line_items!invoice_line_items_invoice_fk (position, kind, description, unit, quantity, unit_price_cents, tax_rate, line_total_cents, line_tax_cents)',
          )
          .eq('org_id', orgId)
          .in('status', ['sent', 'paid'])
          .gte('issued_at', from)
          .lte('issued_at', to)
          .order('number', { ascending: true })
        if (error) throw error

        // Flattened here rather than in SQL: the CSV module takes a flat row
        // and is tested against one, so the shape boundary is this function.
        const rows: Array<InvoiceCsvRow> = []
        for (const invoice of data) {
          const lines = invoice.invoice_line_items
          for (const line of lines) {
            rows.push({
              invoice_number: invoice.number,
              invoice_status: invoice.status,
              currency: invoice.currency,
              issued_at: invoice.issued_at,
              due_at: invoice.due_at,
              paid_at: invoice.paid_at,
              payment_ref: invoice.payment_ref,
              client_name: invoice.jobs.clients.name,
              client_billing_email: invoice.jobs.clients.billing_email,
              job_number: invoice.jobs.number,
              job_title: invoice.jobs.title,
              line_position: line.position,
              line_kind: line.kind,
              description: line.description,
              unit: line.unit,
              // `numeric` arrives as a JSON number; String() gives back the
              // decimal PostgREST sent, and the value is never arithmetic'd
              // here, only printed.
              quantity: String(line.quantity),
              unit_price_cents: line.unit_price_cents,
              line_total_cents: line.line_total_cents ?? 0,
              line_tax_cents: line.line_tax_cents ?? 0,
              tax_rate: String(line.tax_rate),
            })
          }
        }
        return rows
      }),
    enabled: from !== '' && to !== '',
  })

/** Issued invoices for one job, as the client sees them. */
export const portalJobInvoicesQuery = (clientId: string, jobId: string) =>
  queryOptions({
    queryKey: portalInvoiceKeys.forJob(clientId, jobId),
    queryFn: () =>
      withStaleClaimsRetry(async () => {
        const { data, error } = await supabase
          .from('portal_invoice_v')
          .select('*')
          .eq('client_id', clientId)
          .eq('job_id', jobId)
          .order('number', { ascending: false })
        if (error) throw error
        return data
      }),
  })

export const portalInvoiceLinesQuery = (clientId: string, invoiceId: string) =>
  queryOptions({
    queryKey: portalInvoiceKeys.lines(clientId, invoiceId),
    queryFn: () =>
      withStaleClaimsRetry(async () => {
        const { data, error } = await supabase
          .from('portal_invoice_line_v')
          .select('*')
          .eq('client_id', clientId)
          .eq('invoice_id', invoiceId)
          .order('position', { ascending: true })
        if (error) throw error
        return data
      }),
  })
