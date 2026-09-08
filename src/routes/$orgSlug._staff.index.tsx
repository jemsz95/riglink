import { createFileRoute } from '@tanstack/react-router'
import { Route as OrgRoute } from './$orgSlug'

export const Route = createFileRoute('/$orgSlug/_staff/')({
  component: DashboardPage,
})

function DashboardPage() {
  const { org, role } = OrgRoute.useRouteContext()

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <p className="text-muted-foreground text-2xs font-mono tracking-widest uppercase">
          Dashboard
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">{org.name}</h1>
        <p className="text-muted-foreground text-sm">
          Signed in as <span className="font-medium">{role}</span>. Jobs, quotes
          and the at-a-glance view arrive in the next phases.
        </p>
      </header>

      <div className="border-border bg-card rounded-lg border p-6 shadow-e1">
        <h2 className="text-sm font-medium">Nothing to show yet</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Clients, sites and jobs land in phase 2.
        </p>
      </div>
    </div>
  )
}
