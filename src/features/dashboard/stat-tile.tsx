import { Link } from '@tanstack/react-router'
import { cn } from '@/lib/utils'
import type { JobStatus } from '@/lib/supabase/db'

/**
 * One number, what it means, and where to go about it.
 *
 * Every tile is a link. A dashboard number you cannot act on is a number you
 * stop reading, so each one lands on the filtered list that produced it.
 *
 * Tone is never the only signal: `attention` adds a word ("overdue",
 * "expired") as well as colour, because roughly 8% of men cannot reliably
 * distinguish the red from the neutral, and because a screen reader conveys
 * no colour at all.
 */
export function StatTile({
  label,
  value,
  hint,
  tone = 'neutral',
  orgSlug,
  status,
  to,
}: {
  label: string
  value: string | number
  hint?: string
  tone?: 'neutral' | 'attention'
  orgSlug: string
  /** Filters the jobs list to the status this tile counted. */
  status?: JobStatus
  /** For tiles that lead somewhere other than the jobs list. */
  to?: '/$orgSlug/invoices' | '/$orgSlug/jobs'
}) {
  const body = (
    <>
      <span
        className={cn(
          'text-2xl font-semibold tabular-nums',
          tone === 'attention' && 'text-destructive',
        )}
      >
        {value}
      </span>
      <span className="text-sm font-medium">{label}</span>
      {hint ? (
        <span className="text-muted-foreground text-xs">{hint}</span>
      ) : null}
    </>
  )

  const className = cn(
    'border-border bg-card focus-visible:ring-ring/50 flex min-h-24 flex-col gap-0.5 rounded-lg border p-4 shadow-e1 transition-colors focus-visible:ring-[3px] focus-visible:outline-none',
    'hover:border-primary/40',
    tone === 'attention' && 'border-destructive/30',
  )

  if (to === '/$orgSlug/invoices') {
    return (
      <Link
        to={to}
        params={{ orgSlug }}
        search={{ status: 'sent' }}
        className={className}
      >
        {body}
      </Link>
    )
  }

  return (
    <Link
      to="/$orgSlug/jobs"
      params={{ orgSlug }}
      // The jobs list validates its own search, so an unknown status would
      // degrade to the default view rather than erroring -- but passing the
      // status the tile actually counted is what makes the number auditable.
      search={status ? { status: [status] } : {}}
      className={className}
    >
      {body}
    </Link>
  )
}
