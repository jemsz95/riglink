import { Outlet, createFileRoute } from '@tanstack/react-router'
import { AppError } from '@/components/app/app-error'
import { AppShell } from '@/components/app/app-shell'
import { useOrgChannel } from '@/lib/realtime/use-org-channel'
import { Route as OrgRoute } from './$orgSlug'

export const Route = createFileRoute('/$orgSlug/_staff')({
  // Keeps the sidebar mounted on failure so the user can navigate away.
  errorComponent: ({ error, reset }) => (
    <AppShell>
      <AppError error={error} reset={reset} />
    </AppShell>
  ),
  component: StaffLayout,
})

function StaffLayout() {
  const { org } = OrgRoute.useRouteContext()
  // Mounted at the layout, not per page: one socket for the whole staff
  // session, and it survives navigation between jobs, clients and sites.
  useOrgChannel(org.id)

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  )
}
