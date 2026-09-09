import { useQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { toast } from 'sonner'
import {
  ArrowLeft,
  Building2,
  CalendarClock,
  Camera,
  FileText,
  MapPin,
  User,
} from 'lucide-react'
import { Route as OrgRoute } from './$orgSlug'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { AppError } from '@/components/app/app-error'
import { JobPriorityBadge } from '@/components/domain/job-priority-badge'
import { JobStatusBadge } from '@/components/domain/job-status-badge'
import { StatusTimeline } from '@/components/domain/status-timeline'
import { JobStatusActions } from '@/features/jobs/job-status-actions'
import { canDispatch } from '@/features/orgs/permissions'
import { InvoicePanel } from '@/features/invoices/invoice-panel'
import { jobDetailQuery, jobStatusEventsQuery } from '@/features/jobs/queries'
import {
  formatAddressLine,
  formatDate,
  formatDateTime,
  formatJobNumber,
  orDash,
} from '@/lib/format'
import { toUserMessage } from '@/lib/supabase/errors'

export const Route = createFileRoute('/$orgSlug/_staff/jobs/$jobId/')({
  component: JobDetailPage,
})

function JobDetailPage() {
  const { org, role } = OrgRoute.useRouteContext()
  const { orgSlug, jobId } = Route.useParams()

  const job = useQuery(jobDetailQuery(org.id, jobId))
  const events = useQuery(jobStatusEventsQuery(org.id, jobId))

  if (job.isPending) {
    return (
      <div className="flex flex-col gap-4" role="status" aria-live="polite">
        <span className="sr-only">Loading job…</span>
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if (job.isError) {
    return (
      <AppError
        error={job.error}
        reset={() => {
          void job.refetch()
        }}
      />
    )
  }

  const data = job.data
  // The site fields are nullable because `site_id` is; the client fields are
  // nullable because `staff_job_detail_v` LEFT JOINs deliberately, so a job is
  // never hidden by an unreadable client row.
  const timezone = data.site_timezone ?? org.timezone

  return (
    <div className="flex flex-col gap-4">
      <Button asChild variant="ghost" size="sm" className="self-start">
        <Link to="/$orgSlug/jobs" params={{ orgSlug }}>
          <ArrowLeft className="size-4" aria-hidden />
          Jobs
        </Link>
      </Button>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-muted-foreground font-mono text-xs tabular-nums">
            {formatJobNumber(data.number)}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            {data.title}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <JobStatusBadge status={data.status} />
            <JobPriorityBadge priority={data.priority} />
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Every staff role, techs included: recording what was found on
              site is the tech's job, and this is the surface they own. */}
          <Button asChild variant="outline">
            <Link to="/$orgSlug/jobs/$jobId/field" params={{ orgSlug, jobId }}>
              <Camera className="size-4" aria-hidden />
              Field
            </Link>
          </Button>
          {canDispatch(role) ? (
            <Button asChild variant="outline">
              <Link
                to="/$orgSlug/jobs/$jobId/quote"
                params={{ orgSlug, jobId }}
              >
                <FileText className="size-4" aria-hidden />
                Quote
              </Link>
            </Button>
          ) : null}
          <JobStatusActions
            orgId={org.id}
            role={role}
            jobId={data.id}
            status={data.status}
            onError={(error) => toast.error(toUserMessage(error))}
          />
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Description</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm whitespace-pre-wrap">
                {orDash(data.description)}
              </p>
              {data.internal_notes ? (
                <>
                  <Separator className="my-4" />
                  <p className="text-muted-foreground text-2xs font-mono tracking-widest uppercase">
                    Internal notes — not visible to the client
                  </p>
                  <p className="mt-1 text-sm whitespace-pre-wrap">
                    {data.internal_notes}
                  </p>
                </>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">History</CardTitle>
            </CardHeader>
            <CardContent>
              {events.isPending ? (
                <Skeleton className="h-24 w-full" />
              ) : (
                <StatusTimeline
                  events={events.data ?? []}
                  timezone={timezone}
                />
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-sm">Details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="flex flex-col gap-3 text-sm">
              <DetailRow icon={Building2} label="Client">
                <Link
                  to="/$orgSlug/clients/$clientId"
                  params={{ orgSlug, clientId: data.client_id }}
                  className="hover:text-primary underline-offset-4 hover:underline"
                >
                  {orDash(data.client_name)}
                </Link>
              </DetailRow>

              <DetailRow icon={MapPin} label="Site">
                {data.site_id ? (
                  <>
                    <p>{orDash(data.site_name)}</p>
                    <p className="text-muted-foreground text-xs">
                      {formatAddressLine(data.site_address)}
                    </p>
                    {data.site_access_notes ? (
                      <p className="text-muted-foreground mt-1 text-xs">
                        Access: {data.site_access_notes}
                      </p>
                    ) : null}
                  </>
                ) : (
                  '—'
                )}
              </DetailRow>

              <DetailRow icon={CalendarClock} label="Requested for">
                {formatDate(data.requested_for, timezone)}
              </DetailRow>

              <DetailRow icon={CalendarClock} label="Scheduled">
                {data.scheduled_start
                  ? formatDateTime(data.scheduled_start, timezone)
                  : '—'}
              </DetailRow>

              {data.requested_by_contact_id ? (
                <DetailRow icon={User} label="Requested by">
                  <p>{orDash(data.requested_by_name)}</p>
                  <p className="text-muted-foreground text-xs">
                    {orDash(data.requested_by_email)}
                  </p>
                </DetailRow>
              ) : null}
            </dl>
          </CardContent>
        </Card>

        {/* Dispatch roles only. A tech reads nothing priced, so rendering the
            panel for them would show an empty box where money should be. */}
        {canDispatch(role) ? (
          <Card>
            <CardContent className="pt-6">
              <InvoicePanel
                orgId={org.id}
                jobId={jobId}
                jobStatus={data.status}
                timezone={timezone}
              />
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  )
}

function DetailRow({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Building2
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex gap-2">
      <Icon
        className="text-muted-foreground mt-0.5 size-4 shrink-0"
        aria-hidden
      />
      <div className="min-w-0">
        <dt className="text-muted-foreground text-xs">{label}</dt>
        <dd className="min-w-0">{children}</dd>
      </div>
    </div>
  )
}
