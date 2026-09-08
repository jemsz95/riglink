import type { PostgrestError } from '@supabase/supabase-js'

/**
 * Raised by app.claims_fresh() when the caller's access token was minted
 * before a membership change. The DB deliberately RAISES rather than returning
 * zero rows: a silently-empty result after a role change is indistinguishable
 * from data loss, and users report it as one.
 */
export const STALE_CLAIMS_CODE = 'P0001'
export const STALE_CLAIMS_HINT = 'refresh_session'

export function isPostgrestError(error: unknown): error is PostgrestError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'message' in error
  )
}

/** True when the fix is to refresh the session and retry exactly once. */
export function isStaleClaimsError(error: unknown): boolean {
  if (!isPostgrestError(error)) return false
  return (
    error.code === STALE_CLAIMS_CODE &&
    (error.hint === STALE_CLAIMS_HINT ||
      error.message.includes('stale authorization claims'))
  )
}

/** Authorization refused by a SECURITY DEFINER RPC's own guard. */
export function isForbiddenError(error: unknown): boolean {
  return isPostgrestError(error) && error.code === '42501'
}

/** A status transition the state machine does not allow, or a failed CHECK. */
export function isCheckViolation(error: unknown): boolean {
  return isPostgrestError(error) && error.code === '23514'
}

export function isUniqueViolation(error: unknown): boolean {
  return isPostgrestError(error) && error.code === '23505'
}

/** Message suitable for a toast. Never leaks SQL detail to a client user. */
export function toUserMessage(error: unknown): string {
  if (isForbiddenError(error)) return 'You do not have permission to do that.'
  if (isCheckViolation(error)) return 'That change is not allowed right now.'
  if (isUniqueViolation(error)) return 'That already exists.'
  if (isStaleClaimsError(error)) return 'Your access changed. Reloading…'
  if (isPostgrestError(error)) return error.message
  if (error instanceof Error) return error.message
  return 'Something went wrong.'
}
