import { useEffect, useRef } from 'react'
import { EXPECTED_CLAIMS_VERSION, useAuth } from './session-store'
import { refreshSessionForStaleClaims } from './refresh-on-stale-claims'

/**
 * Refreshes a session whose token predates a claim-shape change.
 *
 * The state it handles occurs in correct operation: shipping a new claim shape
 * while sessions are live. The deploy bumps every epoch, so those sessions
 * would hit P0001 on their next query anyway; refreshing on sight is just less
 * jarring than a failed request that then self-heals.
 *
 * A token with no claims at all is out of scope -- that is a half-deployed
 * instance, not a session state, and it is fixed at the deployment boundary.
 */
export function useClaimsVersionSync(): void {
  const auth = useAuth()
  const refreshed = useRef(false)

  useEffect(() => {
    if (auth.claimsVersion === null) return
    if (auth.claimsVersion >= EXPECTED_CLAIMS_VERSION) return
    if (refreshed.current) return

    refreshed.current = true
    void refreshSessionForStaleClaims()
  }, [auth.claimsVersion])
}
