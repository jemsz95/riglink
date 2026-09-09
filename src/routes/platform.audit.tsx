import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { AppError } from '@/components/app/app-error'
import { EmptyState } from '@/components/app/empty-state'
import { platformAuditQuery } from '@/features/platform/queries'

export const Route = createFileRoute('/platform/audit')({
  component: PlatformAuditPage,
})

const ACTION_LABEL: Record<string, string> = {
  suspend_org: 'suspended',
  unsuspend_org: 'restored',
  invite_founder: 'invited a contractor',
  revoke_invitation: 'revoked an invitation',
}

/**
 * Append-only. `platform_audit_events` has no grants and no UPDATE or DELETE
 * path for anyone -- the same treatment as `approvals` and `job_status_events`.
 *
 * It exists because suspension is the only power one person exercises
 * unilaterally against a tenant they cannot otherwise see, and "why did our
 * account stop working on Tuesday" needs an answer.
 */
function PlatformAuditPage() {
  const events = useQuery(platformAuditQuery())

  if (events.isError) {
    return <AppError error={events.error} reset={() => void events.refetch()} />
  }
  if (events.isLoading) return <Skeleton className="h-40 w-full" />
  if (!events.data || events.data.length === 0) {
    return (
      <EmptyState
        title="Nothing yet"
        body="Suspensions and contractor invitations are recorded here."
      />
    )
  }

  return (
    <ul className="border-border flex flex-col divide-y rounded-lg border">
      {events.data.map((event) => (
        <li key={event.id} className="flex flex-col gap-1 p-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant="outline">{event.action}</Badge>
            <span className="font-medium">{event.actor_name ?? 'Unknown'}</span>
            <span className="text-muted-foreground">
              {ACTION_LABEL[event.action] ?? event.action}
            </span>
            {event.org_name && (
              <span className="font-medium">{event.org_name}</span>
            )}
          </div>
          {event.reason && (
            <span className="text-muted-foreground text-2xs">
              {event.reason}
            </span>
          )}
          <span className="text-muted-foreground text-2xs">
            {new Date(event.created_at).toLocaleString()}
          </span>
        </li>
      ))}
    </ul>
  )
}
