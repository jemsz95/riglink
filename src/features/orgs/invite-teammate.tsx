import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { UserPlus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  invitationState,
  orgInvitationsQuery,
  useInviteTeammate,
  useRevokeInvitation,
} from './invitations'
import { formatDate, formatRelative } from '@/lib/format'
import { toUserMessage } from '@/lib/supabase/errors'
import type { StaffRole } from '@/lib/supabase/db'

const ROLES: Array<{ value: StaffRole; label: string; hint: string }> = [
  {
    value: 'admin',
    label: 'Admin',
    hint: 'Everything except deleting the organisation',
  },
  {
    value: 'dispatcher',
    label: 'Dispatcher',
    hint: 'Jobs, quotes and invoices',
  },
  {
    value: 'tech',
    label: 'Technician',
    hint: 'Their jobs and field evidence. No pricing.',
  },
]

/**
 * Invite a colleague, and see who is outstanding.
 *
 * Worth knowing while reading this: an invitation is not just a convenience
 * here, it is the key to the front door. Sign-up is invite-only, so adding a
 * row on this form is what lets that address create an account at all --
 * and revoking one takes that ability away again.
 */
export function InviteTeammate({
  orgId,
  userId,
  timezone,
}: {
  orgId: string
  userId: string
  timezone: string
}) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<StaffRole>('dispatcher')
  const invitations = useQuery(orgInvitationsQuery(orgId))
  const invite = useInviteTeammate(orgId)
  const revoke = useRevokeInvitation(orgId)

  return (
    <section className="flex max-w-xl flex-col gap-4">
      <div>
        <h2 className="text-sm font-medium">Invite a colleague</h2>
        <p className="text-muted-foreground text-sm">
          Sign-up is invite-only, so this is what lets them create an account.
          They will be able to sign in with this address once invited.
        </p>
      </div>

      <form
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
        onSubmit={(event) => {
          event.preventDefault()
          invite.mutate(
            { email, role, userId },
            {
              onSuccess: () => {
                toast.success(`Invitation sent to ${email.trim()}`)
                setEmail('')
              },
              onError: (error) => toast.error(toUserMessage(error)),
            },
          )
        }}
      >
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="invite-email">Email</Label>
          <Input
            id="invite-email"
            type="email"
            required
            autoComplete="off"
            placeholder="sam@firm.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="invite-role">Role</Label>
          <Select
            value={role}
            onValueChange={(value) => setRole(value as StaffRole)}
          >
            <SelectTrigger id="invite-role" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROLES.map((entry) => (
                <SelectItem key={entry.value} value={entry.value}>
                  {entry.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          type="submit"
          disabled={invite.isPending || email.trim() === ''}
        >
          <UserPlus className="size-4" aria-hidden />
          Invite
        </Button>
      </form>

      <p className="text-muted-foreground text-xs">
        {ROLES.find((entry) => entry.value === role)?.hint}
      </p>

      {invitations.isPending ? (
        <Skeleton className="h-20 w-full" />
      ) : invitations.isError ? null : invitations.data.length === 0 ? (
        <p className="text-muted-foreground text-sm">No invitations yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {invitations.data.map((invitation) => {
            const state = invitationState(invitation)
            return (
              <li
                key={invitation.id}
                className="border-border bg-card flex items-center justify-between gap-3 rounded-lg border p-3"
              >
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium">
                    {invitation.email}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {invitation.role} ·{' '}
                    {state === 'pending'
                      ? `expires ${formatDate(invitation.expires_at, timezone)}`
                      : state === 'accepted'
                        ? `joined ${formatRelative(invitation.accepted_at ?? invitation.invited_at)}`
                        : state}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge
                    variant="outline"
                    className={
                      state === 'pending'
                        ? 'border-primary/30 text-primary'
                        : ''
                    }
                  >
                    {state}
                  </Badge>
                  {state === 'pending' ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={revoke.isPending}
                      onClick={() =>
                        revoke.mutate(
                          { id: invitation.id },
                          {
                            onSuccess: () =>
                              toast.success('Invitation revoked'),
                            onError: (error) =>
                              toast.error(toUserMessage(error)),
                          },
                        )
                      }
                    >
                      Revoke
                    </Button>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
