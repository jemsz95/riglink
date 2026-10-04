import { useCallback, useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { toast } from 'sonner'
import { ArrowLeft, Send, Trash2 } from 'lucide-react'
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { jobDetailQuery } from '@/features/jobs/queries'
import { canAdminister, canDispatch } from '@/features/orgs/permissions'
import { LineItemEditor } from '@/features/quotes/line-item-editor'
import { QuoteDiff } from '@/features/quotes/quote-diff'
import { QuotePreview } from '@/features/quotes/quote-preview'
import {
  useCreateQuote,
  useDiscardQuoteDraft,
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
import type { QuoteDiffSide } from '@/features/quotes/quote-diff'
import type { QuoteLineRow } from '@/features/quotes/queries'
import type { Quote } from '@/lib/supabase/db'

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
  const discardDraft = useDiscardQuoteDraft(org.id)
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
          <div className="flex flex-wrap items-center gap-2">
            {canAdminister(role) ? (
              <DiscardButton
                disabled={discardDraft.isPending || sendQuote.isPending}
                pending={discardDraft.isPending}
                // The newest earlier quote is the one this draft replaced, if
                // it is a revision at all: `supersede_quote` marks it
                // superseded at the moment the draft is created.
                replaces={
                  history[0]?.status === 'superseded' ? history[0].number : null
                }
                onConfirm={() => {
                  discardDraft.mutate(
                    { quoteId: current.id, jobId },
                    {
                      onSuccess: () => toast.success('Draft discarded'),
                      onError: (error) => toast.error(toUserMessage(error)),
                    },
                  )
                }}
              />
            ) : null}
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
          </div>
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
            // Stops a pending autosave from firing at a quote being deleted.
            disabled={discardDraft.isPending}
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
            {history.map((quote, index) => (
              <li
                key={quote.id}
                className="text-muted-foreground flex items-center gap-2 text-sm"
              >
                <Badge variant="outline">{quote.status}</Badge>
                <span>Quote #{quote.number}</span>
                <span className="font-mono tabular-nums">
                  {formatMoney(quote.total_cents, quote.currency)}
                </span>
                <RevisionDialog
                  orgId={org.id}
                  orgName={org.name}
                  quote={quote}
                  // The list is newest first, so the revision that replaced
                  // this one is the entry above it, or the current quote.
                  next={index === 0 ? current : history[index - 1]}
                  jobTitle={job.data.title}
                  jobNumber={job.data.number}
                  clientName={job.data.client_name ?? '—'}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}

/**
 * An earlier revision, read-only: the document as the client saw it, and what
 * changed in the revision that replaced it. Lines are only fetched once the
 * dialog is opened -- a job with a long revision history should not load
 * every one of them to draw a list.
 */
function RevisionDialog({
  orgId,
  orgName,
  quote,
  next,
  jobTitle,
  jobNumber,
  clientName,
}: {
  orgId: string
  orgName: string
  quote: Quote
  /** The revision that replaced this one, if any. */
  next: Quote | null
  jobTitle: string
  jobNumber: number
  clientName: string
}) {
  const [open, setOpen] = useState(false)
  const lines = useQuery({
    ...quoteLinesQuery(orgId, quote.id),
    enabled: open,
  })
  const nextLines = useQuery({
    ...quoteLinesQuery(orgId, next?.id ?? ''),
    enabled: open && next != null,
  })

  const preview = lines.isError ? (
    <AppError error={lines.error} reset={() => void lines.refetch()} />
  ) : lines.data === undefined ? (
    <Skeleton className="h-64 w-full" />
  ) : (
    <QuotePreview
      quote={toPrintableQuote(quote)}
      lines={lines.data.map(toPrintableLine)}
      jobTitle={jobTitle}
      jobNumber={jobNumber}
      clientName={clientName}
      orgName={orgName}
    />
  )

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="link" size="sm" className="ml-auto h-auto p-0">
          View
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Quote #{quote.number}</DialogTitle>
          <DialogDescription>
            Read-only. This is the version the client was sent.
          </DialogDescription>
        </DialogHeader>
        {next == null ? (
          preview
        ) : (
          <Tabs defaultValue="changes">
            <TabsList>
              <TabsTrigger value="changes">
                Changes in #{next.number}
              </TabsTrigger>
              <TabsTrigger value="document">Document</TabsTrigger>
            </TabsList>
            <TabsContent value="changes" className="pt-2">
              {lines.isError || nextLines.isError ? (
                <AppError
                  error={lines.error ?? nextLines.error}
                  reset={() => {
                    void lines.refetch()
                    void nextLines.refetch()
                  }}
                />
              ) : lines.data === undefined || nextLines.data === undefined ? (
                <Skeleton className="h-64 w-full" />
              ) : (
                <>
                  {isQuoteEditable(next.status) ? (
                    <p className="text-muted-foreground mb-3 text-xs">
                      #{next.number} is still a draft; this is its last saved
                      state.
                    </p>
                  ) : null}
                  <QuoteDiff
                    before={toDiffSide(quote, lines.data)}
                    after={toDiffSide(next, nextLines.data)}
                  />
                </>
              )}
            </TabsContent>
            <TabsContent value="document" className="pt-2">
              {preview}
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  )
}

function toDiffSide(quote: Quote, lines: Array<QuoteLineRow>): QuoteDiffSide {
  return {
    number: quote.number,
    currency: quote.currency,
    total_cents: quote.total_cents,
    header: {
      notes: quote.notes,
      terms: quote.terms,
      valid_until: quote.valid_until,
    },
    lines,
  }
}

/**
 * Discarding is permanent, but only ever for a draft the client never saw.
 * When the draft is a revision, the dialog says which quote comes back --
 * that is the part people would not otherwise expect.
 */
function DiscardButton({
  disabled,
  pending,
  replaces,
  onConfirm,
}: {
  disabled: boolean
  pending: boolean
  /** Number of the quote this draft replaced, or null for a first draft. */
  replaces: number | null
  onConfirm: () => void
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" disabled={disabled}>
          <Trash2 className="size-4" aria-hidden />
          {pending ? 'Discarding…' : 'Discard draft'}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Discard this draft?</AlertDialogTitle>
          <AlertDialogDescription>
            {replaces === null
              ? 'Its lines and notes are deleted. The client never saw it.'
              : `Its changes are deleted and quote #${replaces} becomes the live quote again, as the client last saw it.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep the draft</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Discard it</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
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
