import { JOB_STATUS_PRESENTATION } from '@/features/jobs/status'
import { cn } from '@/lib/utils'
import type { JobStatus } from '@/lib/supabase/db'

export interface JobStatusBadgeProps {
  status: JobStatus
  /** Hides the label below sm, where a full status word crowds out the title. */
  compact?: boolean
  className?: string
}

/**
 * Icon AND label, always -- never colour alone.
 *
 * Three independent reasons: 8% of men cannot separate the red decline chip
 * from the green accepted one; a phone in direct sunlight loses most colour
 * distinction; and a quote a client prints for their finance team may come out
 * greyscale. The glyph carries the meaning and the colour reinforces it.
 */
export function JobStatusBadge({
  status,
  compact = false,
  className,
}: JobStatusBadgeProps) {
  const { label, icon: Icon, className: tone } = JOB_STATUS_PRESENTATION[status]

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        tone,
        className,
      )}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden />
      <span className={cn(compact && 'sr-only')}>{label}</span>
    </span>
  )
}
