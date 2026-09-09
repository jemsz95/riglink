import { CloudOff, Loader2, TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { QueueSummary } from '@/lib/offline/use-upload-queue'

/**
 * Tells the truth about the queue, in one line, without moving the layout.
 *
 * Three states worth distinguishing, because they need different things from
 * the user:
 *
 *   offline with work queued  -- nothing to do; it will send itself. Say so,
 *                                so nobody re-takes photos they already took.
 *   sending                   -- progress, so a slow upload does not look
 *                                like a hang.
 *   blocked                   -- the only state that needs a person.
 *
 * Silent when there is nothing to report. A banner that is always present
 * stops being read.
 */
export function OfflineBanner({ summary }: { summary: QueueSummary }) {
  const { online, pending, blocked, progress } = summary

  if (blocked > 0) {
    return (
      <Bar tone="danger" icon={TriangleAlert}>
        {blocked} {blocked === 1 ? 'item' : 'items'} could not be sent and need
        attention.
      </Bar>
    )
  }

  if (!online && pending > 0) {
    return (
      <Bar tone="muted" icon={CloudOff}>
        Offline — {pending} {pending === 1 ? 'item' : 'items'} saved on this
        device and will send when you have signal.
      </Bar>
    )
  }

  if (!online) {
    return (
      <Bar tone="muted" icon={CloudOff}>
        Offline — you can still take photos and write notes.
      </Bar>
    )
  }

  if (pending > 0) {
    return (
      <Bar tone="info" icon={Loader2} spin>
        Sending {pending} {pending === 1 ? 'item' : 'items'}
        {progress != null ? ` — ${Math.round(progress * 100)}%` : ''}
      </Bar>
    )
  }

  return null
}

function Bar({
  tone,
  icon: Icon,
  spin = false,
  children,
}: {
  tone: 'muted' | 'info' | 'danger'
  icon: typeof CloudOff
  spin?: boolean
  children: React.ReactNode
}) {
  return (
    <div
      // Polite, not assertive: losing signal is not an emergency, and a
      // screen-reader user does not want their reading interrupted for it.
      role="status"
      aria-live="polite"
      className={cn(
        'flex items-center gap-2 px-4 py-2 text-xs font-medium',
        tone === 'muted' && 'bg-muted text-muted-foreground',
        tone === 'info' && 'bg-primary/10 text-primary',
        tone === 'danger' && 'bg-destructive/10 text-destructive',
      )}
    >
      <Icon
        className={cn('size-3.5 shrink-0', spin && 'animate-spin')}
        aria-hidden
      />
      <span>{children}</span>
    </div>
  )
}
