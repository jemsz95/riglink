import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import {
  Briefcase,
  Building2,
  Download,
  LayoutDashboard,
  MapPin,
  Plus,
  Receipt,
} from 'lucide-react'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import { jobListQuery } from '@/features/jobs/queries'
import { JOB_LIST_DEFAULTS } from '@/features/jobs/filters'
import { canDispatch } from '@/features/orgs/permissions'
import { formatJobNumber } from '@/lib/format'

/**
 * Global command palette. Cmd/Ctrl-K.
 *
 * Exists because the fastest thing a dispatcher does all day is "get me job
 * 1043" while somebody is on the phone. Two taps through a nav and a filter is
 * slower than typing the number, and every second of that is dead air on the
 * call.
 *
 * Job search reuses `search_text` on `staff_job_list_v` -- the same single
 * ILIKE column the jobs list uses -- so there is one definition of what
 * "searching" means and it cannot drift between the two surfaces.
 */
export function CommandPalette({
  orgId,
  role,
}: {
  orgId: string
  role: string
}) {
  const [open, setOpen] = useState(false)
  const [term, setTerm] = useState('')
  const navigate = useNavigate()
  const { orgSlug } = useParams({ strict: false })

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'k' && (event.metaKey || event.ctrlKey)) {
        // preventDefault or the browser opens its own search on some
        // platforms and the dialog appears behind it.
        event.preventDefault()
        setOpen((previous) => !previous)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  // Only searches once there is something to search for. Opening the palette
  // must not fire a query -- and an empty term would match every job in the
  // org.
  const trimmed = term.trim()
  // `orgId`, not `orgSlug`: the query filters on `org_id`, and passing the
  // slug would return nothing while looking like an empty result set.
  const jobs = useQuery({
    ...jobListQuery(orgId, { ...JOB_LIST_DEFAULTS, q: trimmed }),
    enabled: open && trimmed.length >= 2,
  })

  const go = useMemo(
    () => (fn: () => void) => {
      setOpen(false)
      setTerm('')
      fn()
    },
    [],
  )

  if (!orgSlug) return null

  return (
    <CommandDialog open={open} onOpenChange={setOpen} title="Command palette">
      {/* `shouldFilter={false}` on the list below: cmdk's own fuzzy filter
          would re-filter server results that are already filtered, and hide
          matches the database found. */}
      <CommandInput
        placeholder="Search jobs, or jump to…"
        value={term}
        onValueChange={setTerm}
      />
      <CommandList>
        <CommandEmpty>
          {trimmed.length < 2
            ? 'Type at least two characters to search jobs.'
            : jobs.isPending
              ? 'Searching…'
              : 'Nothing found.'}
        </CommandEmpty>

        {/* Sliced to eight in the render rather than requested as a page of
            eight: the list's page size is a closed union (25/50/100) that the
            URL schema validates, and widening it for the palette would widen
            it for every bookmarked list URL too. */}
        {jobs.data && jobs.data.rows.length > 0 ? (
          <>
            <CommandGroup heading="Jobs">
              {jobs.data.rows.slice(0, 8).map((job) => (
                <CommandItem
                  key={job.id}
                  value={`job-${job.id}`}
                  onSelect={() =>
                    go(
                      () =>
                        void navigate({
                          to: '/$orgSlug/jobs/$jobId',
                          params: { orgSlug, jobId: job.id },
                        }),
                    )
                  }
                >
                  <Briefcase className="size-4" aria-hidden />
                  <span className="font-mono text-xs">
                    {formatJobNumber(job.number)}
                  </span>
                  <span className="truncate">{job.title}</span>
                  <span className="text-muted-foreground ml-auto shrink-0 text-xs">
                    {job.client_name}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        ) : null}

        <CommandGroup heading="Go to">
          <CommandItem
            value="goto dashboard"
            onSelect={() =>
              go(() => void navigate({ to: '/$orgSlug', params: { orgSlug } }))
            }
          >
            <LayoutDashboard className="size-4" aria-hidden />
            Dashboard
          </CommandItem>
          <CommandItem
            value="goto jobs"
            onSelect={() =>
              go(
                () =>
                  void navigate({ to: '/$orgSlug/jobs', params: { orgSlug } }),
              )
            }
          >
            <Briefcase className="size-4" aria-hidden />
            Jobs
          </CommandItem>
          <CommandItem
            value="goto clients"
            onSelect={() =>
              go(
                () =>
                  void navigate({
                    to: '/$orgSlug/clients',
                    params: { orgSlug },
                  }),
              )
            }
          >
            <Building2 className="size-4" aria-hidden />
            Clients
          </CommandItem>
          <CommandItem
            value="goto sites"
            onSelect={() =>
              go(
                () =>
                  void navigate({ to: '/$orgSlug/sites', params: { orgSlug } }),
              )
            }
          >
            <MapPin className="size-4" aria-hidden />
            Sites
          </CommandItem>
          {canDispatch(role) ? (
            <CommandItem
              value="goto invoices"
              onSelect={() =>
                go(
                  () =>
                    void navigate({
                      to: '/$orgSlug/invoices',
                      params: { orgSlug },
                      search: { status: 'sent' },
                    }),
                )
              }
            >
              <Receipt className="size-4" aria-hidden />
              Invoices
            </CommandItem>
          ) : null}
        </CommandGroup>

        {canDispatch(role) ? (
          <CommandGroup heading="Create">
            <CommandItem
              value="new job"
              onSelect={() =>
                go(
                  () =>
                    void navigate({
                      to: '/$orgSlug/jobs/new',
                      params: { orgSlug },
                    }),
                )
              }
            >
              <Plus className="size-4" aria-hidden />
              New job
            </CommandItem>
            <CommandItem
              value="export invoices"
              onSelect={() =>
                go(
                  () =>
                    void navigate({
                      to: '/$orgSlug/exports',
                      params: { orgSlug },
                    }),
                )
              }
            >
              <Download className="size-4" aria-hidden />
              Accounting export
            </CommandItem>
          </CommandGroup>
        ) : null}
      </CommandList>
    </CommandDialog>
  )
}
