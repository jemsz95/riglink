import { useMemo } from 'react'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Briefcase, Plus, SearchX } from 'lucide-react'
import { Route as OrgRoute } from './$orgSlug'
import { DataTable } from '@/components/app/data-table/data-table'
import {
  fromPaginationState,
  fromSortingState,
  resetPage,
  toPaginationState,
  toSortingState,
} from '@/components/app/data-table/url-state'
import { EmptyState } from '@/components/app/empty-state'
import { JobCard } from '@/components/domain/job-card'
import { JobFilterBar } from '@/features/jobs/job-filter-bar'
import { jobColumns } from '@/features/jobs/columns'
import {
  JOB_LIST_DEFAULTS,
  PAGE_SIZES,
  hasActiveJobFilters,
  jobListSearchSchema,
  stripJobListDefaults,
} from '@/features/jobs/filters'
import { jobListQuery } from '@/features/jobs/queries'
import { clientOptionsQuery } from '@/features/clients/queries'
import { Button } from '@/components/ui/button'
import type { JobListFilters } from '@/features/jobs/filters'

export const Route = createFileRoute('/$orgSlug/_staff/jobs/')({
  validateSearch: jobListSearchSchema,
  // Kept out of `loaderDeps`/`loader` on purpose: the list is a client-side
  // query so that changing a filter re-uses the cache and shows the previous
  // page while the next loads, rather than suspending the whole route.
  component: JobsPage,
})

function JobsPage() {
  const { org } = OrgRoute.useRouteContext()
  const { orgSlug } = Route.useParams()
  const filters = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })

  const jobs = useQuery(jobListQuery(org.id, filters))
  const clients = useQuery(clientOptionsQuery(org.id))
  const columns = useMemo(() => jobColumns(orgSlug), [orgSlug])

  /**
   * Every filter change goes through here, and every one of them resets to
   * page 1. Narrowing a result set while on page 7 shows an empty table, which
   * users read as "my data is gone" rather than "wrong page".
   */
  const setFilters = (next: Partial<JobListFilters>, keepPage = false) => {
    void navigate({
      search: (previous) => {
        const merged = { ...previous, ...next }
        return stripJobListDefaults(keepPage ? merged : resetPage(merged))
      },
      replace: true,
    })
  }

  const filtered = hasActiveJobFilters(filters)

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Jobs</h1>
          <p className="text-muted-foreground text-sm">
            Every job across all sites for {org.name}.
          </p>
        </div>
        <Button asChild>
          <Link to="/$orgSlug/jobs/new" params={{ orgSlug }}>
            <Plus className="size-4" aria-hidden />
            New job
          </Link>
        </Button>
      </header>

      <JobFilterBar
        filters={filters}
        clients={clients.data ?? []}
        onChange={setFilters}
      />

      <DataTable
        data={jobs.data?.rows ?? []}
        columns={columns}
        total={jobs.data?.total ?? 0}
        getRowId={(row) => row.id}
        tableId="jobs"
        label="Jobs"
        isLoading={jobs.isPending}
        isFetching={jobs.isFetching}
        sorting={toSortingState(filters)}
        onSortingChange={(sorting) => {
          setFilters(fromSortingState(sorting, JOB_LIST_DEFAULTS))
        }}
        pagination={toPaginationState(filters)}
        pageSizes={PAGE_SIZES}
        onPaginationChange={(pagination) => {
          const next = fromPaginationState(pagination)
          // Narrowed through the whitelist rather than cast: the selector can
          // only offer these values, so a mismatch means a bug upstream and
          // falling back to the current size is the safe answer.
          const size = PAGE_SIZES.find((value) => value === next.size)
          const sizeChanged = size !== undefined && size !== filters.size
          setFilters(
            { page: next.page, size: size ?? filters.size },
            // Changing the page size must go back to page 1; paging must not.
            !sizeChanged,
          )
        }}
        renderCard={(job) => <JobCard job={job} orgSlug={orgSlug} />}
        empty={
          filtered ? (
            <EmptyState
              icon={SearchX}
              title="No jobs match these filters"
              body="Nothing here is deleted -- widen the filters to see it again."
              action={
                <Button
                  variant="outline"
                  onClick={() => {
                    setFilters({
                      status: [],
                      q: '',
                      client: undefined,
                      site: undefined,
                    })
                  }}
                >
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={Briefcase}
              title="No jobs yet"
              body="Create the first job, or wait for a client to request one through the portal."
              action={
                <Button asChild>
                  <Link to="/$orgSlug/jobs/new" params={{ orgSlug }}>
                    <Plus className="size-4" aria-hidden />
                    New job
                  </Link>
                </Button>
              }
            />
          )
        }
      />
    </div>
  )
}
