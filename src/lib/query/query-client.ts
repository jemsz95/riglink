import { QueryClient } from '@tanstack/react-query'
import { isStaleClaimsError } from '@/lib/supabase/errors'
import { refreshSessionForStaleClaims } from '@/lib/auth/refresh-on-stale-claims'

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
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          // A stale-claims failure is recoverable exactly once: refresh the
          // token and let Query re-run. More than once risks a refresh loop,
          // and the second failure is a real authorization answer.
          if (isStaleClaimsError(error)) {
            if (failureCount >= 1) return false
            void refreshSessionForStaleClaims()
            return true
          }
          return failureCount < 2
        },
      },
      mutations: { retry: 0 },
    },
  })
}
