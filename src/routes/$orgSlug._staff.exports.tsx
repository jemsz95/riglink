import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { toast } from 'sonner'
import { Download, FileSpreadsheet } from 'lucide-react'
import { Route as OrgRoute } from './$orgSlug'
import { AppError } from '@/components/app/app-error'
import { EmptyState } from '@/components/app/empty-state'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { canAdminister } from '@/features/orgs/permissions'
import {
  CSV_HEADERS,
  buildInvoiceCsv,
  invoiceCsvFilename,
  minorUnitsFor,
  minorUnitsToDecimal,
} from '@/features/invoices/csv'
import { downloadTextFile } from '@/features/invoices/download'
import { invoiceExportQuery } from '@/features/invoices/queries'
import { toUserMessage } from '@/lib/supabase/errors'

export const Route = createFileRoute('/$orgSlug/_staff/exports')({
  component: ExportsPage,
})

/** First and last day of the current month, as YYYY-MM-DD. */
function currentMonth(): { from: string; to: string } {
  const now = new Date()
  const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const last = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0),
  )
  return {
    from: first.toISOString().slice(0, 10),
    to: last.toISOString().slice(0, 10),
  }
}

/**
 * Accounting export.
 *
 * Where this system's responsibility for money ends: a CSV a bookkeeper
 * imports. No integration, no OAuth into an accounting package, no scheduled
 * push -- all of which would need credentials this app deliberately cannot
 * hold, and none of which a small contractor asked for.
 *
 * The preview is not decoration. An export you cannot see before you send it
 * to your accountant is one you find out was wrong from your accountant.
 */
function ExportsPage() {
  const { org, role } = OrgRoute.useRouteContext()
  const month = currentMonth()
  const [from, setFrom] = useState(month.from)
  const [to, setTo] = useState(month.to)

  // The window is inclusive of the whole `to` day: issued_at is a timestamp,
  // so a bare date would exclude everything issued after midnight on it.
  const rows = useQuery(
    invoiceExportQuery(org.id, `${from}T00:00:00Z`, `${to}T23:59:59.999Z`),
  )

  if (!canAdminister(role)) {
    return (
      <EmptyState
        title="You cannot export"
        body="Accounting exports are available to owners and admins."
      />
    )
  }

  const invoiceCount = new Set(rows.data?.map((r) => r.invoice_number)).size
  const grandTotal = (rows.data ?? []).reduce(
    (sum, r) => sum + r.line_total_cents + r.line_tax_cents,
    0,
  )
  const currency = rows.data?.[0]?.currency ?? org.currency

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold">Accounting export</h1>
        <p className="text-muted-foreground text-sm">
          Issued and paid invoices as a CSV. Drafts and voided invoices are
          excluded.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="from">Issued from</Label>
          <Input
            id="from"
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="to">Issued to</Label>
          <Input
            id="to"
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
          />
        </div>
        <Button
          disabled={rows.isPending || (rows.data?.length ?? 0) === 0}
          onClick={() => {
            try {
              downloadTextFile(
                invoiceCsvFilename(),
                buildInvoiceCsv(rows.data ?? []),
              )
              toast.success(`Exported ${invoiceCount} invoices`)
            } catch (error) {
              // minorUnitsToDecimal throws on a non-integer amount rather than
              // rounding it. If that ever fires, the export must fail loudly:
              // a silently rounded ledger is worse than no ledger.
              toast.error(toUserMessage(error))
            }
          }}
        >
          <Download className="size-4" aria-hidden />
          Download CSV
        </Button>
      </div>

      {rows.isError ? (
        <AppError error={rows.error} reset={() => void rows.refetch()} />
      ) : rows.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : rows.data.length === 0 ? (
        <EmptyState
          title="Nothing issued in this window"
          body="Only invoices that have been issued appear in an export."
        />
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-muted-foreground text-sm">
            <FileSpreadsheet className="mr-1 inline size-4" aria-hidden />
            {rows.data.length} lines across {invoiceCount} invoices ·{' '}
            <span className="text-foreground font-medium tabular-nums">
              {minorUnitsToDecimal(grandTotal, minorUnitsFor(currency))}{' '}
              {currency}
            </span>
          </p>

          {/* Scrolls inside its own container: an export has twenty columns
              and the page must not scroll sideways. */}
          <div className="border-border overflow-x-auto rounded-lg border">
            <table className="w-full text-xs">
              <thead className="bg-muted text-muted-foreground">
                <tr>
                  {CSV_HEADERS.map((header) => (
                    <th
                      key={header}
                      scope="col"
                      className="px-2 py-1.5 text-left font-medium whitespace-nowrap"
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.data.slice(0, 25).map((row, index) => (
                  <tr
                    key={`${row.invoice_number}-${row.line_position}-${index}`}
                    className="border-border border-t"
                  >
                    <td className="px-2 py-1.5 tabular-nums">
                      {row.invoice_number}
                    </td>
                    <td className="px-2 py-1.5">{row.invoice_status}</td>
                    <td className="px-2 py-1.5">{row.currency}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap">
                      {row.issued_at?.slice(0, 10)}
                    </td>
                    <td className="px-2 py-1.5 whitespace-nowrap">
                      {row.due_at}
                    </td>
                    <td className="px-2 py-1.5 whitespace-nowrap">
                      {row.paid_at?.slice(0, 10)}
                    </td>
                    <td className="px-2 py-1.5">{row.payment_ref}</td>
                    <td className="px-2 py-1.5">{row.client_name}</td>
                    <td className="px-2 py-1.5">{row.client_billing_email}</td>
                    <td className="px-2 py-1.5 tabular-nums">
                      {row.job_number}
                    </td>
                    <td className="px-2 py-1.5">{row.job_title}</td>
                    <td className="px-2 py-1.5 tabular-nums">
                      {row.line_position}
                    </td>
                    <td className="px-2 py-1.5">{row.line_kind}</td>
                    <td className="px-2 py-1.5">{row.description}</td>
                    <td className="px-2 py-1.5">{row.unit}</td>
                    <td className="px-2 py-1.5 tabular-nums">{row.quantity}</td>
                    <td className="px-2 py-1.5 tabular-nums">
                      {minorUnitsToDecimal(
                        row.unit_price_cents,
                        minorUnitsFor(row.currency),
                      )}
                    </td>
                    <td className="px-2 py-1.5 tabular-nums">
                      {minorUnitsToDecimal(
                        row.line_total_cents,
                        minorUnitsFor(row.currency),
                      )}
                    </td>
                    <td className="px-2 py-1.5 tabular-nums">{row.tax_rate}</td>
                    <td className="px-2 py-1.5 tabular-nums">
                      {minorUnitsToDecimal(
                        row.line_tax_cents,
                        minorUnitsFor(row.currency),
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.data.length > 25 ? (
            <p className="text-muted-foreground text-2xs">
              Showing the first 25 lines. The download contains all{' '}
              {rows.data.length}.
            </p>
          ) : null}
        </div>
      )}
    </div>
  )
}
