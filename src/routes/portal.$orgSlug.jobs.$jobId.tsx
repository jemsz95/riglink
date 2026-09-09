import { useQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { toast } from 'sonner'
import { ArrowLeft, Printer } from 'lucide-react'
import { Route as PortalRoute } from './portal.$orgSlug'
import { AppError } from '@/components/app/app-error'
import { JobStatusBadge } from '@/components/domain/job-status-badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ApprovalPanel } from '@/features/portal/approval-panel'
import { useDecideQuote } from '@/features/portal/mutations'
import {
  portalContactsQuery,
  portalJobQuery,
  portalQuoteQuery,
} from '@/features/portal/queries'
import { PortalEvidence } from '@/features/evidence/portal-evidence'
import { portalJobInvoicesQuery } from '@/features/invoices/queries'
import { SignoffPanel } from '@/features/portal/signoff-panel'
import { useDecideCompletion } from '@/features/portal/mutations-signoff'
import { PortalInvoiceCard } from '@/features/invoices/portal-invoice-card'
import { portalJobEvidenceQuery } from '@/features/evidence/queries'
import { QuotePreview } from '@/features/quotes/quote-preview'
import { formatDate, formatJobNumber } from '@/lib/format'
import { toUserMessage } from '@/lib/supabase/errors'
import type { JobStatus } from '@/lib/supabase/db'

export const Route = createFileRoute('/portal/$orgSlug/jobs/$jobId')({
  component: PortalJobPage,
})

function PortalJobPage() {
  const { clients, orgName } = PortalRoute.useRouteContext()
  const { orgSlug, jobId } = Route.useParams()

  const client = clients[0]
  const job = useQuery(portalJobQuery(client.client_id, jobId))
  const quote = useQuery(portalQuoteQuery(client.client_id, jobId))
  const contacts = useQuery(portalContactsQuery())
  const evidence = useQuery(portalJobEvidenceQuery(client.client_id, jobId))
  const invoices = useQuery(portalJobInvoicesQuery(client.client_id, jobId))
  const acceptWork = useDecideCompletion('approve')
  const declineWork = useDecideCompletion('decline')
  const myRole = contacts.data?.find(
    (contact) => contact.client_id === client.client_id,
  )?.role

  const approve = useDecideQuote('approve')
  const decline = useDecideQuote('decline')
  const deciding = approve.isPending || decline.isPending

  if (job.isError) {
    return <AppError error={job.error} reset={() => void job.refetch()} />
  }

  if (job.isPending) {
    return (
      <div role="status" aria-live="polite">
        <span className="sr-only">Loading job…</span>
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  const data = job.data
  const bundle = quote.data

  const handleDecide = (
    decision: 'approve' | 'decline',
    note: string | null,
  ) => {
    if (!bundle) return
    const mutation = decision === 'approve' ? approve : decline
    mutation.mutate(
      {
        quoteId: bundle.quoteId,
        clientId: client.client_id,
        jobId,
        note,
      },
      {
        onSuccess: () =>
          toast.success(
            decision === 'approve'
              ? 'Approved — thank you'
              : 'The company has been told you declined',
          ),
        onError: (error) => toast.error(toUserMessage(error)),
      },
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <Button
        asChild
        variant="ghost"
        size="sm"
        className="self-start print:hidden"
      >
        <Link to="/portal/$orgSlug" params={{ orgSlug }}>
          <ArrowLeft className="size-4" aria-hidden />
          Your jobs
        </Link>
      </Button>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-muted-foreground font-mono text-xs tabular-nums">
            {formatJobNumber(data.number!)}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            {data.title}
          </h1>
          <div className="mt-2">
            <JobStatusBadge status={data.status as JobStatus} />
          </div>
        </div>
      </header>

      {data.description ? (
        <p className="text-sm whitespace-pre-wrap">{data.description}</p>
      ) : null}

      <dl className="text-muted-foreground flex flex-wrap gap-x-6 gap-y-1 text-sm">
        {data.portal_site_v ? (
          <div className="flex gap-2">
            <dt>Site</dt>
            <dd className="text-foreground">{data.portal_site_v.name}</dd>
          </div>
        ) : null}
        {data.requested_for ? (
          <div className="flex gap-2">
            <dt>Requested for</dt>
            <dd className="text-foreground">
              {formatDate(data.requested_for, data.portal_site_v?.timezone)}
            </dd>
          </div>
        ) : null}
        {data.scheduled_start ? (
          <div className="flex gap-2">
            <dt>Scheduled</dt>
            <dd className="text-foreground">
              {formatDate(data.scheduled_start, data.portal_site_v?.timezone)}
            </dd>
          </div>
        ) : null}
      </dl>

      {evidence.data && evidence.data.length > 0 ? (
        <PortalEvidence
          clientId={client.client_id}
          items={evidence.data}
          timezone={data.portal_site_v?.timezone ?? null}
        />
      ) : null}

      {/* Sign-off comes before the money: the client is being asked about the
          work, and putting an invoice next to the question makes it look like
          a payment demand rather than a review. */}
      {data.status === 'work_complete' ? (
        <SignoffPanel
          pending={acceptWork.isPending || declineWork.isPending}
          // The same expression the quote panel uses. Both are a UI gate
          // only: app.portal_contact_for(..., require_approver => true)
          // refuses a viewer inside the RPC, so a stale page cannot sign
          // anything off.
          canDecide={myRole === 'primary' || myRole === 'standard'}
          onDecide={(decision, note) => {
            const input = { jobId, clientId: client.client_id, note }
            const mutation = decision === 'approve' ? acceptWork : declineWork
            mutation.mutate(input, {
              onSuccess: () =>
                toast.success(
                  decision === 'approve'
                    ? 'Thank you -- the work is signed off.'
                    : 'Thanks for letting us know. Someone will be in touch.',
                ),
              onError: (error) => toast.error(toUserMessage(error)),
            })
          }}
        />
      ) : null}

      {invoices.data?.map((invoice) => (
        <PortalInvoiceCard
          key={invoice.id}
          clientId={client.client_id}
          invoice={invoice}
          timezone={data.portal_site_v?.timezone ?? null}
        />
      ))}

      {quote.isPending ? (
        <Skeleton className="h-48 w-full" />
      ) : bundle ? (
        <>
          {bundle.status === 'sent' ? (
            <ApprovalPanel
              totalCents={bundle.quote.total_cents}
              currency={bundle.quote.currency}
              validUntil={bundle.quote.valid_until}
              pending={deciding}
              onDecide={handleDecide}
              // `viewer` contacts may read but never decide -- the RPC
              // enforces this too, so a stale UI cannot approve anything.
              // Undefined while the role is still loading, which correctly
              // resolves to "cannot decide yet" rather than flashing buttons
              // a viewer must not see.
              canDecide={myRole === 'primary' || myRole === 'standard'}
            />
          ) : null}

          {bundle.status === 'approved' ? (
            <p className="border-border bg-muted/40 rounded-lg border p-4 text-sm">
              You approved this quote. The work will be scheduled and you will
              be asked to sign it off once it is finished.
            </p>
          ) : null}

          {bundle.status === 'declined' ? (
            <p className="border-border bg-muted/40 rounded-lg border p-4 text-sm">
              You declined this quote. Ask for a revision if things have
              changed.
            </p>
          ) : null}

          <div className="flex justify-end print:hidden">
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="size-4" aria-hidden />
              Print or save as PDF
            </Button>
          </div>

          <QuotePreview
            quote={bundle.quote}
            lines={bundle.lines}
            jobTitle={data.title!}
            jobNumber={data.number!}
            clientName={client.client_name}
            orgName={orgName}
          />
        </>
      ) : (
        <p className="text-muted-foreground border-border rounded-lg border border-dashed p-4 text-sm">
          No quote yet. {orgName} will send one for you to approve.
        </p>
      )}
    </div>
  )
}
