import { QueryClient } from '@tanstack/react-query'

/**
 * Factory, not a singleton: Storybook decorators and Vitest tests each need a
 * fresh client, and a module-level instance leaks cache between them.
 */
export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        retry: 2,
        refetchOnWindowFocus: false,
      },
      mutations: { retry: 0 },
    },
  })
}
