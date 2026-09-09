import { Link } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { OfflineBanner } from './offline-banner'
import { SkipLink } from './skip-link'
import { JobStatusBadge } from '@/components/domain/job-status-badge'
import { useUploadQueue } from '@/lib/offline/use-upload-queue'
import type { JobStatus } from '@/lib/supabase/db'

/**
 * The technician's shell. A separate surface from the staff app, not a
 * responsive squeeze of it.
 *
 * Different constraints, so a different layout: one job at a time, one thumb,
 * bright sun, a glove. Large touch targets, no data table, no sidebar, and the
 * job number and status pinned to the top so a tech switching between jobs
 * always knows which one they are looking at.
 *
 * The upload pump is mounted HERE, once, rather than in each page. Two pumps
 * would race for the same queue rows, and a pump that unmounts when the tech
 * navigates would stall a transfer mid-photo.
 */
export function FieldShell({
  orgSlug,
  jobId,
  jobNumber,
  jobTitle,
  status,
  clientName,
  children,
}: {
  orgSlug: string
  jobId: string
  jobNumber: number
  jobTitle: string
  status: JobStatus
  clientName: string | null
  children: React.ReactNode
}) {
  const queue = useUploadQueue()

  return (
    <div
      // Opts into the larger touch targets and row heights defined for
      // [data-density='comfortable'] in styles.css -- 48px instead of 44px.
      // Set here rather than on <html> so a staff table and a field card can
      // coexist on a tablet, which is the whole reason the token is scoped.
      data-density="comfortable"
      className="bg-background flex min-h-dvh flex-col"
    >
      <SkipLink />
      <header className="border-border bg-card sticky top-0 z-10 border-b">
        <div className="flex items-center gap-2 p-3">
          <Link
            to="/$orgSlug/jobs/$jobId"
            params={{ orgSlug, jobId }}
            aria-label="Back to job"
            className="text-muted-foreground hover:text-foreground -m-2 p-2"
          >
            <ArrowLeft className="size-5" aria-hidden />
          </Link>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-semibold">
              #{jobNumber} · {jobTitle}
            </span>
            {clientName ? (
              <span className="text-muted-foreground truncate text-xs">
                {clientName}
              </span>
            ) : null}
          </div>
          <JobStatusBadge status={status} />
        </div>
        {/* Inside the sticky header on purpose: whether work is queued is
            something a tech needs while scrolling, not only at the top. */}
        <OfflineBanner summary={queue} />
      </header>

      <main
        id="main-content"
        tabIndex={-1}
        className="flex flex-1 flex-col gap-6 p-4 pb-24 focus-visible:outline-none"
      >
        {children}
      </main>
    </div>
  )
}
