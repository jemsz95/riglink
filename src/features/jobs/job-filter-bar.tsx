import { useEffect, useState } from 'react'
import { Search, X } from 'lucide-react'
import {
  AWAITING_CLIENT_STATUSES,
  OPEN_JOB_STATUSES,
  hasActiveJobFilters,
} from './filters'
import { JOB_STATUS_PRESENTATION } from './status'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { JobListFilters } from './filters'
import type { ClientOption } from '@/features/clients/queries'
import type { JobStatus } from '@/lib/supabase/db'

const ALL_CLIENTS = '__all__'

interface QuickFilter {
  id: string
  label: string
  statuses: ReadonlyArray<JobStatus>
}

/**
 * Named working sets, not a 14-checkbox status picker.
 *
 * A dispatcher's real questions are "what is live?" and "what am I waiting on
 * the client for?". Those are the two chips; the full status list stays
 * available through the select for the rarer cases.
 */
const QUICK_FILTERS: ReadonlyArray<QuickFilter> = [
  { id: 'open', label: 'Open', statuses: OPEN_JOB_STATUSES },
  {
    id: 'awaiting',
    label: 'Awaiting client',
    statuses: AWAITING_CLIENT_STATUSES,
  },
  { id: 'in_progress', label: 'In progress', statuses: ['in_progress'] },
  { id: 'scheduled', label: 'Scheduled', statuses: ['scheduled'] },
]

function sameStatuses(
  a: ReadonlyArray<JobStatus>,
  b: ReadonlyArray<JobStatus>,
): boolean {
  return a.length === b.length && a.every((value) => b.includes(value))
}

export interface JobFilterBarProps {
  filters: JobListFilters
  clients: Array<ClientOption>
  onChange: (next: Partial<JobListFilters>) => void
}

export function JobFilterBar({
  filters,
  clients,
  onChange,
}: JobFilterBarProps) {
  // Local mirror so typing stays responsive: writing every keystroke to the
  // URL would push a history entry per character and refetch on each one.
  const [term, setTerm] = useState(filters.q)

  useEffect(() => {
    setTerm(filters.q)
  }, [filters.q])

  useEffect(() => {
    if (term === filters.q) return
    const timer = setTimeout(() => {
      onChange({ q: term })
    }, 300)
    return () => clearTimeout(timer)
  }, [term, filters.q, onChange])

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Search jobs, or type a job number"
            aria-label="Search jobs"
            className="pl-8"
          />
        </div>

        <Select
          value={filters.client ?? ALL_CLIENTS}
          onValueChange={(value) => {
            onChange({
              client: value === ALL_CLIENTS ? undefined : value,
              // A site belongs to exactly one client, so a site filter from the
              // previous client can only produce an empty list.
              site: undefined,
            })
          }}
        >
          <SelectTrigger className="w-48" aria-label="Filter by client">
            <SelectValue placeholder="All clients" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_CLIENTS}>All clients</SelectItem>
            {clients.map((client) => (
              <SelectItem key={client.id} value={client.id}>
                {client.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasActiveJobFilters(filters) ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              onChange({
                status: [],
                q: '',
                client: undefined,
                site: undefined,
              })
            }}
          >
            <X className="size-4" aria-hidden />
            Clear
          </Button>
        ) : null}
      </div>

      <div
        className="flex flex-wrap gap-1.5"
        role="group"
        aria-label="Quick filters"
      >
        {QUICK_FILTERS.map((quick) => {
          const active = sameStatuses(filters.status, quick.statuses)
          return (
            <Button
              key={quick.id}
              type="button"
              variant={active ? 'default' : 'outline'}
              size="sm"
              aria-pressed={active}
              onClick={() => {
                // Clicking the active chip clears it, so the chips behave as a
                // toggle rather than a one-way trap.
                onChange({ status: active ? [] : [...quick.statuses] })
              }}
            >
              {quick.label}
            </Button>
          )
        })}
        {filters.status.length > 0 &&
        !QUICK_FILTERS.some((quick) =>
          sameStatuses(filters.status, quick.statuses),
        ) ? (
          <span className="text-muted-foreground self-center text-xs">
            {filters.status
              .map((status) => JOB_STATUS_PRESENTATION[status].label)
              .join(', ')}
          </span>
        ) : null}
      </div>
    </div>
  )
}
