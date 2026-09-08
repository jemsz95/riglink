import type { Database, TablesInsert } from './database.types'

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']
export type Enums<T extends keyof Database['public']['Enums']> =
  Database['public']['Enums'][T]

export type Profile = Tables<'profiles'>
export type Organization = Tables<'organizations'>
export type OrgMember = Tables<'org_members'>
export type Client = Tables<'clients'>
export type ClientContact = Tables<'client_contacts'>
export type Site = Tables<'sites'>
export type Job = Tables<'jobs'>
export type JobStatusEvent = Tables<'job_status_events'>

export type StaffRole = Enums<'staff_role'>
export type ContactRole = Enums<'contact_role'>
export type JobStatus = Enums<'job_status'>
export type JobPriority = Enums<'job_priority'>
export type JobSource = Enums<'job_source'>

/**
 * `jobs.number` is NOT NULL and assigned by a BEFORE INSERT trigger
 * (app.assign_job_number). The type generator cannot see the trigger, so the
 * generated Insert type demands it. Omit it here so callers do not invent a
 * number -- doing so would defeat the per-org gapless sequence.
 */
export type JobInsert = Omit<TablesInsert<'jobs'>, 'number'>

/** Lifecycle order, for sorting and progress display. */
export const JOB_STATUS_ORDER: ReadonlyArray<JobStatus> = [
  'draft',
  'requested',
  'triaged',
  'quoted',
  'approved',
  'scheduled',
  'in_progress',
  'work_complete',
  'client_accepted',
  'invoiced',
  'closed',
] as const

/** States a job can rest in that are not part of the happy path. */
export const JOB_STATUS_EXCEPTIONAL: ReadonlyArray<JobStatus> = [
  'on_hold',
  'cancelled',
  'declined',
] as const
