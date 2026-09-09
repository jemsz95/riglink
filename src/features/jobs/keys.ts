import type { JobListFilters } from './filters'

/**
 * Every key begins with the org id.
 *
 * Not a style preference: it makes cross-tenant cache bleed structurally
 * impossible, and switching org a single `invalidateQueries({ queryKey:
 * jobKeys.all(orgId) })`. Stale rows from another tenant appearing after a
 * switch is indistinguishable from an RLS breach to the customer looking at
 * the screen -- they will report it as one, and they will be right to.
 *
 * `eslint no-restricted-syntax` forbids inline queryKey literals outside
 * `features/<domain>/keys.ts`, so this is the only place keys are shaped.
 */
export const jobKeys = {
  all: (orgId: string) => ['org', orgId, 'jobs'] as const,
  list: (orgId: string, filters: JobListFilters) =>
    ['org', orgId, 'jobs', 'list', filters] as const,
  detail: (orgId: string, jobId: string) =>
    ['org', orgId, 'jobs', 'detail', jobId] as const,
  statusEvents: (orgId: string, jobId: string) =>
    ['org', orgId, 'jobs', 'status-events', jobId] as const,
  counts: (orgId: string) => ['org', orgId, 'jobs', 'counts'] as const,
}

export const clientKeys = {
  all: (orgId: string) => ['org', orgId, 'clients'] as const,
  list: (orgId: string, search: string) =>
    ['org', orgId, 'clients', 'list', search] as const,
  detail: (orgId: string, clientId: string) =>
    ['org', orgId, 'clients', 'detail', clientId] as const,
  options: (orgId: string) => ['org', orgId, 'clients', 'options'] as const,
}

export const siteKeys = {
  all: (orgId: string) => ['org', orgId, 'sites'] as const,
  list: (orgId: string, search: string) =>
    ['org', orgId, 'sites', 'list', search] as const,
  detail: (orgId: string, siteId: string) =>
    ['org', orgId, 'sites', 'detail', siteId] as const,
  /** Sites for one client, for the site picker on the job form. */
  forClient: (orgId: string, clientId: string) =>
    ['org', orgId, 'sites', 'for-client', clientId] as const,
}

export const quoteKeys = {
  all: (orgId: string) => ['org', orgId, 'quotes'] as const,
  forJob: (orgId: string, jobId: string) =>
    ['org', orgId, 'quotes', 'for-job', jobId] as const,
  detail: (orgId: string, quoteId: string) =>
    ['org', orgId, 'quotes', 'detail', quoteId] as const,
  lines: (orgId: string, quoteId: string) =>
    ['org', orgId, 'quotes', 'lines', quoteId] as const,
  approvals: (orgId: string, jobId: string) =>
    ['org', orgId, 'quotes', 'approvals', jobId] as const,
}

export const catalogKeys = {
  all: (orgId: string) => ['org', orgId, 'catalog'] as const,
  list: (orgId: string, search: string) =>
    ['org', orgId, 'catalog', 'list', search] as const,
}

/**
 * Portal keys are scoped by CLIENT, not by org.
 *
 * A contact can be a contact for two clients inside one org, and those two
 * views must not share a cache entry -- which an org-only scope would let
 * them do.
 */
export const portalKeys = {
  all: (clientId: string) => ['portal', clientId] as const,
  jobs: (clientId: string) => ['portal', clientId, 'jobs'] as const,
  job: (clientId: string, jobId: string) =>
    ['portal', clientId, 'jobs', jobId] as const,
  quote: (clientId: string, jobId: string) =>
    ['portal', clientId, 'quote', jobId] as const,
  sites: (clientId: string) => ['portal', clientId, 'sites'] as const,
}

/**
 * The one deliberately un-scoped key: the legal state machine is global
 * reference data, identical for every tenant, and world-readable to signed-in
 * users by policy. Scoping it per org would fetch the same 34 rows per org.
 */
export const referenceKeys = {
  jobStatusTransitions: () => ['reference', 'job-status-transitions'] as const,
}
