import { useState } from 'react'
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
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
import { authStore } from '@/lib/auth/session-store'
import { createOrganization, orgKeys } from '@/features/orgs/queries'
import { refreshSessionForStaleClaims } from '@/lib/auth/refresh-on-stale-claims'
import { toUserMessage } from '@/lib/supabase/errors'

export const Route = createFileRoute('/onboarding')({
  beforeLoad: () => {
    const auth = authStore.getSnapshot()
    if (!auth.userId)
      throw redirect({ to: '/login', search: { next: '/onboarding' } })
  },
  component: OnboardingPage,
})

/** Mirrors the organizations_slug_format CHECK so the user sees it before the DB does. */
function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63)
}

function OnboardingPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)
  const [pending, setPending] = useState(false)

  const effectiveSlug = slugEdited ? slugify(slug) : slugify(name)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    try {
      await createOrganization({ name: name.trim(), slug: effectiveSlug })

      // Creating the owner membership bumped our claim epoch, so the token we
      // hold is already stale. Refresh BEFORE navigating, or the destination's
      // first query fails with P0001 and only then self-heals.
      await refreshSessionForStaleClaims()
      await queryClient.invalidateQueries({ queryKey: orgKeys.memberships() })

      toast.success(`${name.trim()} is ready`)
      void navigate({
        to: '/$orgSlug',
        params: { orgSlug: effectiveSlug },
        replace: true,
      })
    } catch (error) {
      toast.error(toUserMessage(error))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="bg-background flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Create your workspace</CardTitle>
          <CardDescription>
            This is your company — you can invite your crew and your clients
            once it exists.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="org-name">Company name</Label>
              <Input
                id="org-name"
                required
                autoFocus
                placeholder="Acme Rigging"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="org-slug">Workspace URL</Label>
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground text-sm">/</span>
                <Input
                  id="org-slug"
                  required
                  placeholder="acme-rigging"
                  value={slugEdited ? slug : effectiveSlug}
                  onChange={(e) => {
                    setSlugEdited(true)
                    setSlug(e.target.value)
                  }}
                />
              </div>
              <p className="text-muted-foreground text-2xs">
                Lowercase letters, numbers and hyphens. Some words are reserved.
              </p>
            </div>

            <Button
              type="submit"
              className="min-h-touch"
              disabled={pending || !name.trim() || !effectiveSlug}
            >
              {pending ? 'Creating…' : 'Create workspace'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
