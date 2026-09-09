import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  body?: string
  /** The primary way out. An empty state with no action is a dead end. */
  action?: ReactNode
  className?: string
}

/**
 * Two empty states are not the same thing and must not read the same.
 *
 * "You have no jobs yet" invites the user to create one; "no jobs match these
 * filters" invites them to clear the filters. Showing the first when a filter
 * is active makes a user believe their data is gone -- so callers pass the
 * right copy and the right action, and this component only lays it out.
 */
export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'border-border flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-6 py-12 text-center',
        className,
      )}
    >
      {Icon ? (
        <div className="bg-muted text-muted-foreground rounded-full p-3">
          <Icon className="size-5" aria-hidden />
        </div>
      ) : null}
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-medium">{title}</h3>
        {body ? (
          <p className="text-muted-foreground max-w-prose text-sm">{body}</p>
        ) : null}
      </div>
      {action}
    </div>
  )
}
