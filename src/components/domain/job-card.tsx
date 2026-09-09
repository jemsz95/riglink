import { Link } from '@tanstack/react-router'
import { Building2, CalendarClock, MapPin } from 'lucide-react'
import { JobPriorityBadge } from './job-priority-badge'
import { JobStatusBadge } from './job-status-badge'
import {
  formatDate,
  formatJobNumber,
  formatRelative,
  orDash,
} from '@/lib/format'
import { cn } from '@/lib/utils'
import type { JobListRow } from '@/features/jobs/queries'

export interface JobCardProps {
  job: JobListRow
  orgSlug: string
  className?: string
}

/**
 * The phone rendering of a job list row.
 *
 * Not a styled table row: the ordering is different because the priorities are
 * different. On a phone the title and status come first and the metadata is
 * secondary, whereas the desktop table leads with the number for scanning.
 * The whole card is one tap target -- a tech wearing gloves cannot hit a link
 * inside a row.
 */
export function JobCard({ job, orgSlug, className }: JobCardProps) {
  return (
    <Link
      to="/$orgSlug/jobs/$jobId"
      params={{ orgSlug, jobId: job.id }}
      className={cn(
        'border-border bg-card focus-visible:ring-ring/50 block rounded-lg border p-3 shadow-e1 focus-visible:ring-[3px] focus-visible:outline-none',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-muted-foreground font-mono text-2xs tabular-nums">
            {formatJobNumber(job.number)}
          </p>
          <h3 className="truncate text-sm font-medium">{job.title}</h3>
        </div>
        <JobStatusBadge status={job.status} />
      </div>

      <dl className="text-muted-foreground mt-2 flex flex-col gap-1 text-xs">
        <div className="flex items-center gap-1.5">
          <dt className="sr-only">Client</dt>
          <Building2 className="size-3.5 shrink-0" aria-hidden />
          <dd className="truncate">{orDash(job.client_name)}</dd>
        </div>
        {job.site_name ? (
          <div className="flex items-center gap-1.5">
            <dt className="sr-only">Site</dt>
            <MapPin className="size-3.5 shrink-0" aria-hidden />
            <dd className="truncate">{job.site_name}</dd>
          </div>
        ) : null}
        {job.scheduled_start ? (
          <div className="flex items-center gap-1.5">
            <dt className="sr-only">Scheduled</dt>
            <CalendarClock className="size-3.5 shrink-0" aria-hidden />
            {/* The SITE's timezone, not the org's or the browser's -- a job two
                zones away otherwise shows the wrong day to the tech in it. */}
            <dd>{formatDate(job.scheduled_start, job.site_timezone)}</dd>
          </div>
        ) : null}
      </dl>

      <div className="mt-2 flex items-center justify-between gap-2">
        <JobPriorityBadge priority={job.priority} />
        <span className="text-muted-foreground text-2xs">
          {formatRelative(job.updated_at)}
        </span>
      </div>
    </Link>
  )
}
