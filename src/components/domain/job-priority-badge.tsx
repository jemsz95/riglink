import { AlertTriangle, ArrowDown, Flame, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { JobPriority } from '@/lib/supabase/db'

const PRIORITY = {
  low: { label: 'Low', icon: ArrowDown, className: 'text-muted-foreground' },
  normal: { label: 'Normal', icon: Minus, className: 'text-muted-foreground' },
  high: {
    label: 'High',
    icon: AlertTriangle,
    className: 'text-accent-foreground',
  },
  emergency: {
    label: 'Emergency',
    icon: Flame,
    className: 'text-destructive font-semibold',
  },
} as const satisfies Record<
  JobPriority,
  { label: string; icon: typeof Minus; className: string }
>

/**
 * Normal priority is rendered muted rather than hidden.
 *
 * An absent badge is ambiguous between "normal" and "not loaded yet", and a
 * dispatcher scanning a list needs the column to be uniform to skim it.
 */
export function JobPriorityBadge({
  priority,
  className,
}: {
  priority: JobPriority
  className?: string
}) {
  const { label, icon: Icon, className: tone } = PRIORITY[priority]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-xs whitespace-nowrap',
        tone,
        className,
      )}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden />
      {label}
    </span>
  )
}
