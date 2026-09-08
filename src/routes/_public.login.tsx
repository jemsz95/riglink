import { useState } from 'react'
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { supabase } from '@/lib/supabase/client'
import { authStore } from '@/lib/auth/session-store'
import { toUserMessage } from '@/lib/supabase/errors'

const searchSchema = z.object({
  // Where to land after authenticating. Kept in the URL so a magic link
  // opened in a different tab still returns the user to what they wanted.
  next: z.string().optional().catch(undefined),
})

export const Route = createFileRoute('/_public/login')({
  // Zod 4 implements Standard Schema, which TanStack Router accepts directly --
  // no adapter package required.
  validateSearch: searchSchema,
  beforeLoad: ({ search }) => {
    if (authStore.getSnapshot().userId) {
      throw redirect({ to: search.next ?? '/' })
    }
  },
  component: LoginPage,
})

function callbackUrl(next?: string) {
  const url = new URL('/callback', window.location.origin)
  if (next) url.searchParams.set('next', next)
  return url.toString()
}

function LoginPage() {
  const { next } = Route.useSearch()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [pending, setPending] = useState<'email' | 'google' | null>(null)

  async function sendMagicLink(event: React.FormEvent) {
    event.preventDefault()
    setPending('email')
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: callbackUrl(next) },
    })
    setPending(null)

    if (error) {
      toast.error(toUserMessage(error))
      return
    }
    void navigate({ to: '/check-email', search: { email: email.trim() } })
  }

  async function signInWithGoogle() {
    setPending('google')
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: callbackUrl(next) },
    })
    if (error) {
      setPending(null)
      toast.error(toUserMessage(error))
    }
    // On success the browser navigates away; no state to reset.
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>
          We&apos;ll email you a link — no password to remember.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form onSubmit={sendMagicLink} className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <Button
            type="submit"
            className="min-h-touch"
            disabled={pending !== null}
          >
            {pending === 'email' ? 'Sending…' : 'Email me a link'}
          </Button>
        </form>

        <div className="flex items-center gap-3">
          <Separator className="flex-1" />
          <span className="text-muted-foreground text-2xs uppercase tracking-wider">
            or
          </span>
          <Separator className="flex-1" />
        </div>

        <Button
          type="button"
          variant="outline"
          className="min-h-touch"
          onClick={() => void signInWithGoogle()}
          disabled={pending !== null}
        >
          {pending === 'google' ? 'Redirecting…' : 'Continue with Google'}
        </Button>
      </CardContent>
    </Card>
  )
}
