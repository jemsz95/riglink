import { Outlet, createFileRoute } from '@tanstack/react-router'
import { AppError } from '@/components/app/app-error'
import { AppShell } from '@/components/app/app-shell'

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
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  )
}
