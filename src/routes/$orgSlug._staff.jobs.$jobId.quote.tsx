import { useCallback, useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { toast } from 'sonner'
import { ArrowLeft, Send } from 'lucide-react'
import { Route as OrgRoute } from './$orgSlug'
import { AppError } from '@/components/app/app-error'
import { EmptyState } from '@/components/app/empty-state'
import { Button } from '@/components/ui/button'
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
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { jobDetailQuery } from '@/features/jobs/queries'
import { canDispatch } from '@/features/orgs/permissions'
import { LineItemEditor } from '@/features/quotes/line-item-editor'
import { QuotePreview } from '@/features/quotes/quote-preview'
import {
  useCreateQuote,
  useSaveQuoteDraft,
  useSendQuote,
  useSupersedeQuote,
} from '@/features/quotes/mutations'
import {
  catalogQuery,
  jobQuotesQuery,
  quoteLinesQuery,
  toPrintableLine,
  toPrintableQuote,
} from '@/features/quotes/queries'
import { formatMoney } from '@/lib/format'
import { isQuoteEditable } from '@/lib/supabase/db'
import { toUserMessage } from '@/lib/supabase/errors'
import type { QuoteDraftValues } from '@/features/quotes/line-item-editor'
import type { DraftLine } from '@/features/quotes/mutations'

export const Route = createFileRoute('/$orgSlug/_staff/jobs/$jobId/quote')({
  component: QuoteEditorPage,
})

function QuoteEditorPage() {
  const { org, role } = OrgRoute.useRouteContext()
  const { orgSlug, jobId } = Route.useParams()

  const job = useQuery(jobDetailQuery(org.id, jobId))
  const quotes = useQuery(jobQuotesQuery(org.id, jobId))
  const catalog = useQuery(catalogQuery(org.id, ''))

  const createQuote = useCreateQuote(org.id)
  const supersede = useSupersedeQuote(org.id)
  const sendQuote = useSendQuote(org.id)
  const saveDraft = useSaveQuoteDraft(org.id)

  // The newest quote is the working one; older ones stay for the record.
  const current = quotes.data?.[0] ?? null
  const history = quotes.data?.slice(1) ?? []

  const lines = useQuery({
    ...quoteLinesQuery(org.id, current?.id ?? ''),
    enabled: current != null,
  })

  const [saveState, setSaveState] = useState<
    'idle' | 'saving' | 'saved' | 'error'
  >('idle')

  const autosave = useMutation({
    // No `removedIds`: save_quote_draft deletes whatever is absent from the
    // array it is given, so the editor's line list is the whole instruction
    // and there is no second list to fall out of step with it.
    mutationFn: (input: { values: QuoteDraftValues }) => {
      if (!current) throw new Error('no quote to save')
      return saveDraft.mutateAsync({
        quoteId: current.id,
        lines: input.values.lines,
        header: {
          notes: input.values.notes.trim() || null,
          terms: input.values.terms.trim() || null,
          internal_note: input.values.internal_note.trim() || null,
          valid_until: input.values.valid_until || null,
        },
      })
    },
    onMutate: () => setSaveState('saving'),
    onSuccess: () => setSaveState('saved'),
    onError: (error) => {
      setSaveState('error')
      toast.error(toUserMessage(error))
    },
  })

  const handleAutosave = useCallback(
    (values: QuoteDraftValues) => {
      autosave.mutate({ values })
    },
    [autosave],
  )

  const initial = useMemo<QuoteDraftValues | null>(() => {
    if (!current || lines.data === undefined) return null
    return {
      notes: current.notes ?? '',
      terms: current.terms ?? '',
      internal_note: current.internal_note ?? '',
      valid_until: current.valid_until ?? '',
      lines: lines.data.map((line): DraftLine => ({
        id: line.id,
        position: line.position,
        kind: line.kind,
        catalog_item_id: line.catalog_item_id,
        description: line.description,
        unit: line.unit,
        // Back to strings immediately. The numeric columns arrive as JSON
        // numbers, and every downstream calculation is decimal-exact only
        // if they never stay that way.
        quantity: String(line.quantity),
        unit_price_cents: line.unit_price_cents,
        tax_rate: String(line.tax_rate),
      })),
    }
  }, [current, lines.data])

  if (!canDispatch(role)) {
    return (
      <EmptyState
        title="You cannot work on quotes"
        body="Quotes are visible to owners, admins and dispatchers only."
        action={
          <Button asChild variant="outline">
            <Link to="/$orgSlug/jobs/$jobId" params={{ orgSlug, jobId }}>
              Back to the job
            </Link>
          </Button>
        }
      />
    )
  }

  if (job.isError) {
    return <AppError error={job.error} reset={() => void job.refetch()} />
  }

  if (job.isPending || quotes.isPending) {
    return (
      <div role="status" aria-live="polite">
        <span className="sr-only">Loading quote…</span>
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  const editable = current != null && isQuoteEditable(current.status)

  return (
    <div className="flex flex-col gap-4">
      <Button asChild variant="ghost" size="sm" className="self-start">
        <Link to="/$orgSlug/jobs/$jobId" params={{ orgSlug, jobId }}>
          <ArrowLeft className="size-4" aria-hidden />
          {job.data.title}
        </Link>
      </Button>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {current ? `Quote #${current.number}` : 'Quote'}
          </h1>
          {current ? (
            <div className="mt-1 flex items-center gap-2">
              <Badge variant={editable ? 'secondary' : 'outline'}>
                {current.status}
              </Badge>
              <span className="text-muted-foreground text-sm">
                {formatMoney(current.total_cents, current.currency)}
              </span>
            </div>
          ) : null}
        </div>

        {current && editable ? (
          <SendButton
            disabled={sendQuote.isPending || (lines.data?.length ?? 0) === 0}
            pending={sendQuote.isPending}
            total={formatMoney(current.total_cents, current.currency)}
            onConfirm={() => {
              sendQuote.mutate(
                { quoteId: current.id, jobId },
                {
                  onSuccess: () => toast.success('Quote sent to the client'),
                  onError: (error) => toast.error(toUserMessage(error)),
                },
              )
            }}
          />
        ) : null}

        {current && !editable ? (
          <Button
            variant="outline"
            disabled={supersede.isPending}
            onClick={() => {
              supersede.mutate(
                { quoteId: current.id },
                {
                  onSuccess: () => toast.success('New revision created'),
                  onError: (error) => toast.error(toUserMessage(error)),
                },
              )
            }}
          >
            Create a revision
          </Button>
        ) : null}
      </header>

      {!current ? (
        <EmptyState
          title="No quote yet"
          body="Build a bill of materials and labour, then send it for approval."
          action={
            <Button
              disabled={createQuote.isPending}
              onClick={() => {
                createQuote.mutate(
                  { jobId, clientId: job.data.client_id },
                  {
                    onError: (error) => toast.error(toUserMessage(error)),
                  },
                )
              }}
            >
              Start a quote
            </Button>
          }
        />
      ) : editable ? (
        initial ? (
          <LineItemEditor
            initial={initial}
            currency={current.currency}
            catalog={catalog.data ?? []}
            serverTotals={{
              subtotalCents: current.subtotal_cents,
              taxCents: current.tax_cents,
              totalCents: current.total_cents,
            }}
            onAutosave={handleAutosave}
            saveState={saveState}
          />
        ) : (
          <Skeleton className="h-64 w-full" />
        )
      ) : (
        <>
          <p className="text-muted-foreground text-sm">
            This quote was sent on{' '}
            {new Date(current.sent_at ?? current.updated_at).toLocaleString()}{' '}
            and is locked. Create a revision to change anything.
          </p>
          <QuotePreview
            quote={toPrintableQuote(current)}
            lines={(lines.data ?? []).map(toPrintableLine)}
            jobTitle={job.data.title}
            jobNumber={job.data.number}
            clientName={job.data.client_name ?? '—'}
            orgName={org.name}
          />
        </>
      )}

      {history.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium">Earlier revisions</h2>
          <ul className="flex flex-col gap-1">
            {history.map((quote) => (
              <li
                key={quote.id}
                className="text-muted-foreground flex items-center gap-2 text-sm"
              >
                <Badge variant="outline">{quote.status}</Badge>
                <span>Quote #{quote.number}</span>
                <span className="font-mono tabular-nums">
                  {formatMoney(quote.total_cents, quote.currency)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}

/**
 * Sending is a one-way door: it reveals the quote to the client and freezes
 * the lines. That earns a confirmation with the total spelled out -- the
 * number is the thing people get wrong, and it is unrecoverable without
 * issuing a revision the client can see.
 */
function SendButton({
  disabled,
  pending,
  total,
  onConfirm,
}: {
  disabled: boolean
  pending: boolean
  total: string
  onConfirm: () => void
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button disabled={disabled}>
          <Send className="size-4" aria-hidden />
          {pending ? 'Sending…' : 'Send to client'}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Send this quote for {total}?</AlertDialogTitle>
          <AlertDialogDescription>
            The client can see it immediately and the lines are locked. To
            change anything afterwards you have to issue a revision, which the
            client also sees.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep editing</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Send it</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
