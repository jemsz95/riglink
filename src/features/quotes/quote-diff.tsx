import { diffHeader, diffLines } from './diff'
import { Badge } from '@/components/ui/badge'
import { formatDate, formatMoney } from '@/lib/format'
import { cn } from '@/lib/utils'
import type {
  DiffableHeader,
  FieldChange,
  HeaderField,
  LineField,
} from './diff'
import type { QuoteLineRow } from './queries'

export interface QuoteDiffSide {
  number: number
  currency: string
  total_cents: number
  header: DiffableHeader
  lines: ReadonlyArray<QuoteLineRow>
}

const LINE_FIELD_LABELS: Record<LineField, string> = {
  description: 'Description',
  kind: 'Type',
  unit: 'Unit',
  quantity: 'Qty',
  unit_price_cents: 'Unit price',
  tax_rate: 'Tax',
}

const HEADER_FIELD_LABELS: Record<HeaderField, string> = {
  notes: 'Notes',
  terms: 'Terms',
  valid_until: 'Valid until',
}

/**
 * `tax_rate` is a fraction (0.2 is 20%). Display only -- the percentage is
 * never fed back into a calculation, so a float is acceptable here.
 */
function formatRate(value: string | number): string {
  const percent = (Number(value) * 100).toFixed(2).replace(/\.?0+$/, '')
  return `${percent}%`
}

function formatField(
  field: LineField,
  value: string | number,
  currency: string,
): string {
  if (field === 'unit_price_cents') return formatMoney(Number(value), currency)
  if (field === 'tax_rate') return formatRate(value)
  return String(value)
}

/**
 * What changed from one revision to the next, as the client would notice it:
 * the total first, then the header, then only the lines that moved. Unchanged
 * lines are counted rather than listed -- on a sixty-line quote, the three
 * that changed are the whole point.
 */
export function QuoteDiff({
  before,
  after,
  className,
}: {
  before: QuoteDiffSide
  after: QuoteDiffSide
  className?: string
}) {
  const lines = diffLines(before.lines, after.lines)
  const header = diffHeader(before.header, after.header)
  const unchanged = lines.filter((diff) => diff.type === 'unchanged').length
  const delta = after.total_cents - before.total_cents
  const currency = after.currency

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <div className="border-border bg-card flex flex-wrap items-baseline justify-between gap-2 rounded-lg border p-3">
        <span className="text-sm">
          Total, #{before.number} → #{after.number}
        </span>
        <span className="font-mono text-sm tabular-nums">
          {formatMoney(before.total_cents, currency)} →{' '}
          {formatMoney(after.total_cents, currency)}{' '}
          <span
            className={cn(
              delta > 0 && 'text-destructive',
              delta < 0 && 'text-success',
              delta === 0 && 'text-muted-foreground',
            )}
          >
            ({delta > 0 ? '+' : ''}
            {formatMoney(delta, currency)})
          </span>
        </span>
      </div>

      {header.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">Details</h3>
          <ul className="flex flex-col gap-2">
            {header.map((change) => (
              <li key={change.field} className="text-sm">
                <span className="text-muted-foreground">
                  {HEADER_FIELD_LABELS[change.field]}:{' '}
                </span>
                {change.field === 'valid_until' ? (
                  <>
                    {formatDate(change.before || null, 'UTC')} →{' '}
                    {formatDate(change.after || null, 'UTC')}
                  </>
                ) : (
                  <TextChange before={change.before} after={change.after} />
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">Lines</h3>
        {lines.length === unchanged ? (
          <p className="text-muted-foreground text-sm">No line changes.</p>
        ) : (
          <ul className="border-border divide-border flex flex-col divide-y rounded-lg border">
            {lines.map((diff, index) => {
              if (diff.type === 'unchanged') return null
              const subject = diff.type === 'removed' ? diff.before : diff.after
              return (
                <li key={index} className="flex flex-col gap-1 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <span
                      className={cn(
                        'text-sm',
                        diff.type === 'removed' &&
                          'text-muted-foreground line-through',
                      )}
                    >
                      {subject.description}
                    </span>
                    <ChangeBadge type={diff.type} />
                  </div>
                  {diff.type === 'changed' ? (
                    <FieldChanges changes={diff.changes} currency={currency} />
                  ) : (
                    <span className="text-muted-foreground font-mono text-xs tabular-nums">
                      {formatField('quantity', subject.quantity, currency)}{' '}
                      {subject.unit} ×{' '}
                      {formatMoney(subject.unit_price_cents, currency)}
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        )}
        {unchanged > 0 ? (
          <p className="text-muted-foreground text-xs">
            {unchanged} {unchanged === 1 ? 'line' : 'lines'} unchanged.
          </p>
        ) : null}
      </section>

      <p className="text-muted-foreground text-xs">
        Lines are matched by catalogue item or description, so a reworded line
        shows as one removed and one added.
      </p>
    </div>
  )
}

function ChangeBadge({ type }: { type: 'changed' | 'added' | 'removed' }) {
  const label =
    type === 'added' ? 'Added' : type === 'removed' ? 'Removed' : 'Changed'
  return (
    <Badge
      variant="outline"
      className={cn(
        'shrink-0',
        type === 'added' && 'border-success/40 text-success',
        type === 'removed' && 'border-destructive/40 text-destructive',
      )}
    >
      {label}
    </Badge>
  )
}

function FieldChanges({
  changes,
  currency,
}: {
  changes: ReadonlyArray<FieldChange>
  currency: string
}) {
  return (
    <ul className="flex flex-col gap-0.5">
      {changes.map((change) => (
        <li key={change.field} className="text-xs">
          <span className="text-muted-foreground">
            {LINE_FIELD_LABELS[change.field]}:{' '}
          </span>
          <span className="font-mono tabular-nums">
            {formatField(change.field, change.before, currency)} →{' '}
            {formatField(change.field, change.after, currency)}
          </span>
        </li>
      ))}
    </ul>
  )
}

function TextChange({ before, after }: { before: string; after: string }) {
  return (
    <span className="flex flex-col gap-0.5">
      <span className="text-muted-foreground line-through">
        {before || '(empty)'}
      </span>
      <span>{after || '(empty)'}</span>
    </span>
  )
}
