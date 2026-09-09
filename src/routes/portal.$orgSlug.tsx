import {
  Link,
  Outlet,
  createFileRoute,
  notFound,
  redirect,
} from '@tanstack/react-router'
import { AppNotFound } from '@/components/app/app-not-found'
import { AppSuspended } from '@/components/app/app-suspended'
import { SkipLink } from '@/components/app/skip-link'
import { UserMenu } from '@/components/app/user-menu'
import { authStore } from '@/lib/auth/session-store'
import { membershipsQuery } from '@/features/orgs/queries'

/**
 * Client portal shell. A separate route surface rather than a separate build:
 * different audience and IA, but the same tokens, auth and Supabase client.
 */
export const Route = createFileRoute('/portal/$orgSlug')({
  beforeLoad: async ({ context, params, location }) => {
    const auth = authStore.getSnapshot()
    if (!auth.userId) {
      throw redirect({ to: '/login', search: { next: location.href } })
    }

    const memberships =
      await context.queryClient.ensureQueryData(membershipsQuery())
    const entries = memberships.portal_clients.filter(
      (entry) => entry.org_slug === params.orgSlug,
    )
    if (entries.length === 0) throw notFound()

    return {
      orgName: entries[0].org_name,
      clients: entries,
      suspended: entries[0].org_suspended,
    }
  },
  notFoundComponent: () => (
    <AppNotFound
      title="Portal not found"
      body="You are not registered as a contact for this company."
    />
  ),
  component: PortalPage,
})

function PortalPage() {
  const { orgName, clients, suspended } = Route.useRouteContext()
  const { orgSlug } = Route.useParams()

  return (
    <div className="bg-background flex min-h-dvh flex-col">
      <SkipLink />
      <header className="border-border bg-card border-b print:hidden">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 p-4">
          <Link
            to="/portal/$orgSlug"
            params={{ orgSlug }}
            className="flex items-center gap-3"
          >
            <div className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-md text-sm font-semibold">
              {orgName.slice(0, 1).toUpperCase()}
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-medium">{orgName}</span>
              <span className="text-muted-foreground text-2xs">
                {clients.length === 1
                  ? clients[0].client_name
                  : `${clients.length} accounts`}
              </span>
            </div>
          </Link>
          <UserMenu />
        </div>
      </header>

      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto w-full max-w-4xl flex-1 p-4 focus-visible:outline-none"
      >
        {suspended ? (
          <AppSuspended orgName={orgName} audience="portal" />
        ) : (
          <Outlet />
        )}
      </main>
    </div>
  )
}
