import { formatDate, formatMoney } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * One strict shape, non-nullable throughout.
 *
 * Both surfaces render the same document -- if staff see a different layout
 * from the client, "what did they actually agree to" becomes a guess. But the
 * two sources disagree about nullability: a `security_invoker` VIEW cannot
 * prove its columns are NOT NULL, so the generated portal types mark every
 * one nullable even though the base columns are not.
 *
 * That question is answered at the boundary (see `toPrintableQuote` in the
 * portal feature), not here. A document renderer that quietly prints `?? 0`
 * for a missing total is how a quote comes to show the wrong number.
 */
export interface PrintableQuote {
  number: number
  status: string
  currency: string
  subtotal_cents: number
  tax_cents: number
  total_cents: number
  notes: string | null
  terms: string | null
  valid_until: string | null
  sent_at: string | null
}

export interface PrintableLine {
  id: string
  position: number
  kind: string
  description: string
  unit: string
  /** As rendered -- the decimal string, so 3.333 prints as typed. */
  quantity: string
  unit_price_cents: number
  line_total_cents: number
}

export interface QuotePreviewProps {
  quote: PrintableQuote
  lines: ReadonlyArray<PrintableLine>
  jobTitle: string
  jobNumber: number
  clientName: string
  orgName: string
  className?: string
}

/**
 * The quote as a document.
 *
 * Print rules are deliberate, not decoration: clients print these to PDF and
 * forward them to whoever signs off. `print:` utilities drop the app chrome,
 * force the ink to black on white (a token-coloured total is unreadable on a
 * greyscale office printer), and keep each line on one page with
 * `break-inside-avoid`.
 *
 * Totals are read from the ROW, never recomputed here. The database is the
 * authority for a document that has been sent; recomputing in the renderer is
 * how a printed quote comes to disagree with the invoice.
 */
export function QuotePreview({
  quote,
  lines,
  jobTitle,
  jobNumber,
  clientName,
  orgName,
  className,
}: QuotePreviewProps) {
  return (
    <article
      className={cn(
        'border-border bg-card rounded-lg border p-6 shadow-e1',
        'print:border-0 print:bg-white print:p-0 print:text-black print:shadow-none',
        className,
      )}
    >
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-muted-foreground text-2xs font-mono tracking-widest uppercase print:text-black">
            Quote
          </p>
          <h2 className="text-xl font-semibold">
            #{quote.number} · {orgName}
          </h2>
          <p className="text-muted-foreground mt-1 text-sm print:text-black">
            For {clientName}
          </p>
        </div>
        <dl className="text-sm">
          <div className="flex gap-2">
            <dt className="text-muted-foreground print:text-black">Job</dt>
            <dd>
              #{jobNumber} {jobTitle}
            </dd>
          </div>
          {quote.sent_at ? (
            <div className="flex gap-2">
              <dt className="text-muted-foreground print:text-black">Sent</dt>
              <dd>{formatDate(quote.sent_at)}</dd>
            </div>
          ) : null}
          {quote.valid_until ? (
            <div className="flex gap-2">
              <dt className="text-muted-foreground print:text-black">
                Valid until
              </dt>
              <dd>{formatDate(quote.valid_until)}</dd>
            </div>
          ) : null}
        </dl>
      </header>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">Quote {quote.number} line items</caption>
          <thead>
            <tr className="border-border border-b text-left">
              <th scope="col" className="py-2 pr-2 font-medium">
                Description
              </th>
              <th scope="col" className="py-2 pr-2 text-right font-medium">
                Qty
              </th>
              <th scope="col" className="py-2 pr-2 font-medium">
                Unit
              </th>
              <th scope="col" className="py-2 pr-2 text-right font-medium">
                Unit price
              </th>
              <th scope="col" className="py-2 text-right font-medium">
                Amount
              </th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr
                key={line.id}
                className="border-border/60 border-b break-inside-avoid"
              >
                <td className="py-2 pr-2">
                  {line.description}
                  {line.kind === 'labor' ? (
                    <span className="text-muted-foreground ml-2 text-xs print:text-black">
                      labour
                    </span>
                  ) : null}
                </td>
                <td className="py-2 pr-2 text-right font-mono tabular-nums">
                  {line.quantity}
                </td>
                <td className="text-muted-foreground py-2 pr-2 print:text-black">
                  {line.unit}
                </td>
                <td className="py-2 pr-2 text-right font-mono tabular-nums">
                  {formatMoney(line.unit_price_cents, quote.currency)}
                </td>
                <td className="py-2 text-right font-mono tabular-nums">
                  {formatMoney(line.line_total_cents, quote.currency)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} />
              <th scope="row" className="py-1 pr-2 text-right font-normal">
                Subtotal
              </th>
              <td className="py-1 text-right font-mono tabular-nums">
                {formatMoney(quote.subtotal_cents, quote.currency)}
              </td>
            </tr>
            <tr>
              <td colSpan={3} />
              <th scope="row" className="py-1 pr-2 text-right font-normal">
                Tax
              </th>
              <td className="py-1 text-right font-mono tabular-nums">
                {formatMoney(quote.tax_cents, quote.currency)}
              </td>
            </tr>
            <tr className="border-border border-t">
              <td colSpan={3} />
              <th scope="row" className="py-2 pr-2 text-right">
                Total
              </th>
              <td className="py-2 text-right font-mono text-base font-semibold tabular-nums">
                {formatMoney(quote.total_cents, quote.currency)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {quote.notes ? (
        <section className="mt-6">
          <h3 className="text-sm font-medium">Notes</h3>
          <p className="mt-1 text-sm whitespace-pre-wrap">{quote.notes}</p>
        </section>
      ) : null}

      {quote.terms ? (
        <section className="mt-4 break-inside-avoid">
          <h3 className="text-sm font-medium">Terms</h3>
          <p className="text-muted-foreground mt-1 text-sm whitespace-pre-wrap print:text-black">
            {quote.terms}
          </p>
        </section>
      ) : null}
    </article>
  )
}
