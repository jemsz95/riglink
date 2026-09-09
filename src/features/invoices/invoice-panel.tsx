import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Receipt, Send } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { invoiceLinesQuery, jobInvoicesQuery } from './queries'
import {
  useCreateInvoice,
  useSendInvoice,
  useSetInvoiceStatus,
} from './mutations'
import { formatDate, formatMoney } from '@/lib/format'
import { toUserMessage } from '@/lib/supabase/errors'
import type { JobStatus } from '@/lib/supabase/db'

/**
 * The invoicing controls on a job.
 *
 * "Raise invoice" only appears once the client has signed the work off. That
 * is not merely a UI courtesy: `client_accepted -> invoiced` is the only edge
 * into `invoiced`, so offering the button earlier would produce a draft that
 * cannot be sent without the job silently staying put.
 */
export function InvoicePanel({
  orgId,
  jobId,
  jobStatus,
  timezone,
}: {
  orgId: string
  jobId: string
  jobStatus: JobStatus
  // No `currency` prop: each invoice carries its own, set when it was raised.
  // Passing the org's would render a historical invoice in today's currency.
  timezone: string | null
}) {
  const invoices = useQuery(jobInvoicesQuery(orgId, jobId))
  const create = useCreateInvoice(orgId)
  const send = useSendInvoice(orgId)
  const setStatus = useSetInvoiceStatus(orgId)

  const signedOff =
    jobStatus === 'client_accepted' ||
    jobStatus === 'invoiced' ||
    jobStatus === 'closed'

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Receipt className="size-4" aria-hidden />
          Invoicing
        </h2>
        {signedOff && (invoices.data?.length ?? 0) === 0 ? (
          <Button
            size="sm"
            disabled={create.isPending}
            onClick={() =>
              create.mutate(
                { jobId },
                {
                  onSuccess: (invoice) =>
                    toast.success(`Draft invoice #${invoice.number} raised`),
                  onError: (error) => toast.error(toUserMessage(error)),
                },
              )
            }
          >
            Raise invoice
          </Button>
        ) : null}
      </div>

      {!signedOff ? (
        <p className="text-muted-foreground text-sm">
          Available once the client has signed off the completed work.
        </p>
      ) : invoices.isPending ? (
        <Skeleton className="h-20 w-full" />
      ) : (invoices.data?.length ?? 0) === 0 ? (
        <p className="text-muted-foreground text-sm">No invoice raised yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {invoices.data?.map((invoice) => (
            <li
              key={invoice.id}
              className="border-border bg-card flex flex-col gap-2 rounded-lg border p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">#{invoice.number}</span>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{invoice.status}</Badge>
                  <span className="text-sm font-semibold tabular-nums">
                    {formatMoney(invoice.total_cents, invoice.currency)}
                  </span>
                </div>
              </div>

              <InvoiceLines
                orgId={orgId}
                invoiceId={invoice.id}
                currency={invoice.currency}
              />

              <p className="text-muted-foreground text-2xs">
                {invoice.status === 'draft'
                  ? 'Not sent yet'
                  : `Issued ${formatDate(invoice.issued_at, timezone)} · due ${formatDate(invoice.due_at, timezone)}`}
              </p>

              <div className="flex flex-wrap gap-2">
                {invoice.status === 'draft' ? (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" disabled={send.isPending}>
                        <Send className="size-3.5" aria-hidden />
                        Issue invoice
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          Issue invoice #{invoice.number}?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          The client will see it for{' '}
                          {formatMoney(invoice.total_cents, invoice.currency)}{' '}
                          and the lines will be frozen. Correcting it after this
                          means voiding it and raising a new one.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() =>
                            send.mutate(
                              { invoiceId: invoice.id, jobId },
                              {
                                onSuccess: () =>
                                  toast.success('Invoice issued'),
                                onError: (error) =>
                                  toast.error(toUserMessage(error)),
                              },
                            )
                          }
                        >
                          Issue
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                ) : null}

                {invoice.status === 'sent' ? (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={setStatus.isPending}
                      onClick={() =>
                        setStatus.mutate(
                          { invoiceId: invoice.id, status: 'paid' },
                          {
                            onSuccess: () => toast.success('Marked as paid'),
                            onError: (error) =>
                              toast.error(toUserMessage(error)),
                          },
                        )
                      }
                    >
                      Mark paid
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={setStatus.isPending}
                      onClick={() =>
                        setStatus.mutate(
                          { invoiceId: invoice.id, status: 'void' },
                          {
                            onSuccess: () => toast.success('Invoice voided'),
                            onError: (error) =>
                              toast.error(toUserMessage(error)),
                          },
                        )
                      }
                    >
                      Void
                    </Button>
                  </>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function InvoiceLines({
  orgId,
  invoiceId,
  currency,
}: {
  orgId: string
  invoiceId: string
  currency: string
}) {
  const lines = useQuery(invoiceLinesQuery(orgId, invoiceId))
  if (lines.isPending) return <Skeleton className="h-10 w-full" />
  if (lines.isError) return null

  return (
    <ul className="flex flex-col gap-0.5 text-xs">
      {lines.data.map((line) => (
        <li
          key={line.id}
          className="text-muted-foreground flex justify-between gap-2"
        >
          <span className="min-w-0 truncate">
            {line.quantity} × {line.description}
          </span>
          <span className="shrink-0 tabular-nums">
            {formatMoney(line.line_total_cents ?? 0, currency)}
          </span>
        </li>
      ))}
    </ul>
  )
}
