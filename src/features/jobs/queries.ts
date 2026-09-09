import { queryOptions } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { withStaleClaimsRetry } from '@/lib/auth/refresh-on-stale-claims'
import { jobKeys, referenceKeys } from './keys'
import { pageRange } from './filters'
import type { JobListFilters } from './filters'
import type { StatusTransition } from './status'
import type { Job, JobPriority, JobSource, JobStatus } from '@/lib/supabase/db'
import type { Json } from '@/lib/supabase/database.types'

/**
 * Reads go through `staff_job_list_v` / `staff_job_detail_v`.
 *
 * The projection -- which columns a job row has, and which of its client and
 * site fields come with it -- is a property of the domain, so it lives in a
 * migration rather than being restated as a PostgREST select string here and
 * again in every other client. Filtering, sorting and pagination stay on this
 * side, against the view, which keeps `count: 'exact'` in one round trip and
 * the sort column dynamic without dynamic SQL.
 */
const JOB_LIST_COLUMNS = '*' as const

/**
 * Turns a search term into an ILIKE pattern.
 *
 * A single `search_text` column and a single ILIKE replaced a hand-built
 * PostgREST `or` logic tree per feature. That is what retired
 * `escapeOrFilterTerm`: the escaping it did existed because an unquoted comma
 * inside an `or` term made the whole request fail with PGRST100, and a lone
 * filter has no logic tree to break.
 *
 * `%` and `_` are left alone, so a user who types them gets wildcards. That
 * was already this project's documented choice and remains a reasonable one
 * for a search box. A leading `#` is dropped, because job numbers are
 * displayed as `#1043` and get pasted back in that form.
 */
export function toSearchPattern(term: string): string {
  return `%${term.trim().replace(/^#/, '')}%`
}

/**
 * The list row, with nullability resolved at the boundary.
 *
 * Every column of a view types as nullable -- Postgres cannot prove otherwise
 * through one -- while most of these are NOT NULL on `jobs`. Answering that
 * here, once, keeps the assertion out of every cell renderer. `client_name`,
 * `site_name` and `site_timezone` stay nullable for real: the view LEFT JOINs,
 * deliberately, so that a job is never dropped from a list because its client
 * row was unreadable.
 */
export interface JobListRow {
  id: string
  number: number
  title: string
  status: JobStatus
  priority: JobPriority
  source: JobSource
  requested_for: string | null
  scheduled_start: string | null
  scheduled_end: string | null
  updated_at: string
  created_at: string
  lead_tech_id: string | null
  client_id: string
  site_id: string | null
  client_name: string | null
  site_name: string | null
  site_timezone: string | null
}

export interface JobListPage {
  rows: Array<JobListRow>
  total: number
}

type JobListViewRow = {
  [K in keyof JobListRow]: JobListRow[K] | null
} & { search_text?: string | null }

function toJobListRow(row: JobListViewRow): JobListRow {
  if (
    row.id == null ||
    row.number == null ||
    row.title == null ||
    row.status == null ||
    row.priority == null ||
    row.source == null ||
    row.updated_at == null ||
    row.created_at == null ||
    row.client_id == null
  ) {
    throw new Error(
      'staff_job_list_v returned a row missing a NOT NULL job column; the view and the base table have diverged',
    )
  }
  return {
    id: row.id,
    number: row.number,
    title: row.title,
    status: row.status,
    priority: row.priority,
    source: row.source,
    requested_for: row.requested_for,
    scheduled_start: row.scheduled_start,
    scheduled_end: row.scheduled_end,
    updated_at: row.updated_at,
    created_at: row.created_at,
    lead_tech_id: row.lead_tech_id,
    client_id: row.client_id,
    site_id: row.site_id,
    client_name: row.client_name,
    site_name: row.site_name,
    site_timezone: row.site_timezone,
  }
}

/**
 * Builder type for the list select. Both `.select(s)` and
 * `.select(s, { count })` produce it, so one helper serves the page query and
 * any future count-only query.
 */
const jobListBase = () =>
  supabase.from('staff_job_list_v').select(JOB_LIST_COLUMNS)

type JobListBuilder = ReturnType<typeof jobListBase>

function applyJobFilters(
  builder: JobListBuilder,
  orgId: string,
  filters: JobListFilters,
): JobListBuilder {
  // Redundant against RLS, and load-bearing anyway: it selects the
  // (org_id, status, updated_at) index and keeps a user who staffs two orgs
  // from seeing one merged list.
  let query = builder.eq('org_id', orgId)

  if (filters.status.length > 0) query = query.in('status', filters.status)
  if (filters.client) query = query.eq('client_id', filters.client)
  if (filters.site) query = query.eq('site_id', filters.site)
  if (filters.q) query = query.ilike('search_text', toSearchPattern(filters.q))

  return (
    query
      .order(filters.sort, {
        ascending: filters.dir === 'asc',
        nullsFirst: false,
      })
      // Tiebreaker. Without a unique final sort key, rows with equal sort values
      // can appear on two pages or on none -- Postgres gives no stable order, and
      // the user sees a duplicate or a silently missing job.
      .order('id', { ascending: true })
  )
}

export const jobListQuery = (orgId: string, filters: JobListFilters) =>
  queryOptions({
    queryKey: jobKeys.list(orgId, filters),
    queryFn: () =>
      withStaleClaimsRetry(async (): Promise<JobListPage> => {
        const { from, to } = pageRange(filters.page, filters.size)
        const builder = supabase
          .from('staff_job_list_v')
          .select(JOB_LIST_COLUMNS, { count: 'exact' })
        const { data, error, count } = await applyJobFilters(
          builder,
          orgId,
          filters,
        ).range(from, to)
        if (error) throw error
        return { rows: data.map(toJobListRow), total: count ?? 0 }
      }),
    // Keeps the previous page visible while the next one loads instead of
    // flashing an empty table on every sort or page change.
    placeholderData: (previous) => previous,
  })

/**
 * One job, with its client, site and requesting contact flattened onto it.
 *
 * `Job` carries the base table's own nullability, which is accurate; the
 * joined fields are all genuinely nullable, either because the join is a LEFT
 * JOIN or because the underlying column is.
 */
export type JobDetail = Job & {
  /** From `job_internal_notes`, not from `jobs`. Null when there is no note
   *  and also, correctly, for anyone whose policies do not reach it. */
  internal_notes: string | null
  client_name: string | null
  client_billing_email: string | null
  client_phone: string | null
  site_name: string | null
  site_address: Json | null
  site_timezone: string | null
  site_lat: number | null
  site_lng: number | null
  site_access_notes: string | null
  site_contact_name: string | null
  site_contact_phone: string | null
  requested_by_name: string | null
  requested_by_email: string | null
}

export const jobDetailQuery = (orgId: string, jobId: string) =>
  queryOptions({
    queryKey: jobKeys.detail(orgId, jobId),
    queryFn: () =>
      withStaleClaimsRetry(async (): Promise<JobDetail> => {
        const { data, error } = await supabase
          .from('staff_job_detail_v')
          .select('*')
          .eq('org_id', orgId)
          .eq('id', jobId)
          .single()
        if (error) throw error
        if (data.id == null || data.status == null || data.number == null) {
          throw new Error(
            'staff_job_detail_v returned a row missing a NOT NULL job column; the view and the base table have diverged',
          )
        }
        // The view's columns are all typed nullable, and the assertion above
        // covers the ones a renderer would crash on. The rest of `Job` is
        // accurate as declared, so this narrows in one place rather than at
        // every field.
        return data as unknown as JobDetail
      }),
  })

export interface JobStatusEventRow {
  id: number
  from_status: string | null
  to_status: string
  actor_user_id: string | null
  actor_kind: string
  reason: string | null
  created_at: string
}

export const jobStatusEventsQuery = (orgId: string, jobId: string) =>
  queryOptions({
    queryKey: jobKeys.statusEvents(orgId, jobId),
    queryFn: () =>
      withStaleClaimsRetry(async (): Promise<Array<JobStatusEventRow>> => {
        const { data, error } = await supabase
          .from('job_status_events')
          .select(
            'id, from_status, to_status, actor_user_id, actor_kind, reason, created_at',
          )
          .eq('org_id', orgId)
          .eq('job_id', jobId)
          .order('created_at', { ascending: true })
          .order('id', { ascending: true })
        if (error) throw error
        return data
      }),
  })

/**
 * The legal state machine, read from the table that the trigger enforces.
 *
 * Cached hard: it is small, global, and changes only when a migration changes
 * it. Reading it rather than hardcoding the graph is what guarantees the UI
 * never offers a button the database will reject.
 */
export const jobStatusTransitionsQuery = () =>
  queryOptions({
    queryKey: referenceKeys.jobStatusTransitions(),
    queryFn: () =>
      withStaleClaimsRetry(async (): Promise<Array<StatusTransition>> => {
        const { data, error } = await supabase
          .from('job_status_transitions')
          .select('from_status, to_status, actor_kind')
        if (error) throw error
        return data
      }),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
  })
