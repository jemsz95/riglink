import { useQuery } from '@tanstack/react-query'
import { FileText, ImageOff } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { evidenceSignedUrlQuery } from './queries'

/**
 * One thumbnail, behind a short-lived signed URL.
 *
 * The URL is fetched per object rather than batched, because signing is
 * authorised per object: asking for a hidden photo's URL is refused, which is
 * exactly the behaviour we want and would be muddied by a batch that
 * half-succeeds. React Query dedupes and re-signs on its own schedule.
 */
export function EvidenceThumb({
  orgId,
  storagePath,
  mimeType,
  caption,
  className,
}: {
  orgId: string
  storagePath: string
  mimeType: string | null
  caption: string | null
  className?: string
}) {
  const isPdf = mimeType === 'application/pdf'
  const signed = useQuery({
    ...evidenceSignedUrlQuery(orgId, storagePath),
    enabled: !isPdf,
  })

  if (isPdf) {
    return (
      <div className="bg-muted text-muted-foreground flex size-full items-center justify-center">
        <FileText className="size-6" aria-hidden />
        <span className="sr-only">PDF document</span>
      </div>
    )
  }

  if (signed.isPending) return <Skeleton className="size-full" />

  if (signed.isError) {
    return (
      <div className="bg-muted text-muted-foreground flex size-full flex-col items-center justify-center gap-1">
        <ImageOff className="size-5" aria-hidden />
        <span className="text-2xs">Unavailable</span>
      </div>
    )
  }

  return (
    <img
      src={signed.data}
      // The caption is the accessible name when there is one. An empty alt
      // when there is not is deliberate: a generated "photo of a job" string
      // is noise, and a screen reader announcing the filename is worse.
      alt={caption ?? ''}
      loading="lazy"
      decoding="async"
      className={className ?? 'size-full object-cover'}
    />
  )
}
