import { useQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { Briefcase, Building2, MapPin } from 'lucide-react'
import { Route as OrgRoute } from './$orgSlug'
import { AppError } from '@/components/app/app-error'
import { Skeleton } from '@/components/ui/skeleton'
import { StatTile } from '@/features/dashboard/stat-tile'
import { dashboardSummaryQuery } from '@/features/dashboard/queries'
import { canDispatch } from '@/features/orgs/permissions'
import { formatMoney } from '@/lib/format'

export const Route = createFileRoute('/$orgSlug/_staff/')({
  component: DashboardPage,
})

/**
 * What needs doing, and what is owed.
 *
 * Ordered by who is waiting: things where a CLIENT is waiting on us come
 * first, then things where WE are waiting on a client, then money. That is the
 * order a contractor's day actually runs in, and it is not the order the
 * database would suggest.
 *
 * A tech sees only the job tiles. The summary RPC is invoker, so their quote
 * and invoice counts come back as zeroes -- accurate, and misleading if
 * rendered, because "0 outstanding" reads as "nothing owed" rather than "not
 * your business". So the money row is gated on role, not on the values.
 */
function DashboardPage() {
  const { org, role } = OrgRoute.useRouteContext()
  const { orgSlug } = Route.useParams()
  const summary = useQuery(dashboardSummaryQuery(org.id))
  const money = canDispatch(role)

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <p className="text-muted-foreground text-2xs font-mono tracking-widest uppercase">
          Dashboard
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">{org.name}</h1>
      </header>

      {summary.isError ? (
        <AppError error={summary.error} reset={() => void summary.refetch()} />
      ) : summary.isPending ? (
        <div
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
          role="status"
          aria-label="Loading dashboard"
        >
          {Array.from({ length: 8 }, (_, index) => (
            <Skeleton key={index} className="h-24" aria-hidden />
          ))}
        </div>
      ) : (
        <>
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-medium">Needs attention</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatTile
                orgSlug={orgSlug}
                status="requested"
                label="New requests"
                value={summary.data.jobs.new_requests}
                hint="Waiting to be triaged"
                tone={
                  summary.data.jobs.new_requests > 0 ? 'attention' : 'neutral'
                }
              />
              <StatTile
                orgSlug={orgSlug}
                status="work_complete"
                label="Awaiting sign-off"
                value={summary.data.jobs.awaiting_client_signoff}
                hint="Finished, not yet accepted"
              />
              <StatTile
                orgSlug={orgSlug}
                status="approved"
                label="To schedule"
                value={summary.data.jobs.to_schedule}
                hint="Approved, no date yet"
              />
              <StatTile
                orgSlug={orgSlug}
                status="in_progress"
                label="Running late"
                value={summary.data.jobs.overdue_schedule}
                hint={
                  summary.data.jobs.overdue_schedule > 0
                    ? 'Past their end time — overdue'
                    : 'All on time'
                }
                tone={
                  summary.data.jobs.overdue_schedule > 0
                    ? 'attention'
                    : 'neutral'
                }
              />
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-medium">Today</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatTile
                orgSlug={orgSlug}
                status="scheduled"
                label="Scheduled today"
                value={summary.data.jobs.scheduled_today}
                hint={`In ${org.timezone}`}
              />
              <StatTile
                orgSlug={orgSlug}
                status="in_progress"
                label="In progress"
                value={summary.data.jobs.in_progress}
              />
              <StatTile
                orgSlug={orgSlug}
                status="on_hold"
                label="On hold"
                value={summary.data.jobs.on_hold}
              />
              <StatTile
                orgSlug={orgSlug}
                status="quoted"
                label="Quoted"
                value={summary.data.jobs.awaiting_client_quote_decision}
                hint="Client deciding"
              />
            </div>
          </section>

          {money ? (
            <section className="flex flex-col gap-3">
              <h2 className="text-sm font-medium">Money</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatTile
                  orgSlug={orgSlug}
                  to="/$orgSlug/invoices"
                  label="Outstanding"
                  value={formatMoney(
                    summary.data.invoices.unpaid_cents,
                    summary.data.currency,
                  )}
                  hint={`${summary.data.invoices.unpaid} unpaid`}
                />
                <StatTile
                  orgSlug={orgSlug}
                  to="/$orgSlug/invoices"
                  label="Overdue"
                  value={formatMoney(
                    summary.data.invoices.overdue_cents,
                    summary.data.currency,
                  )}
                  hint={
                    summary.data.invoices.overdue > 0
                      ? `${summary.data.invoices.overdue} past due — overdue`
                      : 'Nothing past due'
                  }
                  tone={
                    summary.data.invoices.overdue > 0 ? 'attention' : 'neutral'
                  }
                />
                <StatTile
                  orgSlug={orgSlug}
                  status="quoted"
                  label="Quotes out"
                  value={formatMoney(
                    summary.data.quotes.awaiting_decision_cents,
                    summary.data.currency,
                  )}
                  hint={
                    summary.data.quotes.expired > 0
                      ? `${summary.data.quotes.expired} expired — chase these`
                      : `${summary.data.quotes.awaiting_decision} awaiting a decision`
                  }
                  tone={
                    summary.data.quotes.expired > 0 ? 'attention' : 'neutral'
                  }
                />
                <StatTile
                  orgSlug={orgSlug}
                  to="/$orgSlug/invoices"
                  label="Paid, 30 days"
                  value={formatMoney(
                    summary.data.invoices.paid_30d_cents,
                    summary.data.currency,
                  )}
                  hint="Recorded as paid"
                />
              </div>
            </section>
          ) : null}
        </>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">Jump to</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <QuickLink
            to="/$orgSlug/jobs"
            orgSlug={orgSlug}
            icon={Briefcase}
            title="Jobs"
          />
          <QuickLink
            to="/$orgSlug/clients"
            orgSlug={orgSlug}
            icon={Building2}
            title="Clients"
          />
          <QuickLink
            to="/$orgSlug/sites"
            orgSlug={orgSlug}
            icon={MapPin}
            title="Sites"
          />
        </div>
      </section>
    </div>
  )
}

function QuickLink({
  to,
  orgSlug,
  icon: Icon,
  title,
}: {
  to: '/$orgSlug/jobs' | '/$orgSlug/clients' | '/$orgSlug/sites'
  orgSlug: string
  icon: typeof Briefcase
  title: string
}) {
  return (
    <Link
      to={to}
      params={{ orgSlug }}
      className="border-border bg-card focus-visible:ring-ring/50 flex items-center gap-3 rounded-lg border p-4 shadow-e1 transition-colors hover:border-primary/40 focus-visible:ring-[3px] focus-visible:outline-none"
    >
      <Icon className="text-muted-foreground size-5" aria-hidden />
      <span className="font-medium">{title}</span>
    </Link>
  )
}
