import type { Database, TablesInsert } from './database.types'

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']
/** Portal projections. Column-narrowed views, row-filtered by the same RLS. */
export type Views<T extends keyof Database['public']['Views']> =
  Database['public']['Views'][T]['Row']
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
export type Quote = Tables<'quotes'>
export type QuoteLineItem = Tables<'quote_line_items'>
export type CatalogItem = Tables<'catalog_items'>
export type Approval = Tables<'approvals'>

export type PortalJob = Views<'portal_job_v'>
export type PortalQuote = Views<'portal_quote_v'>
export type PortalQuoteLine = Views<'portal_quote_line_v'>
export type PortalSite = Views<'portal_site_v'>

export type StaffRole = Enums<'staff_role'>
export type ContactRole = Enums<'contact_role'>
export type JobStatus = Enums<'job_status'>
export type JobPriority = Enums<'job_priority'>
export type JobSource = Enums<'job_source'>
export type QuoteStatus = Enums<'quote_status'>
export type LineKind = Enums<'line_kind'>
export type ApprovalKind = Enums<'approval_kind'>
export type ApprovalDecision = Enums<'approval_decision'>

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

/**
 * `quote_line_items.line_total_cents` and `line_tax_cents` are GENERATED
 * STORED, and `quotes` totals are trigger-maintained. The generator cannot
 * see either, so it marks them writable; omitting them here means no caller
 * can send a value the database would silently overwrite.
 */
export type QuoteLineInsert = Omit<
  TablesInsert<'quote_line_items'>,
  'line_total_cents' | 'line_tax_cents'
>

export type QuoteInsert = Omit<
  TablesInsert<'quotes'>,
  'number' | 'subtotal_cents' | 'tax_cents' | 'total_cents'
>

/** Statuses a quote can still be edited in. */
export function isQuoteEditable(status: QuoteStatus): boolean {
  return status === 'draft'
}

/** Statuses where the client is the one who has to act. */
export function isAwaitingClientDecision(status: QuoteStatus): boolean {
  return status === 'sent'
}
