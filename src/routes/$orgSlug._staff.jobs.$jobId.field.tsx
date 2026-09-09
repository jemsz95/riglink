import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Route as OrgRoute } from './$orgSlug'
import { AppError } from '@/components/app/app-error'
import { FieldShell } from '@/components/app/field-shell'
import { Skeleton } from '@/components/ui/skeleton'
import { EvidenceCapture } from '@/features/evidence/evidence-capture'
import { EvidenceGallery } from '@/features/evidence/evidence-gallery'
import { jobEvidenceQuery } from '@/features/evidence/queries'
import { jobDetailQuery } from '@/features/jobs/queries'
import { canDispatch } from '@/features/orgs/permissions'
import { useAuth } from '@/lib/auth/session-store'

/**
 * The on-site surface for one job.
 *
 * Reachable by every staff role including techs -- unlike the quote editor.
 * Recording what was found is the tech's job, so this is the one write surface
 * they own.
 */
export const Route = createFileRoute('/$orgSlug/_staff/jobs/$jobId/field')({
  component: FieldPage,
})

function FieldPage() {
  const { org, role } = OrgRoute.useRouteContext()
  const { orgSlug, jobId } = Route.useParams()
  const auth = useAuth()

  const job = useQuery(jobDetailQuery(org.id, jobId))
  const evidence = useQuery(jobEvidenceQuery(org.id, jobId))

  if (job.isError) {
    return (
      <AppError
        error={job.error}
        reset={() => {
          void job.refetch()
        }}
      />
    )
  }
  if (job.isPending) {
    return (
      <div className="flex flex-col gap-3 p-4">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  const data = job.data
  const timezone = data.site_timezone ?? org.timezone

  return (
    <FieldShell
      orgSlug={orgSlug}
      jobId={jobId}
      jobNumber={data.number}
      jobTitle={data.title}
      status={data.status}
      clientName={data.client_name}
    >
      <EvidenceCapture
        orgId={org.id}
        jobId={jobId}
        clientId={data.client_id}
        // The insert policy checks this against auth.uid(), so a mismatch is
        // refused rather than mis-attributed.
        capturedBy={auth.userId ?? ''}
      />

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">On this job</h2>
        {evidence.isPending ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : evidence.isError ? (
          <AppError
            error={evidence.error}
            reset={() => {
              void evidence.refetch()
            }}
          />
        ) : (
          <EvidenceGallery
            orgId={org.id}
            jobId={jobId}
            items={evidence.data}
            // Deciding what a customer sees is a dispatcher's call, not a
            // tech's. A tech can still edit their own captions and notes.
            canToggleVisibility={canDispatch(role)}
            timezone={timezone}
          />
        )}
      </section>
    </FieldShell>
  )
}
