import { Outlet, createRootRouteWithContext } from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'
import { AppNotFound } from '@/components/app/app-not-found'
import { AppError } from '@/components/app/app-error'
import { useClaimsVersionSync } from '@/lib/auth/use-claims-version-sync'
import type { RouterContext } from '@/router'
import '../styles.css'

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootComponent,
  notFoundComponent: () => <AppNotFound />,
  // Catastrophic failures render without app chrome, since the chrome itself
  // may be what failed.
  errorComponent: ({ error, reset }) => (
    <AppError error={error} reset={reset} />
  ),
})

function RootComponent() {
  useClaimsVersionSync()

  return (
    <>
      <Outlet />
      <TanStackDevtools
        config={{ position: 'bottom-right' }}
        plugins={[
          { name: 'TanStack Router', render: <TanStackRouterDevtoolsPanel /> },
        ]}
      />
    </>
  )
}
