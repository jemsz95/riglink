import { z } from 'zod'
import { JOB_STATUS_EXCEPTIONAL, JOB_STATUS_ORDER } from '@/lib/supabase/db'
import type { JobStatus } from '@/lib/supabase/db'

const JOB_STATUS_VALUES = [
  ...JOB_STATUS_ORDER,
  ...JOB_STATUS_EXCEPTIONAL,
] as unknown as [JobStatus, ...Array<JobStatus>]

export const jobStatusSchema = z.enum(JOB_STATUS_VALUES)

/**
 * Sortable columns are a CLOSED SET, not a free string.
 *
 * The value reaches PostgREST's `order` parameter. Accepting whatever is in the
 * URL would let a visitor sort by `internal_notes` -- which reveals nothing on
 * its own, but ordering is an oracle: it leaks the relative content of a column
 * the portal is never shown. Whitelisting costs one line.
 */
export const JOB_SORT_COLUMNS = [
  'number',
  'title',
  'status',
  'priority',
  'requested_for',
  'scheduled_start',
  'created_at',
  'updated_at',
] as const

export type JobSortColumn = (typeof JOB_SORT_COLUMNS)[number]

export const PAGE_SIZES = [25, 50, 100] as const

export const JOB_LIST_DEFAULTS = {
  status: [] as Array<JobStatus>,
  q: '',
  client: undefined as string | undefined,
  site: undefined as string | undefined,
  sort: 'updated_at' as JobSortColumn,
  dir: 'desc' as 'asc' | 'desc',
  page: 1,
  size: 25 as (typeof PAGE_SIZES)[number],
}

/**
 * `.default()` AND `.catch()` on every field, deliberately.
 *
 * `.catch()` makes a hand-edited or stale URL degrade to the default view
 * instead of throwing an error boundary -- people bookmark and share filtered
 * lists, and a link that breaks after the filter vocabulary changes is a
 * support ticket.
 *
 * `.default()` is what makes the field OPTIONAL in the schema's input type,
 * which is the type `<Link to="/$orgSlug/jobs">` must satisfy. With `.catch()`
 * alone the output is filled in but the input stays required, so every link to
 * the list would have to spell out all eight parameters.
 */
export const jobListSearchSchema = z.object({
  status: z.array(jobStatusSchema).default([]).catch([]),
  q: z.string().trim().max(200).default('').catch(''),
  client: z.string().uuid().optional().catch(undefined),
  site: z.string().uuid().optional().catch(undefined),
  sort: z
    .enum(JOB_SORT_COLUMNS)
    .default(JOB_LIST_DEFAULTS.sort)
    .catch(JOB_LIST_DEFAULTS.sort),
  dir: z
    .enum(['asc', 'desc'])
    .default(JOB_LIST_DEFAULTS.dir)
    .catch(JOB_LIST_DEFAULTS.dir),
  page: z.coerce.number().int().min(1).default(1).catch(1),
  size: z.coerce
    .number()
    .int()
    .refine((value): value is (typeof PAGE_SIZES)[number] =>
      (PAGE_SIZES as ReadonlyArray<number>).includes(value),
    )
    .default(JOB_LIST_DEFAULTS.size)
    .catch(JOB_LIST_DEFAULTS.size),
})

/** What a caller may pass in a URL: every field optional. */
export type JobListSearchInput = z.input<typeof jobListSearchSchema>

export type JobListFilters = z.infer<typeof jobListSearchSchema>

/**
 * Drops defaulted values so the URL stays readable and shareable.
 *
 * Without this, every navigation writes eight parameters and the address bar
 * becomes unreadable -- which matters because these URLs get pasted into chat.
 *
 * Written out field by field rather than looping `Object.entries`. The loop
 * version needs two casts to typecheck, and casts are exactly how a field
 * silently stops being stripped when the schema changes. This is the URL
 * contract; it is worth eight explicit lines.
 */
export function stripJobListDefaults(
  filters: Partial<JobListFilters>,
): JobListSearchInput {
  const out: JobListSearchInput = {}

  if (filters.status && filters.status.length > 0) out.status = filters.status
  if (filters.q) out.q = filters.q
  if (filters.client) out.client = filters.client
  if (filters.site) out.site = filters.site
  if (filters.sort && filters.sort !== JOB_LIST_DEFAULTS.sort) {
    out.sort = filters.sort
  }
  if (filters.dir && filters.dir !== JOB_LIST_DEFAULTS.dir) {
    out.dir = filters.dir
  }
  if (filters.page && filters.page !== JOB_LIST_DEFAULTS.page) {
    out.page = filters.page
  }
  if (filters.size && filters.size !== JOB_LIST_DEFAULTS.size) {
    out.size = filters.size
  }

  return out
}

/** True when anything narrows the list, so the UI can offer "clear filters". */
export function hasActiveJobFilters(filters: JobListFilters): boolean {
  return (
    filters.status.length > 0 ||
    filters.q !== '' ||
    filters.client !== undefined ||
    filters.site !== undefined
  )
}

/** Statuses considered "in flight" -- the default working set for a dispatcher. */
export const OPEN_JOB_STATUSES: ReadonlyArray<JobStatus> = [
  'requested',
  'triaged',
  'quoted',
  'approved',
  'scheduled',
  'in_progress',
  'work_complete',
]

export const AWAITING_CLIENT_STATUSES: ReadonlyArray<JobStatus> = [
  'quoted',
  'work_complete',
  'invoiced',
]

export interface JobListRange {
  from: number
  to: number
}

/** Converts a 1-based page into the inclusive range PostgREST expects. */
export function pageRange(page: number, size: number): JobListRange {
  const from = (page - 1) * size
  return { from, to: from + size - 1 }
}

export function pageCount(total: number, size: number): number {
  if (total <= 0) return 1
  return Math.ceil(total / size)
}
