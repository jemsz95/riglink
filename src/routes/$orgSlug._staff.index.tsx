import { Link, createFileRoute } from '@tanstack/react-router'
import { Briefcase, Building2, MapPin } from 'lucide-react'
import { Route as OrgRoute } from './$orgSlug'

export const Route = createFileRoute('/$orgSlug/_staff/')({
  component: DashboardPage,
})

function DashboardPage() {
  const { org, role } = OrgRoute.useRouteContext()
  const { orgSlug } = Route.useParams()

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <p className="text-muted-foreground text-2xs font-mono tracking-widest uppercase">
          Dashboard
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">{org.name}</h1>
        <p className="text-muted-foreground text-sm">
          Signed in as <span className="font-medium">{role}</span>.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <QuickLink
          to="/$orgSlug/jobs"
          orgSlug={orgSlug}
          icon={Briefcase}
          title="Jobs"
          body="Everything in flight, across every site."
        />
        <QuickLink
          to="/$orgSlug/clients"
          orgSlug={orgSlug}
          icon={Building2}
          title="Clients"
          body="The companies you invoice, and their contacts."
        />
        <QuickLink
          to="/$orgSlug/sites"
          orgSlug={orgSlug}
          icon={MapPin}
          title="Sites"
          body="Every location you service."
        />
      </div>

      <div className="border-border bg-card rounded-lg border p-6 shadow-e1">
        <h2 className="text-sm font-medium">At-a-glance view coming next</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          KPI tiles, the jobs-in-flight board and per-site rollups land once
          quotes and invoices exist to summarise — a dashboard with no money
          flowing through it would only show what the jobs list already does.
        </p>
      </div>
    </div>
  )
}

function QuickLink({
  to,
  orgSlug,
  icon: Icon,
  title,
  body,
}: {
  to: '/$orgSlug/jobs' | '/$orgSlug/clients' | '/$orgSlug/sites'
  orgSlug: string
  icon: typeof Briefcase
  title: string
  body: string
}) {
  return (
    <Link
      to={to}
      params={{ orgSlug }}
      className="border-border bg-card focus-visible:ring-ring/50 flex flex-col gap-1 rounded-lg border p-4 shadow-e1 transition-colors hover:border-primary/40 focus-visible:ring-[3px] focus-visible:outline-none"
    >
      <Icon className="text-muted-foreground size-5" aria-hidden />
      <h2 className="mt-1 font-medium">{title}</h2>
      <p className="text-muted-foreground text-sm">{body}</p>
    </Link>
  )
}
