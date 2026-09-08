import { useEffect, useRef, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { z } from 'zod'
import { AppPending } from '@/components/app/app-pending'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase/client'
import { authStore } from '@/lib/auth/session-store'
import { bootstrapSession } from '@/features/orgs/queries'
import { refreshSessionForStaleClaims } from '@/lib/auth/refresh-on-stale-claims'
import { toUserMessage } from '@/lib/supabase/errors'

export const Route = createFileRoute('/_public/callback')({
  validateSearch: z.object({
    next: z.string().optional().catch(undefined),
    error_description: z.string().optional().catch(undefined),
  }),
  component: CallbackPage,
})

/**
 * Lands here from a magic link or an OAuth redirect.
 *
 * supabase-js with detectSessionInUrl handles the PKCE code exchange itself,
 * so this route's job is the part it cannot do: run bootstrap_session() to
 * claim any pending invitation, refresh the token if that changed the caller's
 * claims, then route to the right surface.
 *
 * NOTE for production: this path must be served by index.html. A static host
 * without an SPA fallback returns 404 here, which is the single most common
 * way OAuth "works locally and breaks in prod".
 */
function CallbackPage() {
  const { next, error_description: errorDescription } = Route.useSearch()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(errorDescription ?? null)
  const ran = useRef(false)

  useEffect(() => {
    // StrictMode double-invokes effects in dev; bootstrap is idempotent but
    // running it twice would double the round trips for no benefit.
    if (ran.current) return
    ran.current = true

    // Holder object rather than a bare `let`: TypeScript narrows a local
    // boolean to `false` because it cannot see the cleanup closure assigning
    // it across an await, which makes the real runtime guard below look dead.
    const run = { cancelled: false }

    async function finish() {
      const { data, error: sessionError } = await supabase.auth.getSession()
      if (run.cancelled) return

      if (sessionError || !data.session) {
        setError(
          sessionError
            ? toUserMessage(sessionError)
            : 'That sign-in link is invalid or has already been used.',
        )
        return
      }

      authStore.setSession(data.session)

      try {
        const { claimsStale } = await bootstrapSession()
        // Claiming an invitation bumps the epoch, which invalidates the token
        // we are holding. Refresh now rather than letting the next request
        // fail and self-heal.
        if (claimsStale) await refreshSessionForStaleClaims()
      } catch (bootstrapError) {
        // Non-fatal: the user is signed in. Worst case they see /onboarding
        // and can retry, so surface it rather than blocking the redirect.
        setError(toUserMessage(bootstrapError))
        return
      }

      // TypeScript cannot see that the cleanup closure below sets this across
      // an await, so it narrows the flag to `false` and calls the check dead.
      // The guard is real: it stops a navigate() after the route unmounts.
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (run.cancelled) return
      void navigate({ to: next ?? '/', replace: true })
    }

    void finish()
    return () => {
      run.cancelled = true
    }
  }, [navigate, next])

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Sign-in failed</CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            className="min-h-touch w-full"
            onClick={() => void navigate({ to: '/login', search: { next } })}
          >
            Try again
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="py-8">
        <AppPending />
        <p className="text-muted-foreground mt-2 text-center text-sm">
          Signing you in…
        </p>
      </CardContent>
    </Card>
  )
}
