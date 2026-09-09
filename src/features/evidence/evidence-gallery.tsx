import { useState } from 'react'
import { Eye, EyeOff, StickyNote } from 'lucide-react'
import { EvidenceThumb } from './evidence-thumb'
import { useSetEvidenceVisibility } from './mutations'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { EmptyState } from '@/components/app/empty-state'
import { formatDateTime, formatRelative } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { EvidenceRow } from './queries'

/**
 * The field log for one job: photos, documents and notes in captured order.
 *
 * Notes are shown inline rather than behind a thumbnail. A field log where the
 * text is hidden one tap away is a log nobody reads, and the note is usually
 * the most useful thing on the job.
 */
export function EvidenceGallery({
  orgId,
  jobId,
  items,
  canToggleVisibility,
  timezone,
}: {
  orgId: string
  jobId: string
  items: Array<EvidenceRow>
  canToggleVisibility: boolean
  timezone: string | null
}) {
  const [open, setOpen] = useState<EvidenceRow | null>(null)
  const setVisibility = useSetEvidenceVisibility(orgId)

  if (items.length === 0) {
    return (
      <EmptyState
        title="Nothing recorded yet"
        body="Photos and notes taken on site appear here."
      />
    )
  }

  return (
    <>
      <ul className="flex flex-col gap-3">
        {items.map((item) => (
          <li
            key={item.id}
            className="border-border bg-card flex gap-3 rounded-lg border p-3"
          >
            {item.kind === 'note' ? (
              <div className="bg-muted text-muted-foreground flex size-16 shrink-0 items-center justify-center rounded-md">
                <StickyNote className="size-5" aria-hidden />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setOpen(item)}
                className="focus-visible:ring-ring size-16 shrink-0 overflow-hidden rounded-md focus-visible:ring-2 focus-visible:outline-none"
              >
                <EvidenceThumb
                  orgId={orgId}
                  storagePath={item.storage_path ?? ''}
                  mimeType={item.mime_type}
                  caption={item.caption}
                />
                <span className="sr-only">
                  Open {item.caption ?? 'photo'} full size
                </span>
              </button>
            )}

            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 text-sm break-words">
                  {item.kind === 'note' ? item.body : item.caption}
                  {item.kind !== 'note' && !item.caption ? (
                    <span className="text-muted-foreground italic">
                      No caption
                    </span>
                  ) : null}
                </p>
                <Badge
                  variant="outline"
                  className={cn(
                    'shrink-0 text-2xs',
                    item.client_visible
                      ? 'border-primary/30 text-primary'
                      : 'text-muted-foreground',
                  )}
                >
                  {item.client_visible ? 'Client can see' : 'Internal'}
                </Badge>
              </div>

              <p className="text-muted-foreground text-2xs">
                {/* The device clock, which is what the tech saw. The server's
                    own created_at is kept in the row for when the two
                    disagree. */}
                {formatRelative(item.captured_at ?? item.created_at)}
                {' · '}
                {formatDateTime(item.captured_at ?? item.created_at, timezone)}
              </p>

              {canToggleVisibility ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-1 self-start"
                  disabled={setVisibility.isPending}
                  onClick={() =>
                    setVisibility.mutate({
                      id: item.id,
                      jobId,
                      visible: !item.client_visible,
                    })
                  }
                >
                  {item.client_visible ? (
                    <>
                      <EyeOff className="size-3.5" aria-hidden /> Hide from
                      client
                    </>
                  ) : (
                    <>
                      <Eye className="size-3.5" aria-hidden /> Show to client
                    </>
                  )}
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      <Dialog open={open !== null} onOpenChange={() => setOpen(null)}>
        <DialogContent className="max-w-3xl">
          <DialogTitle className="text-sm">
            {open?.caption ?? 'Photo'}
          </DialogTitle>
          <DialogDescription className="text-2xs">
            {open
              ? formatDateTime(open.captured_at ?? open.created_at, timezone)
              : null}
          </DialogDescription>
          {open?.storage_path ? (
            <EvidenceThumb
              orgId={orgId}
              storagePath={open.storage_path}
              mimeType={open.mime_type}
              caption={open.caption}
              className="max-h-[70vh] w-full object-contain"
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}
