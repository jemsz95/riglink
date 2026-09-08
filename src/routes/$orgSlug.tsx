import {
  Outlet,
  createFileRoute,
  notFound,
  redirect,
} from '@tanstack/react-router'
import { AppNotFound } from '@/components/app/app-not-found'
import { authStore } from '@/lib/auth/session-store'
import { membershipsQuery } from '@/features/orgs/queries'
import type { OrgMembership } from '@/features/orgs/queries'

/**
 * Org-scoped guard. The org lives in the URL rather than the session so deep
 * links survive org switching, two orgs can be open in two tabs, and the
 * portal can resolve branding from the slug before a session exists.
 *
 * This guard is UX only -- RLS is the security boundary. It exists so users
 * see a sensible page instead of an empty one.
 */
export const Route = createFileRoute('/$orgSlug')({
  beforeLoad: async ({ context, params, location }) => {
    const auth = authStore.getSnapshot()
    if (!auth.userId) {
      throw redirect({ to: '/login', search: { next: location.href } })
    }

    const memberships =
      await context.queryClient.ensureQueryData(membershipsQuery())
    const org = memberships.orgs.find(
      (candidate) => candidate.slug === params.orgSlug,
    )
    if (!org) throw notFound()

    // Merged into every child route's context.
    return { org, role: org.role satisfies OrgMembership['role'] }
  },
  notFoundComponent: () => (
    <AppNotFound
      title="Workspace not found"
      body="You may not have access to this workspace, or it may have been renamed."
    />
  ),
  component: () => <Outlet />,
})
