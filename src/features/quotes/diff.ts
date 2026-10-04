import type { LineKind } from '@/lib/supabase/db'

/**
 * What changed between two revisions of a quote.
 *
 * Lines carry no identity across revisions: `supersede_quote` copies each one
 * as a new row with a new id, and nothing records which line it came from. So
 * lines are paired by content, most certain first:
 *
 *   1. identical in every compared field -- unchanged;
 *   2. the same catalogue item -- changed;
 *   3. the same description, ignoring case and outer whitespace -- changed.
 *
 * Whatever is left is removed (only before) or added (only after). The cost
 * of matching by content is that a free-typed line whose description was
 * reworded reads as one removed and one added. That is still true, just less
 * specific, and it is never a wrong pairing.
 */

/** The fields compared. Numeric columns arrive from PostgREST as numbers. */
export interface DiffableLine {
  kind: LineKind
  catalog_item_id: string | null
  description: string
  unit: string
  quantity: number | string
  unit_price_cents: number
  tax_rate: number | string
  line_total_cents: number | null
}

export type LineField =
  'description' | 'kind' | 'unit' | 'quantity' | 'unit_price_cents' | 'tax_rate'

export interface FieldChange {
  field: LineField
  before: string | number
  after: string | number
}

export type LineDiff<T extends DiffableLine> =
  | { type: 'unchanged'; before: T; after: T }
  | { type: 'changed'; before: T; after: T; changes: Array<FieldChange> }
  | { type: 'added'; after: T }
  | { type: 'removed'; before: T }

const FIELDS: ReadonlyArray<LineField> = [
  'description',
  'kind',
  'unit',
  'quantity',
  'unit_price_cents',
  'tax_rate',
]

/**
 * "2", "2.0" and 2 are the same quantity. Compared as normalised decimal
 * strings rather than via `Number`, so no float ever decides equality.
 */
export function normaliseDecimal(value: number | string): string {
  const text = String(value).trim()
  if (!text.includes('.')) return text
  return text.replace(/0+$/, '').replace(/\.$/, '')
}

function fieldValue(line: DiffableLine, field: LineField): string | number {
  if (field === 'quantity' || field === 'tax_rate') {
    return normaliseDecimal(line[field])
  }
  return line[field]
}

function fieldChanges(before: DiffableLine, after: DiffableLine) {
  const changes: Array<FieldChange> = []
  for (const field of FIELDS) {
    const a = fieldValue(before, field)
    const b = fieldValue(after, field)
    if (a !== b) changes.push({ field, before: a, after: b })
  }
  return changes
}

function descriptionKey(line: DiffableLine): string {
  return line.description.trim().toLowerCase()
}

/**
 * Pairs `before` with `after` and returns one entry per line, in the newer
 * revision's order, with removed lines last.
 */
export function diffLines<T extends DiffableLine>(
  before: ReadonlyArray<T>,
  after: ReadonlyArray<T>,
): Array<LineDiff<T>> {
  const pairedBefore = new Set<number>()
  const pairOf = new Map<number, number>()

  const pass = (matches: (b: T, a: T) => boolean) => {
    after.forEach((a, ai) => {
      if (pairOf.has(ai)) return
      const bi = before.findIndex(
        (b, index) => !pairedBefore.has(index) && matches(b, a),
      )
      if (bi === -1) return
      pairedBefore.add(bi)
      pairOf.set(ai, bi)
    })
  }

  pass((b, a) => fieldChanges(b, a).length === 0)
  pass(
    (b, a) =>
      b.catalog_item_id != null && b.catalog_item_id === a.catalog_item_id,
  )
  pass((b, a) => descriptionKey(b) === descriptionKey(a))

  const result: Array<LineDiff<T>> = after.map((a, ai) => {
    const bi = pairOf.get(ai)
    if (bi === undefined) return { type: 'added', after: a }
    const b = before[bi]
    const changes = fieldChanges(b, a)
    return changes.length === 0
      ? { type: 'unchanged', before: b, after: a }
      : { type: 'changed', before: b, after: a, changes }
  })

  before.forEach((b, bi) => {
    if (!pairedBefore.has(bi)) result.push({ type: 'removed', before: b })
  })

  return result
}

export interface DiffableHeader {
  notes: string | null
  terms: string | null
  valid_until: string | null
}

export type HeaderField = keyof DiffableHeader

/** Client-visible header fields that differ. Blank and null are the same. */
export function diffHeader(
  before: DiffableHeader,
  after: DiffableHeader,
): Array<{ field: HeaderField; before: string; after: string }> {
  const fields: ReadonlyArray<HeaderField> = ['notes', 'terms', 'valid_until']
  return fields.flatMap((field) => {
    const a = (before[field] ?? '').trim()
    const b = (after[field] ?? '').trim()
    return a === b ? [] : [{ field, before: a, after: b }]
  })
}
