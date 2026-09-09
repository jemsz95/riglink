import { useQuery } from '@tanstack/react-query'
import { StickyNote } from 'lucide-react'
import { portalEvidenceSignedUrlQuery } from './queries'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDateTime } from '@/lib/format'

interface PortalEvidenceItem {
  id: string | null
  kind: string | null
  storage_path: string | null
  mime_type: string | null
  caption: string | null
  body: string | null
  captured_at: string | null
  created_at: string | null
}

/**
 * What the client sees of the work: photos and notes a dispatcher chose to
 * share.
 *
 * There is no "internal" badge and no visibility control here, because there
 * is nothing to reveal -- `job_evidence_portal_select` returns only
 * `client_visible` rows and `portal_job_evidence_v` does not carry the flag.
 * The client cannot tell how much else exists, which is the point.
 */
export function PortalEvidence({
  clientId,
  items,
  timezone,
}: {
  clientId: string
  items: Array<PortalEvidenceItem>
  timezone: string | null
}) {
  if (items.length === 0) return null

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold">Photos and updates</h2>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {items.map((item) => (
          <li
            key={item.id}
            className="border-border bg-card flex flex-col overflow-hidden rounded-lg border"
          >
            {item.kind === 'note' ? (
              <div className="flex flex-1 flex-col gap-2 p-3">
                <StickyNote
                  className="text-muted-foreground size-4"
                  aria-hidden
                />
                <p className="text-sm break-words">{item.body}</p>
              </div>
            ) : (
              <PortalThumb
                clientId={clientId}
                storagePath={item.storage_path}
                caption={item.caption}
              />
            )}
            <p className="text-muted-foreground border-border border-t px-3 py-2 text-2xs">
              {formatDateTime(item.captured_at ?? item.created_at, timezone)}
              {item.kind !== 'note' && item.caption ? ` · ${item.caption}` : ''}
            </p>
          </li>
        ))}
      </ul>
    </section>
  )
}

function PortalThumb({
  clientId,
  storagePath,
  caption,
}: {
  clientId: string
  storagePath: string | null
  caption: string | null
}) {
  const signed = useQuery({
    ...portalEvidenceSignedUrlQuery(clientId, storagePath ?? ''),
    enabled: storagePath != null,
  })

  if (signed.isPending) return <Skeleton className="aspect-square w-full" />
  if (signed.isError) {
    return (
      <div className="bg-muted text-muted-foreground flex aspect-square w-full items-center justify-center text-2xs">
        Unavailable
      </div>
    )
  }

  return (
    <img
      src={signed.data}
      alt={caption ?? ''}
      loading="lazy"
      decoding="async"
      className="aspect-square w-full object-cover"
    />
  )
}
