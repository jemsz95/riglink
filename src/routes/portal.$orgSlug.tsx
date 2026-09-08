import { createFileRoute, notFound, redirect } from '@tanstack/react-router'
import { AppNotFound } from '@/components/app/app-not-found'
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

    return { orgName: entries[0].org_name, clients: entries }
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
  const { orgName, clients } = Route.useRouteContext()

  return (
    <div className="bg-background min-h-dvh">
      <header className="border-border bg-card border-b">
        <div className="mx-auto flex max-w-3xl items-center gap-3 p-4">
          <div className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-md text-sm font-semibold">
            {orgName.slice(0, 1).toUpperCase()}
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-medium">{orgName}</span>
            <span className="text-muted-foreground text-2xs">
              Client portal
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
        <h1 className="text-xl font-semibold tracking-tight">Your jobs</h1>
        <p className="text-muted-foreground text-sm">
          You are a contact for{' '}
          {clients.map((entry) => entry.client_name).join(', ')}. Requesting
          work and approving quotes arrive in phase 3.
        </p>
      </main>
    </div>
  )
}
