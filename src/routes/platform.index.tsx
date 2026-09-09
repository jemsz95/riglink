import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { AppError } from '@/components/app/app-error'
import { EmptyState } from '@/components/app/empty-state'
import {
  platformOrgAdminsQuery,
  platformOrgsQuery,
} from '@/features/platform/queries'
import type { PlatformOrg } from '@/features/platform/queries'
import { useSuspendOrg, useUnsuspendOrg } from '@/features/platform/mutations'

export const Route = createFileRoute('/platform/')({
  component: PlatformOrgsPage,
})

function PlatformOrgsPage() {
  const orgs = useQuery(platformOrgsQuery())
  const [suspending, setSuspending] = useState<PlatformOrg | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const unsuspend = useUnsuspendOrg()

  if (orgs.isError) {
    return <AppError error={orgs.error} reset={() => void orgs.refetch()} />
  }
  if (orgs.isLoading) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    )
  }
  if (!orgs.data || orgs.data.length === 0) {
    return (
      <EmptyState
        title="No organisations yet"
        body="Invite someone to create one from the Invitations tab."
      />
    )
  }

  return (
    <>
      <ul className="flex flex-col gap-2">
        {orgs.data.map((org) => (
          <li
            key={org.id}
            className="border-border bg-card rounded-lg border p-3 shadow-e1"
          >
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">
                    {org.name}
                  </span>
                  {org.suspended_at && (
                    <Badge variant="destructive">Suspended</Badge>
                  )}
                </div>
                <span className="text-muted-foreground text-2xs">
                  /{org.slug} &middot; {org.members} member
                  {org.members === 1 ? '' : 's'} &middot; {org.owners} owner,{' '}
                  {org.admins} admin, {org.dispatchers} dispatcher, {org.techs}{' '}
                  tech
                </span>
                {org.suspended_at && org.suspension_reason && (
                  <span className="text-muted-foreground mt-1 text-2xs">
                    {/* Operator-facing. The tenant is shown a generic message
                        and never sees this text. */}
                    Reason: {org.suspension_reason}
                  </span>
                )}
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setExpanded(expanded === org.id ? null : org.id)}
              >
                {expanded === org.id ? 'Hide admins' : 'Admins'}
              </Button>

              {org.suspended_at ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={unsuspend.isPending}
                  onClick={() =>
                    unsuspend.mutate(
                      { orgId: org.id },
                      {
                        onSuccess: () => toast.success(`${org.name} restored`),
                        onError: (error: Error) => toast.error(error.message),
                      },
                    )
                  }
                >
                  Restore
                </Button>
              ) : (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setSuspending(org)}
                >
                  Suspend
                </Button>
              )}
            </div>

            {expanded === org.id && <OrgAdmins orgId={org.id} />}
          </li>
        ))}
      </ul>

      <SuspendDialog org={suspending} onClose={() => setSuspending(null)} />
    </>
  )
}

/**
 * Owner and admin only. A tech's, a dispatcher's or any client contact's
 * address is never returned by the RPC behind this.
 */
function OrgAdmins({ orgId }: { orgId: string }) {
  const admins = useQuery(platformOrgAdminsQuery(orgId))
  if (admins.isLoading) return <Skeleton className="mt-3 h-12 w-full" />
  if (!admins.data || admins.data.length === 0) {
    return (
      <p className="text-muted-foreground mt-3 text-2xs">
        No owner or admin on this organisation.
      </p>
    )
  }
  return (
    <ul className="border-border mt-3 flex flex-col gap-1 border-t pt-3">
      {admins.data.map((admin) => (
        <li
          key={admin.user_id}
          className="flex flex-wrap items-center gap-2 text-2xs"
        >
          <Badge variant="outline">{admin.role}</Badge>
          <span className="font-medium">{admin.full_name ?? 'Unnamed'}</span>
          <span className="text-muted-foreground">{admin.email}</span>
          {!admin.accepted_at && (
            <span className="text-muted-foreground">(pending)</span>
          )}
        </li>
      ))}
    </ul>
  )
}

function SuspendDialog({
  org,
  onClose,
}: {
  org: PlatformOrg | null
  onClose: () => void
}) {
  const [reason, setReason] = useState('')
  const suspend = useSuspendOrg()

  return (
    <Dialog
      open={org !== null}
      onOpenChange={(open) => {
        if (!open) {
          setReason('')
          onClose()
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Suspend {org?.name}?</DialogTitle>
          <DialogDescription>
            Everyone in this organisation keeps their sign-in, and every job,
            customer, quote, invoice and photo becomes unreadable to them
            immediately. Nothing is deleted, and restoring takes effect just as
            fast.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <Label htmlFor="suspend-reason">Reason</Label>
          <Textarea
            id="suspend-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Non-payment, third notice"
          />
          <p className="text-muted-foreground text-2xs">
            This is for the audit log. The organisation is shown a generic
            message and never sees what you type here.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={reason.trim().length === 0 || suspend.isPending}
            onClick={() => {
              if (!org) return
              suspend.mutate(
                { orgId: org.id, reason: reason.trim() },
                {
                  onSuccess: () => {
                    toast.success(`${org.name} suspended`)
                    setReason('')
                    onClose()
                  },
                  onError: (error: Error) => toast.error(error.message),
                },
              )
            }}
          >
            Suspend
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
