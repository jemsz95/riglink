import { queryOptions } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { withStaleClaimsRetry } from '@/lib/auth/refresh-on-stale-claims'
import { jobKeys, referenceKeys } from './keys'
import { pageRange } from './filters'
import type { QueryData } from '@supabase/supabase-js'
import type { JobListFilters } from './filters'
import type { StatusTransition } from './status'

/**
 * Explicit FK hints (`!jobs_client_fk`) rather than the bare `clients(...)`
 * shorthand. Both resolve today, but jobs already has two composite FKs sharing
 * `org_id`; naming the constraint means a future second path to the same table
 * turns into a compile-time change here instead of a runtime PGRST ambiguity
 * error in production.
 */
const JOB_LIST_SELECT = `
  id, number, title, status, priority, source,
  requested_for, scheduled_start, scheduled_end,
  updated_at, created_at, lead_tech_id, client_id, site_id,
  clients!jobs_client_fk (id, name),
  sites!jobs_site_fk (id, name, timezone)
` as const

const JOB_DETAIL_SELECT = `
  *,
  clients!jobs_client_fk (id, name, billing_email, phone),
  sites!jobs_site_fk (id, name, address, timezone, lat, lng, access_notes,
                      site_contact_name, site_contact_phone),
  client_contacts!jobs_requested_by_contact_id_fkey (id, full_name, email)
` as const

const jobListBase = () => supabase.from('jobs').select(JOB_LIST_SELECT)
const jobDetailBase = () => supabase.from('jobs').select(JOB_DETAIL_SELECT)

export type JobListRow = QueryData<ReturnType<typeof jobListBase>>[number]
export type JobDetail = QueryData<ReturnType<typeof jobDetailBase>>[number]

export interface JobListPage {
  rows: Array<JobListRow>
  total: number
}

/**
 * Makes a user-typed term safe for PostgREST's `or` logic tree.
 *
 * Verified against the live API: an unquoted comma fails with PGRST100
 * ("failed to parse logic tree"), so searching for `boiler, room` would error
 * rather than return nothing. Double quotes fix it; inside them only `"` and
 * `\` need escaping. `%` is left alone -- as a wildcard it is a feature.
 */
export function escapeOrFilterTerm(term: string): string {
  return term.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

/**
 * Builder type for the list select. Both `.select(s)` and
 * `.select(s, { count })` produce it, so one helper serves the page query and
 * any future count-only query.
 */
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

  if (filters.q) {
    const term = escapeOrFilterTerm(filters.q)
    const clauses = [`title.ilike."%${term}%"`, `description.ilike."%${term}%"`]
    // Job numbers are what clients actually quote on the phone, so a numeric
    // term should find #1043 as well as matching text.
    const asNumber = Number.parseInt(filters.q, 10)
    if (Number.isSafeInteger(asNumber)) clauses.push(`number.eq.${asNumber}`)
    query = query.or(clauses.join(','))
  }

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
          .from('jobs')
          .select(JOB_LIST_SELECT, { count: 'exact' })
        const { data, error, count } = await applyJobFilters(
          builder,
          orgId,
          filters,
        ).range(from, to)
        if (error) throw error
        return { rows: data, total: count ?? 0 }
      }),
    // Keeps the previous page visible while the next one loads instead of
    // flashing an empty table on every sort or page change.
    placeholderData: (previous) => previous,
  })

export const jobDetailQuery = (orgId: string, jobId: string) =>
  queryOptions({
    queryKey: jobKeys.detail(orgId, jobId),
    queryFn: () =>
      withStaleClaimsRetry(async (): Promise<JobDetail> => {
        const { data, error } = await supabase
          .from('jobs')
          .select(JOB_DETAIL_SELECT)
          .eq('org_id', orgId)
          .eq('id', jobId)
          .single()
        if (error) throw error
        return data
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
