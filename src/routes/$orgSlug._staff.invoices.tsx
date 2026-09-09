import { useQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { Download } from 'lucide-react'
import { Route as OrgRoute } from './$orgSlug'
import { AppError } from '@/components/app/app-error'
import { EmptyState } from '@/components/app/empty-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { canDispatch } from '@/features/orgs/permissions'
import { invoiceListQuery } from '@/features/invoices/queries'
import { formatDate, formatMoney } from '@/lib/format'
import type { InvoiceStatus } from '@/lib/supabase/db'

const FILTERS: Array<{ value: InvoiceStatus | 'all'; label: string }> = [
  { value: 'sent', label: 'Unpaid' },
  { value: 'draft', label: 'Drafts' },
  { value: 'paid', label: 'Paid' },
  { value: 'void', label: 'Void' },
  { value: 'all', label: 'All' },
]

export const Route = createFileRoute('/$orgSlug/_staff/invoices')({
  validateSearch: (search: Record<string, unknown>) => ({
    // Deliberately plain rather than a Zod schema: one field with five known
    // values and a safe fallback. The job list needs Zod because it has eight
    // interdependent fields; this does not.
    status: (FILTERS.some((f) => f.value === search.status)
      ? search.status
      : 'sent') as InvoiceStatus | 'all',
  }),
  component: InvoicesPage,
})

/**
 * Every invoice in the org, unpaid first.
 *
 * "Unpaid" is the default view because it is the question a contractor
 * actually opens this screen to answer. A list defaulting to everything makes
 * you filter before you can work.
 */
function InvoicesPage() {
  const { org, role } = OrgRoute.useRouteContext()
  const { orgSlug } = Route.useParams()
  const { status } = Route.useSearch()
  const navigate = Route.useNavigate()
  const invoices = useQuery(invoiceListQuery(org.id, status))

  if (!canDispatch(role)) {
    return (
      <EmptyState
        title="You cannot see invoices"
        body="Invoices are visible to owners, admins and dispatchers only."
      />
    )
  }

  const outstanding = (invoices.data ?? [])
    .filter((invoice) => invoice.status === 'sent')
    .reduce((sum, invoice) => sum + invoice.total_cents, 0)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Invoices</h1>
          {status === 'sent' && outstanding > 0 ? (
            <p className="text-muted-foreground text-sm">
              {formatMoney(outstanding, org.currency)} outstanding
            </p>
          ) : null}
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/$orgSlug/exports" params={{ orgSlug }}>
            <Download className="size-4" aria-hidden />
            Export
          </Link>
        </Button>
      </div>

      <div
        className="flex flex-wrap gap-1.5"
        role="tablist"
        aria-label="Invoice status"
      >
        {FILTERS.map((filter) => (
          <Button
            key={filter.value}
            role="tab"
            aria-selected={status === filter.value}
            variant={status === filter.value ? 'default' : 'outline'}
            size="sm"
            onClick={() => void navigate({ search: { status: filter.value } })}
          >
            {filter.label}
          </Button>
        ))}
      </div>

      {invoices.isError ? (
        <AppError
          error={invoices.error}
          reset={() => void invoices.refetch()}
        />
      ) : invoices.isPending ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : invoices.data.length === 0 ? (
        <EmptyState
          title="Nothing here"
          body="Invoices are raised from a job once the client has signed the work off."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {invoices.data.map((invoice) => (
            <li key={invoice.id}>
              <Link
                to="/$orgSlug/jobs/$jobId"
                params={{ orgSlug, jobId: invoice.job_id }}
                className="border-border bg-card hover:border-primary/40 flex items-center justify-between gap-3 rounded-lg border p-3"
              >
                <div className="flex min-w-0 flex-col">
                  <span className="text-sm font-medium">#{invoice.number}</span>
                  <span className="text-muted-foreground text-xs">
                    {invoice.status === 'draft'
                      ? 'Not issued'
                      : `Issued ${formatDate(invoice.issued_at, org.timezone)}`}
                    {invoice.status === 'sent' && invoice.due_at
                      ? ` · due ${formatDate(invoice.due_at, org.timezone)}`
                      : ''}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <Badge variant="outline">{invoice.status}</Badge>
                  <span className="text-sm font-semibold tabular-nums">
                    {formatMoney(invoice.total_cents, invoice.currency)}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
