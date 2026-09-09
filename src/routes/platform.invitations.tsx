import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { AppError } from '@/components/app/app-error'
import {
  founderInvitationState,
  founderInvitationsQuery,
} from '@/features/platform/queries'
import {
  useInviteFounder,
  useRevokeFounderInvitation,
} from '@/features/platform/mutations'

export const Route = createFileRoute('/platform/invitations')({
  component: FounderInvitationsPage,
})

function FounderInvitationsPage() {
  const [email, setEmail] = useState('')
  const [note, setNote] = useState('')
  const invitations = useQuery(founderInvitationsQuery())
  const invite = useInviteFounder()
  const revoke = useRevokeFounderInvitation()

  return (
    <section className="flex max-w-xl flex-col gap-4">
      <div>
        <h2 className="text-sm font-medium">Onboard a contractor</h2>
        <p className="text-muted-foreground text-sm">
          Sign-up is invite-only, and creating an organisation needs an
          invitation of its own. This is what lets someone register and set up
          their own workspace.
        </p>
      </div>

      <form
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
        onSubmit={(event) => {
          event.preventDefault()
          invite.mutate(
            { email, note: note.trim() || undefined },
            {
              onSuccess: () => {
                toast.success(`Invitation created for ${email.trim()}`)
                setEmail('')
                setNote('')
              },
              onError: (error: Error) => toast.error(error.message),
            },
          )
        }}
      >
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="founder-email">Email</Label>
          <Input
            id="founder-email"
            type="email"
            required
            autoComplete="off"
            placeholder="sam@newcontractor.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="founder-note">Note (optional)</Label>
          <Input
            id="founder-note"
            autoComplete="off"
            placeholder="Referred by Beta Mechanical"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </div>
        <Button type="submit" disabled={invite.isPending}>
          Invite
        </Button>
      </form>

      {invitations.isError && (
        <AppError
          error={invitations.error}
          reset={() => void invitations.refetch()}
        />
      )}
      {invitations.isLoading && <Skeleton className="h-24 w-full" />}

      {invitations.data && invitations.data.length > 0 && (
        <ul className="border-border flex flex-col divide-y rounded-lg border">
          {invitations.data.map((invitation) => {
            const state = founderInvitationState(invitation)
            return (
              <li
                key={invitation.id}
                className="flex flex-wrap items-center gap-2 p-3"
              >
                <span className="flex-1 truncate text-sm">
                  {invitation.email}
                </span>
                {invitation.note && (
                  <span className="text-muted-foreground text-2xs">
                    {invitation.note}
                  </span>
                )}
                <Badge variant={state === 'pending' ? 'secondary' : 'outline'}>
                  {state}
                </Badge>
                {state === 'pending' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={revoke.isPending}
                    onClick={() =>
                      revoke.mutate(invitation.id, {
                        onSuccess: () => toast.success('Invitation revoked'),
                        onError: (error: Error) => toast.error(error.message),
                      })
                    }
                  >
                    Revoke
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
