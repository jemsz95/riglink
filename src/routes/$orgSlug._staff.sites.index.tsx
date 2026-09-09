import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { MapPin, Search } from 'lucide-react'
import { Route as OrgRoute } from './$orgSlug'
import { EmptyState } from '@/components/app/empty-state'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { siteListQuery } from '@/features/sites/queries'
import { formatAddressLine, orDash } from '@/lib/format'
import { useDebouncedValue } from '@/hooks/use-debounced-value'

export const Route = createFileRoute('/$orgSlug/_staff/sites/')({
  component: SitesPage,
})

function SitesPage() {
  const { org } = OrgRoute.useRouteContext()
  const { orgSlug } = Route.useParams()
  const [term, setTerm] = useState('')
  const search = useDebouncedValue(term, 250)
  const sites = useQuery(siteListQuery(org.id, search))

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Sites</h1>
        <p className="text-muted-foreground text-sm">
          Every location you service, across all clients.
        </p>
      </header>

      <div className="relative max-w-sm">
        <Search
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
          aria-hidden
        />
        <Input
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="Search sites"
          aria-label="Search sites"
          className="pl-8"
        />
      </div>

      {sites.isPending ? (
        <div role="status" aria-live="polite">
          <span className="sr-only">Loading sites…</span>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-hidden>
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-32" />
            ))}
          </div>
        </div>
      ) : sites.data?.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title={search ? 'No sites match that search' : 'No sites yet'}
          body={
            search
              ? 'Try a shorter search term.'
              : 'Sites belong to a client. Open a client to add its locations.'
          }
          action={
            search ? undefined : (
              <Button asChild variant="outline">
                <Link to="/$orgSlug/clients" params={{ orgSlug }}>
                  Go to clients
                </Link>
              </Button>
            )
          }
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sites.data?.map((site) => (
            <li
              key={site.id}
              className="border-border bg-card flex flex-col gap-1 rounded-lg border p-4 shadow-e1"
            >
              <h2 className="truncate font-medium">{site.name}</h2>
              <Link
                to="/$orgSlug/clients/$clientId"
                params={{ orgSlug, clientId: site.client_id }}
                className="text-muted-foreground hover:text-primary truncate text-sm underline-offset-4 hover:underline"
              >
                {orDash(site.client_name)}
              </Link>
              <p className="text-muted-foreground text-xs">
                {formatAddressLine(site.address)}
              </p>
              {site.site_contact_name ? (
                <p className="text-muted-foreground text-xs">
                  Contact: {orDash(site.site_contact_name)}
                </p>
              ) : null}
              <p className="text-muted-foreground mt-auto pt-2 text-xs">
                {site.job_count} jobs
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
