import { computeTotals } from './totals'
import { formatMoney } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { DraftLine } from './mutations'

export interface QuoteTotalsBarProps {
  lines: ReadonlyArray<DraftLine>
  currency: string
  /** The database's own totals, when the quote has been saved. */
  serverTotals?: {
    subtotalCents: number
    taxCents: number
    totalCents: number
  } | null
  className?: string
}

/**
 * The totals bar, computed locally from the lines.
 *
 * Local computation is what makes the editor feel immediate -- waiting for a
 * round trip to see a total is what people notice first. `computeTotals`
 * mirrors the generated columns exactly, so the number shown here is the
 * number the database will store.
 *
 * When server totals are also available they are compared, and a mismatch is
 * SHOWN rather than hidden. A silent disagreement about money is the failure
 * mode worth shouting about: it means the two formulas have drifted, and the
 * client's optimistic number is the one that must not be trusted.
 */
export function QuoteTotalsBar({
  lines,
  currency,
  serverTotals,
  className,
}: QuoteTotalsBarProps) {
  let computed
  let error: string | null = null
  try {
    computed = computeTotals(
      lines.map((line) => ({
        quantity: line.quantity,
        unitPriceCents: line.unit_price_cents,
        taxRate: line.tax_rate,
      })),
    )
  } catch (caught) {
    error =
      caught instanceof Error ? caught.message : 'Cannot total these lines'
  }

  if (error || !computed) {
    return (
      <div
        className={cn(
          'border-destructive/40 bg-destructive/5 rounded-lg border p-3',
          className,
        )}
        role="alert"
      >
        <p className="text-destructive text-sm font-medium">
          These lines cannot be totalled
        </p>
        <p className="text-muted-foreground mt-1 text-xs">{error}</p>
      </div>
    )
  }

  const drifted =
    serverTotals != null && serverTotals.totalCents !== computed.totalCents

  return (
    <div
      className={cn(
        'border-border bg-card flex flex-col gap-1 rounded-lg border p-3',
        className,
      )}
    >
      <Row
        label="Subtotal"
        cents={computed.subtotalCents}
        currency={currency}
      />
      <Row label="Tax" cents={computed.taxCents} currency={currency} />
      <div className="border-border mt-1 border-t pt-2">
        <Row
          label="Total"
          cents={computed.totalCents}
          currency={currency}
          emphasis
        />
      </div>

      {drifted ? (
        <p className="text-destructive mt-2 text-xs" role="alert">
          This total ({formatMoney(computed.totalCents, currency)}) does not
          match the saved total (
          {formatMoney(serverTotals.totalCents, currency)}). Reload before
          sending — the saved figure is the one the client would see.
        </p>
      ) : null}
    </div>
  )
}

function Row({
  label,
  cents,
  currency,
  emphasis,
}: {
  label: string
  cents: number
  currency: string
  emphasis?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span
        className={cn(
          'text-sm',
          emphasis ? 'font-medium' : 'text-muted-foreground',
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          'font-mono tabular-nums',
          emphasis ? 'text-lg font-semibold' : 'text-sm',
        )}
      >
        {formatMoney(cents, currency)}
      </span>
    </div>
  )
}
