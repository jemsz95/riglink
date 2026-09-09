import { statusPresentation } from '@/features/jobs/status'
import { formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { JobStatusEventRow } from '@/features/jobs/queries'

const ACTOR_LABEL: Record<string, string> = {
  staff: 'Staff',
  client: 'Client',
  system: 'System',
}

export interface StatusTimelineProps {
  events: Array<JobStatusEventRow>
  timezone?: string | null
  className?: string
}

/**
 * The job's audit trail, rendered in the order it happened.
 *
 * `actor_kind` is shown on every entry, not just staff ones. When a dispute
 * arises about who approved a £4,000 quote, "Client · 12 Mar, 14:02" is the
 * entire answer -- and the table this reads from has no UPDATE or DELETE policy
 * for anyone, including owners, which is what makes it worth trusting.
 */
export function StatusTimeline({
  events,
  timezone,
  className,
}: StatusTimelineProps) {
  if (events.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No status changes yet. The job was created as a draft.
      </p>
    )
  }

  return (
    <ol className={cn('flex flex-col', className)}>
      {events.map((event, index) => {
        const presentation = statusPresentation(event.to_status)
        const Icon = presentation.icon
        const isLast = index === events.length - 1

        return (
          <li key={event.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  'flex size-7 shrink-0 items-center justify-center rounded-full border',
                  presentation.className,
                )}
              >
                <Icon className="size-3.5" aria-hidden />
              </span>
              {/* Connector, not a list marker -- it must not be announced. */}
              {!isLast ? (
                <span className="bg-border w-px flex-1" aria-hidden />
              ) : null}
            </div>

            <div className={cn('min-w-0 pb-4', isLast && 'pb-0')}>
              <p className="text-sm font-medium">{presentation.label}</p>
              <p className="text-muted-foreground text-xs">
                {ACTOR_LABEL[event.actor_kind] ?? event.actor_kind} ·{' '}
                {formatDateTime(event.created_at, timezone)}
              </p>
              {event.reason ? (
                <p className="mt-1 text-sm">{event.reason}</p>
              ) : null}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
