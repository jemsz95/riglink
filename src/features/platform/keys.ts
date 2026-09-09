/**
 * Query keys for platform administration.
 *
 * These are the one place in this codebase that is deliberately NOT org-scoped
 * from the first segment. The project rule exists so a cache entry from tenant
 * A can never be served after switching to tenant B -- cross-tenant bleed looks
 * exactly like an RLS breach to the customer looking at the screen.
 *
 * Nothing here is tenant data. `platform_list_orgs()` is a list OF tenants,
 * read by an operator who is a member of none of them, so there is no tenant to
 * scope it to. Namespacing under a literal 'platform' keeps it disjoint from
 * every ['org', orgId, ...] key, which is what actually matters: the two sets
 * can never collide, so invalidating one never touches the other.
 */
export const platformKeys = {
  orgs: () => ['platform', 'orgs'] as const,
  orgAdmins: (orgId: string) => ['platform', 'org', orgId, 'admins'] as const,
  invitations: () => ['platform', 'invitations'] as const,
  audit: () => ['platform', 'audit'] as const,
}
