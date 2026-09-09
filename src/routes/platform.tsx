import {
  Link,
  Outlet,
  createFileRoute,
  notFound,
  redirect,
} from '@tanstack/react-router'
import { AppError } from '@/components/app/app-error'
import { AppNotFound } from '@/components/app/app-not-found'
import { SkipLink } from '@/components/app/skip-link'
import { UserMenu } from '@/components/app/user-menu'
import { authStore } from '@/lib/auth/session-store'
import { membershipsQuery } from '@/features/orgs/queries'

/**
 * Platform administration.
 *
 * `platform` is a RESERVED SLUG (organizations_slug_not_reserved). It has to
 * be: TanStack ranks a static segment above `/$orgSlug`, so an org that called
 * itself `platform` would become permanently unreachable with no error to
 * explain why.
 *
 * The guard below is UX only. The boundary is `app.require_platform_admin()`
 * inside every RPC -- there is no claim to forge and no policy to slip past, so
 * a user who edits this check away reaches a page on which every request
 * raises 42501.
 */
export const Route = createFileRoute('/platform')({
  beforeLoad: async ({ context, location }) => {
    const auth = authStore.getSnapshot()
    if (!auth.userId) {
      throw redirect({ to: '/login', search: { next: location.href } })
    }
    const memberships =
      await context.queryClient.ensureQueryData(membershipsQuery())
    // notFound(), not a redirect: this does not confirm to someone probing
    // that /platform is a page that exists.
    if (!memberships.is_platform_admin) throw notFound()
    return { isPlatformAdmin: true as const }
  },
  notFoundComponent: () => (
    <AppNotFound
      title="Page not found"
      body="That link may be broken, or the page may have moved."
    />
  ),
  errorComponent: ({ error, reset }) => (
    <AppError error={error} reset={reset} />
  ),
  component: PlatformLayout,
})

const TABS = [
  { to: '/platform', label: 'Organisations', exact: true },
  { to: '/platform/invitations', label: 'Invitations', exact: false },
  { to: '/platform/audit', label: 'Audit log', exact: false },
] as const

function PlatformLayout() {
  return (
    <div className="bg-background flex min-h-dvh flex-col">
      <SkipLink />
      <header className="border-border bg-card border-b">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 p-4">
          <div className="flex flex-col">
            <span className="text-sm font-medium">Platform administration</span>
            <span className="text-muted-foreground text-2xs">
              Organisations and their administrators. Not their data.
            </span>
          </div>
          <UserMenu />
        </div>
        <nav className="mx-auto flex max-w-4xl gap-1 px-4">
          {TABS.map((tab) => (
            <Link
              key={tab.to}
              to={tab.to}
              activeOptions={{ exact: tab.exact }}
              activeProps={{
                className: 'border-primary text-foreground',
              }}
              inactiveProps={{
                className: 'border-transparent text-muted-foreground',
              }}
              className="min-h-touch inline-flex items-center border-b-2 px-3 text-sm font-medium transition-colors"
            >
              {tab.label}
            </Link>
          ))}
        </nav>
      </header>

      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto w-full max-w-4xl flex-1 p-4 focus-visible:outline-none"
      >
        <Outlet />
      </main>
    </div>
  )
}
