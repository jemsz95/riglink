import { useQuery } from '@tanstack/react-query'
import { Receipt } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { portalInvoiceLinesQuery } from './queries'
import { formatDate, formatMoney } from '@/lib/format'

interface PortalInvoice {
  id: string | null
  number: number | null
  status: string | null
  currency: string | null
  subtotal_cents: number | null
  tax_cents: number | null
  total_cents: number | null
  notes: string | null
  terms: string | null
  issued_at: string | null
  due_at: string | null
  paid_at: string | null
  payment_ref: string | null
}

/**
 * An issued invoice, as the client sees it.
 *
 * No pay button and no payment form: this system takes no money. It shows what
 * is owed, by when, and -- once the office records it -- that it was paid,
 * with the reference so the client can match it against their own bank. That
 * last part is why `payment_ref` is client-facing: hiding it generates "we
 * already paid that" phone calls.
 */
export function PortalInvoiceCard({
  clientId,
  invoice,
  timezone,
}: {
  clientId: string
  invoice: PortalInvoice
  timezone: string | null
}) {
  const lines = useQuery({
    ...portalInvoiceLinesQuery(clientId, invoice.id ?? ''),
    enabled: invoice.id != null,
  })

  // Nullability resolved at the boundary: these are NOT NULL on `invoices` and
  // type as nullable only because Postgres cannot prove it through a view. A
  // money document must not render a zero it invented.
  if (
    invoice.number == null ||
    invoice.currency == null ||
    invoice.total_cents == null ||
    invoice.status == null
  ) {
    throw new Error(
      'portal_invoice_v returned a row with missing totals; the view and the base table have diverged',
    )
  }

  const paid = invoice.status === 'paid'

  return (
    <section className="border-border bg-card flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Receipt className="text-muted-foreground size-4" aria-hidden />
          <h2 className="text-sm font-semibold">Invoice #{invoice.number}</h2>
        </div>
        <Badge variant={paid ? 'outline' : 'default'}>
          {paid ? 'Paid' : 'Due'}
        </Badge>
      </div>

      <dl className="text-muted-foreground grid grid-cols-2 gap-y-1 text-xs">
        <dt>Issued</dt>
        <dd className="text-foreground text-right">
          {formatDate(invoice.issued_at, timezone)}
        </dd>
        <dt>{paid ? 'Paid' : 'Due'}</dt>
        <dd className="text-foreground text-right">
          {formatDate(paid ? invoice.paid_at : invoice.due_at, timezone)}
        </dd>
        {invoice.payment_ref ? (
          <>
            <dt>Reference</dt>
            <dd className="text-foreground text-right">
              {invoice.payment_ref}
            </dd>
          </>
        ) : null}
      </dl>

      {lines.isPending ? (
        <Skeleton className="h-16 w-full" />
      ) : lines.isError ? null : (
        <ul className="flex flex-col gap-1 text-sm">
          {lines.data.map((line) => (
            <li key={line.id} className="flex justify-between gap-3">
              <span className="min-w-0 truncate">{line.description}</span>
              <span className="text-muted-foreground shrink-0 tabular-nums">
                {formatMoney(
                  line.line_total_cents ?? 0,
                  invoice.currency ?? 'USD',
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="border-border flex justify-between border-t pt-2 text-sm font-semibold">
        <span>Total</span>
        <span className="tabular-nums">
          {formatMoney(invoice.total_cents, invoice.currency)}
        </span>
      </div>

      {invoice.terms ? (
        <p className="text-muted-foreground text-2xs">{invoice.terms}</p>
      ) : null}
    </section>
  )
}
