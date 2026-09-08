import { createFileRoute, redirect } from '@tanstack/react-router'
import {
  authStore,
  isPortalContactAnywhere,
  isStaffAnywhere,
} from '@/lib/auth/session-store'

/**
 * Entry point. Reads the session store directly rather than router context:
 * the store is synchronous and always current, whereas context is captured at
 * router construction and would need manual propagation on every auth change.
 */
export const Route = createFileRoute('/')({
  beforeLoad: () => {
    const auth = authStore.getSnapshot()
    if (!auth.userId) throw redirect({ to: '/login' })

    const orgIds = Object.keys(auth.orgRoles)
    if (orgIds.length > 0 || isStaffAnywhere(auth)) {
      throw redirect({ to: '/pick-workspace' })
    }
    if (isPortalContactAnywhere(auth)) {
      throw redirect({ to: '/pick-workspace' })
    }
    throw redirect({ to: '/onboarding' })
  },
})
