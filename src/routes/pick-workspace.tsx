import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { Building2, LifeBuoy, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { authStore } from '@/lib/auth/session-store'
import { membershipsQuery } from '@/features/orgs/queries'

export const Route = createFileRoute('/pick-workspace')({
  beforeLoad: () => {
    if (!authStore.getSnapshot().userId) {
      throw redirect({ to: '/login', search: { next: '/pick-workspace' } })
    }
  },
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(membershipsQuery()),
  component: PickWorkspacePage,
})

function PickWorkspacePage() {
  const { data } = useSuspenseQuery(membershipsQuery())
  const navigate = useNavigate()

  // A platform operator ALWAYS gets the picker, even with one workspace.
  // Otherwise the sole-destination redirect below fires on every visit to `/`
  // and there is no route left from which to reach /platform.
  const soleDestination = data.is_platform_admin
    ? null
    : data.orgs.length === 1 && data.portal_clients.length === 0
      ? { kind: 'staff' as const, slug: data.orgs[0].slug }
      : data.orgs.length === 0 && data.portal_clients.length === 1
        ? { kind: 'portal' as const, slug: data.portal_clients[0].org_slug }
        : null

  // One place to be: go there. Choosing from a list of one is not a choice.
  if (soleDestination) {
    void navigate(
      soleDestination.kind === 'staff'
        ? {
            to: '/$orgSlug',
            params: { orgSlug: soleDestination.slug },
            replace: true,
          }
        : {
            to: '/portal/$orgSlug',
            params: { orgSlug: soleDestination.slug },
            replace: true,
          },
    )
    return null
  }

  if (
    data.orgs.length === 0 &&
    data.portal_clients.length === 0 &&
    data.is_platform_admin
  ) {
    return (
      <div className="bg-background flex min-h-dvh items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Platform administration</CardTitle>
            <CardDescription>
              You operate this deployment. You have no workspace of your own,
              which is normal -- and you cannot see inside anyone else's.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              className="min-h-touch w-full"
              onClick={() => void navigate({ to: '/platform' })}
            >
              Open platform administration
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (data.orgs.length === 0 && data.portal_clients.length === 0) {
    return (
      <div className="bg-background flex min-h-dvh items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>No workspaces yet</CardTitle>
            <CardDescription>
              You are signed in, but nobody has invited you to a workspace and
              you have not created one.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              className="min-h-touch w-full"
              onClick={() => void navigate({ to: '/onboarding' })}
            >
              Create a workspace
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="bg-background flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <h1 className="mb-1 text-xl font-semibold tracking-tight">
          Choose a workspace
        </h1>
        <p className="text-muted-foreground mb-6 text-sm">
          You have access to more than one place.
        </p>

        {data.orgs.length > 0 && (
          <section className="mb-6">
            <h2 className="text-muted-foreground mb-2 text-2xs font-medium uppercase tracking-wider">
              Your company
            </h2>
            <ul className="flex flex-col gap-2">
              {data.orgs.map((org) => (
                <li key={org.id}>
                  <button
                    type="button"
                    onClick={() =>
                      void navigate({
                        to: '/$orgSlug',
                        params: { orgSlug: org.slug },
                      })
                    }
                    className="border-border bg-card hover:bg-accent/10 min-h-touch flex w-full items-center gap-3 rounded-lg border p-3 text-left shadow-e1 transition-colors"
                  >
                    <Building2
                      className="text-muted-foreground size-4 shrink-0"
                      aria-hidden
                    />
                    <span className="flex-1 text-sm font-medium">
                      {org.name}
                    </span>
                    {org.suspended && (
                      <Badge variant="destructive">Suspended</Badge>
                    )}
                    <Badge variant="secondary">{org.role}</Badge>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {data.is_platform_admin && (
          <section className="mb-6">
            <h2 className="text-muted-foreground mb-2 text-2xs font-medium uppercase tracking-wider">
              Platform
            </h2>
            <button
              type="button"
              onClick={() => void navigate({ to: '/platform' })}
              className="border-border bg-card hover:bg-accent/10 min-h-touch flex w-full items-center gap-3 rounded-lg border p-3 text-left shadow-e1 transition-colors"
            >
              <ShieldCheck
                className="text-muted-foreground size-4 shrink-0"
                aria-hidden
              />
              <span className="flex-1 text-sm font-medium">
                Platform administration
              </span>
            </button>
          </section>
        )}

        {data.portal_clients.length > 0 && (
          <section>
            <h2 className="text-muted-foreground mb-2 text-2xs font-medium uppercase tracking-wider">
              Where you are a client
            </h2>
            <ul className="flex flex-col gap-2">
              {data.portal_clients.map((entry) => (
                <li key={entry.client_id}>
                  <button
                    type="button"
                    onClick={() =>
                      void navigate({
                        to: '/portal/$orgSlug',
                        params: { orgSlug: entry.org_slug },
                      })
                    }
                    className="border-border bg-card hover:bg-accent/10 min-h-touch flex w-full items-center gap-3 rounded-lg border p-3 text-left shadow-e1 transition-colors"
                  >
                    <LifeBuoy
                      className="text-muted-foreground size-4 shrink-0"
                      aria-hidden
                    />
                    <span className="flex-1 text-sm font-medium">
                      {entry.org_name}
                    </span>
                    <span className="text-muted-foreground text-2xs">
                      {entry.client_name}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  )
}
