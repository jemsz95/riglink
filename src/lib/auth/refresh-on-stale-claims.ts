import { supabase } from '@/lib/supabase/client'
import { authStore } from './session-store'
import { isStaleClaimsError } from '@/lib/supabase/errors'

/**
 * Recovers from the one error the claim-epoch design produces by construction.
 *
 * The DB raises P0001 when the caller's token predates a membership change.
 * The fix is always the same: mint a new token and retry ONCE. Retrying more
 * than once risks a refresh loop, which is worse than surfacing the error.
 */
export async function refreshSessionForStaleClaims(): Promise<boolean> {
  const { data, error } = await supabase.auth.refreshSession()
  if (error || !data.session) return false
  authStore.setSession(data.session)
  return true
}

/**
 * Wrap any Supabase call so a stale-claims failure self-heals.
 *
 * Used by the Query client's global `retry` predicate and by mutations. Note
 * that a token refresh re-runs the access-token hook, so the retried call sees
 * the CURRENT permissions -- which may legitimately be narrower than before.
 * A second failure is therefore a real authorization result, not a glitch.
 */
export async function withStaleClaimsRetry<T>(
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await run()
  } catch (error) {
    if (!isStaleClaimsError(error)) throw error
    const refreshed = await refreshSessionForStaleClaims()
    if (!refreshed) throw error
    return run()
  }
}
