import { useSyncExternalStore } from 'react'
import { supabase } from '@/lib/supabase/client'
import type { Session } from '@supabase/supabase-js'

/**
 * Claim shape this build expects, matching app_metadata.claims_version from
 * the access-token hook. Bump together with the hook migration, which must
 * also bump every user's epoch so live sessions refresh into the new shape.
 */
export const EXPECTED_CLAIMS_VERSION = 1

export interface AuthSnapshot {
  /** null = signed out. Never undefined once hydrated. */
  userId: string | null
  email: string | null
  /** Org id -> role, straight from the access token's app_metadata. */
  orgRoles: Record<string, string>
  /** Client ids this user is an active portal contact for. */
  portalClientIds: Array<string>
  /** True when the token exceeded the claim size bounds and RLS falls back to lookups. */
  overflow: boolean
  epoch: number
  /** app_metadata.claims_version from the token; null if absent. */
  claimsVersion: number | null
  hydrated: boolean
}

const SIGNED_OUT: AuthSnapshot = {
  userId: null,
  email: null,
  orgRoles: {},
  portalClientIds: [],
  overflow: false,
  epoch: 0,
  claimsVersion: null,
  hydrated: true,
}

interface AppMetadata {
  claims_version?: number
  orgs?: Record<string, string>
  clients?: Array<string>
  overflow?: boolean
  epoch?: number
}

/**
 * Decode the claims the DB will see. This is a CONVENIENCE for UI decisions
 * (which nav to show, whether to offer a button) -- it is never a security
 * boundary. RLS re-derives all of this from the token server-side, so a user
 * tampering with local state gains nothing.
 */
function snapshotFromSession(session: Session | null): AuthSnapshot {
  if (!session?.user) return SIGNED_OUT

  // app_metadata is typed non-nullable by supabase-js, and the hook always
  // writes it, so no fallback is needed -- just the narrowing cast.
  const meta = session.user.app_metadata as AppMetadata

  return {
    userId: session.user.id,
    email: session.user.email ?? null,
    orgRoles: meta.orgs ?? {},
    portalClientIds: meta.clients ?? [],
    overflow: meta.overflow ?? false,
    epoch: meta.epoch ?? 0,
    claimsVersion: meta.claims_version ?? null,
    hydrated: true,
  }
}

let snapshot: AuthSnapshot = { ...SIGNED_OUT, hydrated: false }
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

function setSnapshot(next: AuthSnapshot) {
  snapshot = next
  emit()
}

export const authStore = {
  /**
   * Synchronous read. This is what makes route `beforeLoad` guards possible:
   * they cannot await, and reading auth from React context would race the
   * first render.
   */
  getSnapshot(): AuthSnapshot {
    return snapshot
  },

  subscribe(listener: () => void): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },

  setSession(session: Session | null) {
    setSnapshot(snapshotFromSession(session))
  },
}

/**
 * Resolve the session ONCE before the router is built and the first frame is
 * painted. Without this the initial `beforeLoad` sees `userId: null` and
 * bounces an already-signed-in user to /login.
 */
export async function hydrateSession(): Promise<AuthSnapshot> {
  const { data } = await supabase.auth.getSession()
  authStore.setSession(data.session)
  return snapshot
}

export function useAuth(): AuthSnapshot {
  return useSyncExternalStore(authStore.subscribe, authStore.getSnapshot)
}

// ---------------------------------------------------------------------------
// Derived helpers. UI-only; see the note on snapshotFromSession.
// ---------------------------------------------------------------------------

export function roleInOrg(auth: AuthSnapshot, orgId: string): string | null {
  return auth.orgRoles[orgId] ?? null
}

export function isStaffAnywhere(auth: AuthSnapshot): boolean {
  return Object.keys(auth.orgRoles).length > 0 || auth.overflow
}

export function isPortalContactAnywhere(auth: AuthSnapshot): boolean {
  return auth.portalClientIds.length > 0 || auth.overflow
}

/**
 * True when the token was minted before the claim shape this build expects.
 *
 * Occurs in correct operation: a deploy that changes the claim shape bumps
 * every epoch, so live sessions must refresh once. A null version means the
 * token carries no claims at all, which no refresh can fix, so this returns
 * false and stays out of it.
 */
export function needsClaimsRefresh(auth: AuthSnapshot): boolean {
  if (!auth.userId) return false
  if (auth.claimsVersion === null) return false
  return auth.claimsVersion < EXPECTED_CLAIMS_VERSION
}
