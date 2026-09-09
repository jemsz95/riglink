/**
 * Query keys for evidence. Org-scoped from the first meaningful segment, like
 * every other domain here, so switching org is one invalidation and
 * cross-tenant cache bleed is structurally impossible.
 */
export const evidenceKeys = {
  all: (orgId: string) => ['evidence', orgId] as const,
  forJob: (orgId: string, jobId: string) =>
    ['evidence', orgId, 'job', jobId] as const,
  signedUrl: (orgId: string, storagePath: string) =>
    ['evidence', orgId, 'signed', storagePath] as const,
}

export const portalEvidenceKeys = {
  forJob: (clientId: string, jobId: string) =>
    ['portal', clientId, 'evidence', jobId] as const,
  signedUrl: (clientId: string, storagePath: string) =>
    ['portal', clientId, 'signed', storagePath] as const,
}
