import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { Building2, Search } from 'lucide-react'
import { Route as OrgRoute } from './$orgSlug'
import { EmptyState } from '@/components/app/empty-state'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { NewClientDialog } from '@/features/clients/new-client-dialog'
import { clientListQuery } from '@/features/clients/queries'
import { canDispatch } from '@/features/orgs/permissions'
import { orDash } from '@/lib/format'
import { useDebouncedValue } from '@/hooks/use-debounced-value'

export const Route = createFileRoute('/$orgSlug/_staff/clients/')({
  component: ClientsPage,
})

function ClientsPage() {
  const { org, role } = OrgRoute.useRouteContext()
  const { orgSlug } = Route.useParams()
  const [term, setTerm] = useState('')
  // Not in the URL: this list is short and the search is a scratch action, not
  // a view worth sharing. The jobs list is the opposite and uses search params.
  const search = useDebouncedValue(term, 250)
  const clients = useQuery(clientListQuery(org.id, search))

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Clients</h1>
          <p className="text-muted-foreground text-sm">
            The companies you work for, and the sites they own.
          </p>
        </div>
        {canDispatch(role) ? <NewClientDialog orgId={org.id} /> : null}
      </header>

      <div className="relative max-w-sm">
        <Search
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
          aria-hidden
        />
        <Input
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="Search clients"
          aria-label="Search clients"
          className="pl-8"
        />
      </div>

      {clients.isPending ? (
        <div role="status" aria-live="polite">
          <span className="sr-only">Loading clients…</span>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-hidden>
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-28" />
            ))}
          </div>
        </div>
      ) : clients.data?.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={search ? 'No clients match that search' : 'No clients yet'}
          action={
            !search && canDispatch(role) ? (
              <NewClientDialog orgId={org.id} />
            ) : undefined
          }
          body={
            search
              ? 'Try a shorter search term.'
              : canDispatch(role)
                ? 'Add the first client, then its sites. A job always belongs to a client.'
                : 'Ask an owner or admin to add a client. A job always belongs to one.'
          }
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {clients.data?.map((client) => (
            <li key={client.id}>
              <Link
                to="/$orgSlug/clients/$clientId"
                params={{ orgSlug, clientId: client.id }}
                className="border-border bg-card focus-visible:ring-ring/50 flex h-full flex-col gap-2 rounded-lg border p-4 shadow-e1 focus-visible:ring-[3px] focus-visible:outline-none"
              >
                <h2 className="truncate font-medium">{client.name}</h2>
                <p className="text-muted-foreground truncate text-sm">
                  {orDash(client.billing_email)}
                </p>
                <p className="text-muted-foreground mt-auto text-xs">
                  {client.site_count} sites · {client.job_count} jobs
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
