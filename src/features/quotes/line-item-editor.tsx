import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { GripVertical, Plus, Trash2 } from 'lucide-react'
import { CatalogPicker } from './catalog-picker'
import { DecimalInput, MoneyInput } from './money-input'
import { QuoteTotalsBar } from './quote-totals'
import { computeLine, isQuantityInput } from './totals'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useAppForm, withForm } from '@/lib/form/form-hook'
import { formatMoney } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { CatalogItem, LineKind } from '@/lib/supabase/db'
import type { DraftLine } from './mutations'

const LINE_KINDS: ReadonlyArray<{ value: LineKind; label: string }> = [
  { value: 'material', label: 'Material' },
  { value: 'labor', label: 'Labour' },
  { value: 'discount', label: 'Discount' },
  { value: 'other', label: 'Other' },
]

export interface QuoteDraftValues {
  notes: string
  terms: string
  internal_note: string
  valid_until: string
  lines: Array<DraftLine>
}

export interface LineItemEditorProps {
  initial: QuoteDraftValues
  currency: string
  catalog: Array<CatalogItem>
  serverTotals?: {
    subtotalCents: number
    taxCents: number
    totalCents: number
  } | null
  /** Called at most once per idle period with the whole draft. */
  onAutosave: (values: QuoteDraftValues) => void
  saveState: 'idle' | 'saving' | 'saved' | 'error'
  disabled?: boolean
}

const AUTOSAVE_MS = 800

function blankLine(position: number): DraftLine {
  return {
    position,
    kind: 'material',
    catalog_item_id: null,
    description: '',
    unit: 'each',
    quantity: '1',
    unit_price_cents: 0,
    tax_rate: '0',
  }
}

/**
 * The whole quote is ONE form, not a form per row.
 *
 * A form per row cannot express the invariants that matter -- ordering,
 * "at least one line", the totals -- and turns saving into N requests that can
 * half-fail. One form with an array field keeps the document as the unit of
 * work, which is also how the server stores it.
 *
 * Re-render discipline: each field subscribes only to its own path, so typing
 * in row 40 re-renders row 40. The totals bar subscribes to the lines array
 * because it genuinely depends on all of them; that is one component, not
 * sixty.
 */
export function LineItemEditor({
  initial,
  currency,
  catalog,
  serverTotals,
  onAutosave,
  saveState,
  disabled = false,
}: LineItemEditorProps) {
  const form = useAppForm({ defaultValues: initial })

  const lastSavedRef = useRef<string>(JSON.stringify(initial))
  const [dirty, setDirty] = useState(false)

  const scheduleSave = useCallback(() => {
    setDirty(true)
  }, [])

  // One debounced save of the entire draft. Not per keystroke and not per
  // field: `save_quote_draft` applies the whole array in a single
  // transaction, so a partial save is never a state the document passes
  // through.
  //
  // The editor no longer tracks which ids were removed. It used to diff
  // against the ids present when the editor opened, held in a ref, which got
  // it wrong in one direction: a line added and then deleted in the same
  // session was never in that ref, so it was never sent for deletion and
  // stayed behind as an orphan on the quote. Handing the server the intended
  // final array and letting it delete the difference has no such gap.
  useEffect(() => {
    if (!dirty || disabled) return
    const timer = setTimeout(() => {
      const values = form.state.values
      const serialised = JSON.stringify(values)
      if (serialised === lastSavedRef.current) {
        setDirty(false)
        return
      }

      // Never autosave a draft that cannot be totalled -- it would persist a
      // quantity the numeric column rejects and surface as an opaque error.
      const allValid = values.lines.every(
        (line) =>
          isQuantityInput(line.quantity) && line.description.trim() !== '',
      )
      if (!allValid) return

      lastSavedRef.current = serialised
      setDirty(false)
      onAutosave(values)
    }, AUTOSAVE_MS)

    return () => clearTimeout(timer)
  }, [dirty, disabled, form, onAutosave])

  const catalogByKind = useMemo(
    () => catalog.filter((item) => item.active),
    [catalog],
  )

  return (
    <div className="flex flex-col gap-4">
      <form.Field name="lines" mode="array">
        {(linesField) => (
          <div className="flex flex-col gap-3">
            {/* Desktop: a real grid with aligned columns. */}
            <div className="border-border hidden overflow-hidden rounded-lg border md:block">
              <div className="bg-muted/50 text-muted-foreground grid grid-cols-[2rem_1fr_7rem_6rem_8rem_6rem_7rem_2.5rem] items-center gap-2 px-2 py-2 text-2xs font-medium tracking-wide uppercase">
                <span className="sr-only">Reorder</span>
                <span />
                <span>Description</span>
                <span>Type</span>
                <span className="text-right">Qty</span>
                <span>Unit</span>
                <span className="text-right">Unit price</span>
                <span className="text-right">Tax</span>
                <span className="sr-only">Remove</span>
              </div>

              {linesField.state.value.map((_line, index) => (
                <EditorRow
                  key={index}
                  form={form}
                  index={index}
                  currency={currency}
                  disabled={disabled}
                  onChanged={scheduleSave}
                  onRemove={() => {
                    linesField.removeValue(index)
                    scheduleSave()
                  }}
                />
              ))}

              {linesField.state.value.length === 0 ? (
                <p className="text-muted-foreground p-4 text-sm">
                  No lines yet. Add one, or pick from the catalogue.
                </p>
              ) : null}
            </div>

            {/* Phone: stacked cards, same field paths. */}
            <div className="flex flex-col gap-3 md:hidden">
              {linesField.state.value.map((_line, index) => (
                <EditorCard
                  key={index}
                  form={form}
                  index={index}
                  currency={currency}
                  disabled={disabled}
                  onChanged={scheduleSave}
                  onRemove={() => {
                    linesField.removeValue(index)
                    scheduleSave()
                  }}
                />
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={disabled}
                onClick={() => {
                  linesField.pushValue(
                    blankLine(linesField.state.value.length + 1),
                  )
                  scheduleSave()
                }}
              >
                <Plus className="size-4" aria-hidden />
                Add line
              </Button>

              <CatalogPicker
                catalog={catalogByKind}
                currency={currency}
                disabled={disabled}
                onPick={(item) => {
                  linesField.pushValue({
                    position: linesField.state.value.length + 1,
                    kind: item.kind,
                    catalog_item_id: item.id,
                    description: item.name,
                    unit: item.unit,
                    quantity: '1',
                    unit_price_cents: item.unit_price_cents,
                    tax_rate: String(item.tax_rate),
                  })
                  scheduleSave()
                }}
              />

              <SaveIndicator state={saveState} dirty={dirty} />
            </div>
          </div>
        )}
      </form.Field>

      <form.Subscribe selector={(state) => state.values.lines}>
        {(lines) => (
          <QuoteTotalsBar
            lines={lines}
            currency={currency}
            serverTotals={serverTotals}
            className="md:max-w-sm md:self-end"
          />
        )}
      </form.Subscribe>

      <div className="grid gap-4 md:grid-cols-2">
        <form.Field name="notes">
          {(field) => (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="quote-notes">
                Notes{' '}
                <span className="text-muted-foreground font-normal">
                  — the client sees this
                </span>
              </Label>
              <Textarea
                id="quote-notes"
                rows={3}
                disabled={disabled}
                value={field.state.value}
                onChange={(event) => {
                  field.handleChange(event.target.value)
                  scheduleSave()
                }}
              />
            </div>
          )}
        </form.Field>

        <form.Field name="internal_note">
          {(field) => (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="quote-internal">
                Internal note{' '}
                <span className="text-muted-foreground font-normal">
                  — never leaves the office
                </span>
              </Label>
              <Textarea
                id="quote-internal"
                rows={3}
                disabled={disabled}
                value={field.state.value}
                onChange={(event) => {
                  field.handleChange(event.target.value)
                  scheduleSave()
                }}
              />
            </div>
          )}
        </form.Field>

        <form.Field name="terms">
          {(field) => (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="quote-terms">Terms</Label>
              <Textarea
                id="quote-terms"
                rows={2}
                disabled={disabled}
                value={field.state.value}
                onChange={(event) => {
                  field.handleChange(event.target.value)
                  scheduleSave()
                }}
              />
            </div>
          )}
        </form.Field>

        <form.Field name="valid_until">
          {(field) => (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="quote-valid">Valid until</Label>
              <Input
                id="quote-valid"
                type="date"
                disabled={disabled}
                value={field.state.value}
                onChange={(event) => {
                  field.handleChange(event.target.value)
                  scheduleSave()
                }}
              />
              <p className="text-muted-foreground text-xs">
                After this date the client can no longer approve it.
              </p>
            </div>
          )}
        </form.Field>
      </div>
    </div>
  )
}

function SaveIndicator({
  state,
  dirty,
}: {
  state: 'idle' | 'saving' | 'saved' | 'error'
  dirty: boolean
}) {
  // Tells the truth about unsaved work rather than implying everything is
  // safe. "Saved" only appears when the last save actually succeeded.
  const label =
    state === 'error'
      ? 'Could not save — retrying on the next change'
      : dirty || state === 'saving'
        ? 'Saving…'
        : state === 'saved'
          ? 'Saved'
          : ''

  if (!label) return null

  return (
    <span
      className={cn(
        'ml-auto text-xs',
        state === 'error' ? 'text-destructive' : 'text-muted-foreground',
      )}
      role="status"
      aria-live="polite"
    >
      {label}
    </span>
  )
}

/**
 * Shape-only defaults, so `withForm` can bind the parent form's type to these
 * children. The values are never used at runtime -- the parent supplies the
 * real form instance.
 */
const ROW_SHAPE: QuoteDraftValues = {
  notes: '',
  terms: '',
  internal_note: '',
  valid_until: '',
  lines: [],
}

const ROW_PROPS = {
  index: 0,
  currency: 'USD',
  disabled: false,
  onChanged: () => {},
  onRemove: () => {},
}

const EditorRow = withForm({
  defaultValues: ROW_SHAPE,
  props: ROW_PROPS,
  render: ({ form, index, currency, disabled, onChanged, onRemove }) => (
    <div className="border-border grid grid-cols-[2rem_1fr_7rem_6rem_8rem_6rem_7rem_2.5rem] items-center gap-2 border-t px-2 py-1.5">
      <GripVertical className="text-muted-foreground/40 size-4" aria-hidden />

      <form.Field name={`lines[${index}].description`}>
        {(field) => (
          <Input
            aria-label={`Line ${index + 1} description`}
            value={field.state.value}
            disabled={disabled}
            aria-invalid={field.state.value.trim() === '' || undefined}
            onChange={(event) => {
              field.handleChange(event.target.value)
              onChanged()
            }}
          />
        )}
      </form.Field>

      <form.Field name={`lines[${index}].kind`}>
        {(field) => (
          <Select
            value={field.state.value}
            disabled={disabled}
            onValueChange={(value) => {
              field.handleChange(value as LineKind)
              onChanged()
            }}
          >
            <SelectTrigger aria-label={`Line ${index + 1} type`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LINE_KINDS.map((kind) => (
                <SelectItem key={kind.value} value={kind.value}>
                  {kind.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </form.Field>

      <form.Field name={`lines[${index}].quantity`}>
        {(field) => (
          <DecimalInput
            aria-label={`Line ${index + 1} quantity`}
            value={field.state.value}
            isValid={isQuantityInput}
            disabled={disabled}
            onChange={(value) => {
              field.handleChange(value)
              onChanged()
            }}
          />
        )}
      </form.Field>

      <form.Field name={`lines[${index}].unit`}>
        {(field) => (
          <Input
            aria-label={`Line ${index + 1} unit`}
            value={field.state.value}
            disabled={disabled}
            onChange={(event) => {
              field.handleChange(event.target.value)
              onChanged()
            }}
          />
        )}
      </form.Field>

      <form.Field name={`lines[${index}].unit_price_cents`}>
        {(field) => (
          <MoneyInput
            aria-label={`Line ${index + 1} unit price`}
            valueCents={field.state.value}
            disabled={disabled}
            onChangeCents={(cents) => {
              field.handleChange(cents)
              onChanged()
            }}
          />
        )}
      </form.Field>

      {/* Subscribes to this row only, so the line total stays live without
          re-rendering the other rows. */}
      <form.Subscribe selector={(state) => state.values.lines[index]}>
        {(line) => <LineTotal line={line} currency={currency} />}
      </form.Subscribe>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        disabled={disabled}
        onClick={onRemove}
        aria-label={`Remove line ${index + 1}`}
      >
        <Trash2 className="size-4" aria-hidden />
      </Button>
    </div>
  ),
})

function LineTotal({
  line,
  currency,
}: {
  line: DraftLine | undefined
  currency: string
}) {
  if (!line) return <span />
  let total: number | null = null
  try {
    total = computeLine({
      quantity: line.quantity,
      unitPriceCents: line.unit_price_cents,
      taxRate: line.tax_rate,
    }).lineTotalCents
  } catch {
    // A half-typed quantity is not an error worth shouting about mid-keystroke.
    total = null
  }

  return (
    <span className="text-right font-mono text-sm tabular-nums">
      {total === null ? '—' : formatMoney(total, currency)}
    </span>
  )
}

const EditorCard = withForm({
  defaultValues: ROW_SHAPE,
  props: ROW_PROPS,
  render: ({ form, index, currency, disabled, onChanged, onRemove }) => (
    <div className="border-border bg-card flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex items-start justify-between gap-2">
        <span className="text-muted-foreground text-2xs font-mono tracking-widest uppercase">
          Line {index + 1}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={disabled}
          onClick={onRemove}
          aria-label={`Remove line ${index + 1}`}
        >
          <Trash2 className="size-4" aria-hidden />
        </Button>
      </div>

      <form.Field name={`lines[${index}].description`}>
        {(field) => (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`line-${index}-description`}>Description</Label>
            <Input
              id={`line-${index}-description`}
              value={field.state.value}
              disabled={disabled}
              onChange={(event) => {
                field.handleChange(event.target.value)
                onChanged()
              }}
            />
          </div>
        )}
      </form.Field>

      <div className="grid grid-cols-2 gap-3">
        <form.Field name={`lines[${index}].quantity`}>
          {(field) => (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`line-${index}-qty`}>Quantity</Label>
              <DecimalInput
                id={`line-${index}-qty`}
                aria-label={`Line ${index + 1} quantity`}
                value={field.state.value}
                isValid={isQuantityInput}
                disabled={disabled}
                onChange={(value) => {
                  field.handleChange(value)
                  onChanged()
                }}
              />
            </div>
          )}
        </form.Field>

        <form.Field name={`lines[${index}].unit_price_cents`}>
          {(field) => (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`line-${index}-price`}>Unit price</Label>
              <MoneyInput
                id={`line-${index}-price`}
                aria-label={`Line ${index + 1} unit price`}
                valueCents={field.state.value}
                disabled={disabled}
                onChangeCents={(cents) => {
                  field.handleChange(cents)
                  onChanged()
                }}
              />
            </div>
          )}
        </form.Field>
      </div>

      <form.Subscribe selector={(state) => state.values.lines[index]}>
        {(line) => (
          <div className="flex items-baseline justify-between">
            <span className="text-muted-foreground text-xs">Line total</span>
            <LineTotal line={line} currency={currency} />
          </div>
        )}
      </form.Subscribe>
    </div>
  ),
})
