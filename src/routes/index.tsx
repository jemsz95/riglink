import { createFileRoute, redirect } from '@tanstack/react-router'
import { authStore } from '@/lib/auth/session-store'

/**
 * Entry point. Reads the session store directly rather than router context:
 * the store is synchronous and always current, whereas context is captured at
 * router construction and would need manual propagation on every auth change.
 *
 * It used to branch here -- staff, portal contact, or `/onboarding` for
 * neither -- from the JWT claims alone. It cannot any more: platform-operator
 * status is deliberately NOT a claim (see 20260912215000_platform_admins.sql),
 * so an operator with no org of their own is indistinguishable here from a
 * brand new user, and would be sent to "create a workspace" forever.
 *
 * /pick-workspace already awaits my_memberships(), which knows. The whole
 * decision moves there; the cost is one round trip that page was making anyway.
 */
export const Route = createFileRoute('/')({
  beforeLoad: () => {
    const auth = authStore.getSnapshot()
    if (!auth.userId) throw redirect({ to: '/login' })
    throw redirect({ to: '/pick-workspace' })
  },
})
