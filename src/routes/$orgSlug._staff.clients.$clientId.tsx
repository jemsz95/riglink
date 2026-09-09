import { useQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { ArrowLeft, Mail, MapPin, Phone } from 'lucide-react'
import { Route as OrgRoute } from './$orgSlug'
import { AppError } from '@/components/app/app-error'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { clientDetailQuery } from '@/features/clients/queries'
import { canDispatch } from '@/features/orgs/permissions'
import { NewSiteDialog } from '@/features/sites/new-site-dialog'
import { formatAddressLine, orDash } from '@/lib/format'

export const Route = createFileRoute('/$orgSlug/_staff/clients/$clientId')({
  component: ClientDetailPage,
})

function ClientDetailPage() {
  const { org, role } = OrgRoute.useRouteContext()
  const { orgSlug, clientId } = Route.useParams()
  const client = useQuery(clientDetailQuery(org.id, clientId))

  if (client.isPending) {
    return (
      <div role="status" aria-live="polite">
        <span className="sr-only">Loading client…</span>
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if (client.isError) {
    return (
      <AppError
        error={client.error}
        reset={() => {
          void client.refetch()
        }}
      />
    )
  }

  const data = client.data
  const contacts = data.client_contacts
  const sites = data.sites.filter((site) => site.archived_at === null)

  return (
    <div className="flex flex-col gap-4">
      <Button asChild variant="ghost" size="sm" className="self-start">
        <Link to="/$orgSlug/clients" params={{ orgSlug }}>
          <ArrowLeft className="size-4" aria-hidden />
          Clients
        </Link>
      </Button>

      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{data.name}</h1>
          <p className="text-muted-foreground text-sm">
            {orDash(data.billing_email)}
          </p>
        </div>
        <Button asChild variant="outline">
          <Link
            to="/$orgSlug/jobs"
            params={{ orgSlug }}
            search={{ client: data.id }}
          >
            View jobs
          </Link>
        </Button>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-sm">Sites</CardTitle>
            {canDispatch(role) ? (
              <NewSiteDialog
                orgId={org.id}
                clientId={data.id}
                clientName={data.name}
              />
            ) : null}
          </CardHeader>
          <CardContent>
            {sites.length === 0 ? (
              <p className="text-muted-foreground text-sm">No sites yet.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {sites.map((site) => (
                  <li key={site.id} className="flex gap-2">
                    <MapPin
                      className="text-muted-foreground mt-0.5 size-4 shrink-0"
                      aria-hidden
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {site.name}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {formatAddressLine(site.address)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Portal contacts</CardTitle>
          </CardHeader>
          <CardContent>
            {contacts.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No contacts invited yet. Only invited contacts can see this
                client&rsquo;s jobs in the portal.
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {contacts.map((contact) => (
                  <li key={contact.id} className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium">
                        {orDash(contact.full_name)}
                      </p>
                      <Badge variant="outline">{contact.role}</Badge>
                      {contact.revoked_at ? (
                        <Badge variant="destructive">Revoked</Badge>
                      ) : contact.accepted_at ? null : (
                        <Badge variant="secondary">Invited</Badge>
                      )}
                    </div>
                    <p className="text-muted-foreground flex items-center gap-1 text-xs">
                      <Mail className="size-3" aria-hidden />
                      {contact.email}
                    </p>
                    {contact.phone ? (
                      <p className="text-muted-foreground flex items-center gap-1 text-xs">
                        <Phone className="size-3" aria-hidden />
                        {contact.phone}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
