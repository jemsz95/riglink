import { useQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { ClipboardList, Plus } from 'lucide-react'
import { Route as PortalRoute } from './portal.$orgSlug'
import { EmptyState } from '@/components/app/empty-state'
import { JobStatusBadge } from '@/components/domain/job-status-badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { portalJobsQuery } from '@/features/portal/queries'
import { formatDate, formatJobNumber, formatRelative } from '@/lib/format'
import type { JobStatus } from '@/lib/supabase/db'

export const Route = createFileRoute('/portal/$orgSlug/')({
  component: PortalHome,
})

function PortalHome() {
  const { clients } = PortalRoute.useRouteContext()
  const { orgSlug } = Route.useParams()

  // A contact can hold more than one account with the same company. Phase 3
  // shows the first; a switcher arrives with the dashboard work.
  const client = clients[0]
  const jobs = useQuery(portalJobsQuery(client.client_id))

  const awaiting = (jobs.data ?? []).filter(
    (job) => job.status === 'quoted' || job.status === 'work_complete',
  )

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Your jobs</h1>
          <p className="text-muted-foreground text-sm">
            Request work, approve quotes and follow progress.
          </p>
        </div>
        <Button asChild>
          <Link to="/portal/$orgSlug/request" params={{ orgSlug }}>
            <Plus className="size-4" aria-hidden />
            Request work
          </Link>
        </Button>
      </header>

      {awaiting.length > 0 ? (
        <section className="border-primary/30 bg-primary/5 flex flex-col gap-2 rounded-lg border p-4">
          <h2 className="text-sm font-medium">
            {awaiting.length === 1
              ? '1 job needs your attention'
              : `${awaiting.length} jobs need your attention`}
          </h2>
          <ul className="flex flex-col gap-1">
            {awaiting.map((job) => (
              <li key={job.id}>
                <Link
                  to="/portal/$orgSlug/jobs/$jobId"
                  params={{ orgSlug, jobId: job.id! }}
                  className="hover:text-primary text-sm underline-offset-4 hover:underline"
                >
                  {job.title} —{' '}
                  {job.status === 'quoted'
                    ? 'quote awaiting your approval'
                    : 'work finished, awaiting your sign-off'}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {jobs.isPending ? (
        <div role="status" aria-live="polite">
          <span className="sr-only">Loading your jobs…</span>
          <div className="flex flex-col gap-2" aria-hidden>
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-20" />
            ))}
          </div>
        </div>
      ) : jobs.data?.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No jobs yet"
          body="When you request work it appears here, along with any quotes to approve."
          action={
            <Button asChild>
              <Link to="/portal/$orgSlug/request" params={{ orgSlug }}>
                Request work
              </Link>
            </Button>
          }
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {jobs.data?.map((job) => (
            <li key={job.id}>
              <Link
                to="/portal/$orgSlug/jobs/$jobId"
                params={{ orgSlug, jobId: job.id! }}
                className="border-border bg-card focus-visible:ring-ring/50 flex flex-col gap-2 rounded-lg border p-4 shadow-e1 focus-visible:ring-[3px] focus-visible:outline-none"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-muted-foreground font-mono text-2xs tabular-nums">
                      {formatJobNumber(job.number!)}
                    </p>
                    <h3 className="truncate font-medium">{job.title}</h3>
                  </div>
                  <JobStatusBadge status={job.status as JobStatus} />
                </div>
                <div className="text-muted-foreground flex flex-wrap gap-x-4 text-xs">
                  {job.portal_site_v ? (
                    <span>{job.portal_site_v.name}</span>
                  ) : null}
                  {job.scheduled_start ? (
                    <span>
                      Scheduled{' '}
                      {formatDate(
                        job.scheduled_start,
                        job.portal_site_v?.timezone,
                      )}
                    </span>
                  ) : null}
                  <span>Updated {formatRelative(job.updated_at)}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
