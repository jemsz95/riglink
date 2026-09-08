import { createRouter } from '@tanstack/react-router'
import { AppNotFound } from '@/components/app/app-not-found'
import { AppPending } from '@/components/app/app-pending'
import { createQueryClient } from '@/lib/query/query-client'
import { routeTree } from './routeTree.gen'
import type { QueryClient } from '@tanstack/react-query'

export interface RouterContext {
  queryClient: QueryClient
}

/**
 * Single source of truth for router construction. Storybook decorators and
 * tests build their own instance, so this must stay a factory.
 */
export function createAppRouter(opts?: { queryClient?: QueryClient }) {
  const queryClient = opts?.queryClient ?? createQueryClient()

  return createRouter({
    routeTree,
    context: { queryClient } satisfies RouterContext,
    defaultPreload: 'intent',
    // Let TanStack Query own staleness. The router's own 30s preload cache
    // otherwise serves stale data straight past a mutation's invalidation --
    // the most common Router+Query bug.
    defaultPreloadStaleTime: 0,
    defaultPendingComponent: AppPending,
    // Wrapped: NotFoundRouteProps and AppNotFound's optional props are
    // structurally incompatible, and AppNotFound's defaults are what we want.
    defaultNotFoundComponent: () => <AppNotFound />,
    defaultPendingMs: 200,
    defaultPendingMinMs: 400,
    scrollRestoration: true,
  })
}

// Exactly ONE Register augmentation may exist in the project. The scaffold had
// two (here and in main.tsx), which silently degrades route type inference.
declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>
  }
}
