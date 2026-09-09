import { Link } from '@tanstack/react-router'
import { createAppColumnHelper } from '@/components/app/data-table/table-hook'
import { JobPriorityBadge } from '@/components/domain/job-priority-badge'
import { JobStatusBadge } from '@/components/domain/job-status-badge'
import {
  formatDate,
  formatJobNumber,
  formatRelative,
  orDash,
} from '@/lib/format'
import type { AppColumnDef } from '@/components/app/data-table/table-hook'
import type { JobListRow } from './queries'

const helper = createAppColumnHelper<JobListRow>()

/**
 * Column ids for sortable columns are the DATABASE column names.
 *
 * That is what lets a header click become a PostgREST `order` value with no
 * lookup table in between -- and the search schema whitelists exactly the same
 * names, so an unsortable column cannot reach the query even by URL editing.
 */
export function jobColumns(orgSlug: string): Array<AppColumnDef<JobListRow>> {
  return helper.columns([
    helper.accessor('number', {
      header: 'No.',
      meta: { align: 'right', label: 'Number', nowrap: true },
      enableHiding: false,
      cell: ({ getValue }) => (
        <span className="text-muted-foreground">
          {formatJobNumber(getValue())}
        </span>
      ),
    }),
    helper.accessor('title', {
      header: 'Job',
      meta: { label: 'Job' },
      enableHiding: false,
      cell: ({ row, getValue }) => (
        <Link
          to="/$orgSlug/jobs/$jobId"
          params={{ orgSlug, jobId: row.original.id }}
          className="hover:text-primary font-medium underline-offset-4 hover:underline"
        >
          {getValue()}
        </Link>
      ),
    }),
    // Sortable now. These were display-only because ordering by a PostgREST
    // embedded resource is not possible in one request; on `staff_job_list_v`
    // they are ordinary columns, so the header does what it looks like it does.
    helper.accessor('client_name', {
      id: 'client_name',
      header: 'Client',
      meta: { label: 'Client' },
      cell: ({ getValue }) => (
        <span className="truncate">{orDash(getValue())}</span>
      ),
    }),
    helper.accessor('site_name', {
      id: 'site_name',
      header: 'Site',
      meta: { label: 'Site' },
      cell: ({ getValue }) => (
        <span className="text-muted-foreground truncate">
          {orDash(getValue())}
        </span>
      ),
    }),
    helper.accessor('status', {
      header: 'Status',
      meta: { label: 'Status', nowrap: true },
      cell: ({ getValue }) => <JobStatusBadge status={getValue()} />,
    }),
    helper.accessor('priority', {
      header: 'Priority',
      meta: { label: 'Priority', nowrap: true },
      cell: ({ getValue }) => <JobPriorityBadge priority={getValue()} />,
    }),
    helper.accessor('scheduled_start', {
      header: 'Scheduled',
      meta: { label: 'Scheduled', nowrap: true },
      cell: ({ row, getValue }) => (
        <span className="text-muted-foreground">
          {formatDate(getValue(), row.original.site_timezone)}
        </span>
      ),
    }),
    helper.accessor('updated_at', {
      header: 'Updated',
      meta: { label: 'Updated', nowrap: true },
      cell: ({ getValue }) => (
        <span className="text-muted-foreground">
          {formatRelative(getValue())}
        </span>
      ),
    }),
  ])
}
