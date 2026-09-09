import { Outlet, createFileRoute } from '@tanstack/react-router'
import { AppError } from '@/components/app/app-error'
import { AppShell } from '@/components/app/app-shell'
import { CommandPalette } from '@/components/app/command-palette'
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
  const { org, role } = OrgRoute.useRouteContext()
  // Mounted at the layout, not per page: one socket for the whole staff
  // session, and it survives navigation between jobs, clients and sites.
  useOrgChannel(org.id)

  return (
    <AppShell>
      {/* Also mounted at the layout: one keydown listener for the whole
          session, and the palette keeps working while a page is erroring. */}
      <CommandPalette orgId={org.id} role={role} />
      <Outlet />
    </AppShell>
  )
}
