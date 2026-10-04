import { describe, expect, it } from 'vitest'
import { diffHeader, diffLines, normaliseDecimal } from './diff'
import type { DiffableLine } from './diff'

function line(overrides: Partial<DiffableLine> = {}): DiffableLine {
  return {
    kind: 'material',
    catalog_item_id: null,
    description: 'Copper pipe',
    unit: 'm',
    quantity: 4,
    unit_price_cents: 1250,
    tax_rate: 0.2,
    line_total_cents: 5000,
    ...overrides,
  }
}

describe('normaliseDecimal', () => {
  it.each([
    [2, '2'],
    ['2.000', '2'],
    ['2.500', '2.5'],
    [0.2, '0.2'],
    ['10', '10'],
  ])('%s -> %s', (input, expected) => {
    expect(normaliseDecimal(input)).toBe(expected)
  })
})

describe('diffLines', () => {
  it('reports identical revisions as unchanged', () => {
    const lines = [line(), line({ description: 'Labour', kind: 'labor' })]
    expect(diffLines(lines, lines).map((d) => d.type)).toEqual([
      'unchanged',
      'unchanged',
    ])
  })

  it('treats 4 and "4.000" as the same quantity', () => {
    const [diff] = diffLines(
      [line({ quantity: 4 })],
      [line({ quantity: '4.000' })],
    )
    expect(diff.type).toBe('unchanged')
  })

  it('pairs by description and lists the fields that changed', () => {
    const [diff] = diffLines(
      [line()],
      [line({ quantity: 6, unit_price_cents: 1300 })],
    )
    expect(diff).toMatchObject({
      type: 'changed',
      changes: [
        { field: 'quantity', before: '4', after: '6' },
        { field: 'unit_price_cents', before: 1250, after: 1300 },
      ],
    })
  })

  it('pairs a renamed catalogue line by its catalogue item', () => {
    const [diff] = diffLines(
      [line({ catalog_item_id: 'cat-1', description: 'Pipe' })],
      [line({ catalog_item_id: 'cat-1', description: 'Pipe, 15mm' })],
    )
    expect(diff).toMatchObject({
      type: 'changed',
      changes: [{ field: 'description' }],
    })
  })

  it('reports a reworded free-typed line as removed and added', () => {
    const diffs = diffLines(
      [line({ description: 'Pipe' })],
      [line({ description: 'Tubing' })],
    )
    expect(diffs.map((d) => d.type)).toEqual(['added', 'removed'])
  })

  it('prefers an exact match over a looser one', () => {
    // Two lines share a description; the exact copy must pair with the
    // exact copy, not with whichever comes first.
    const before = [line({ quantity: 1 }), line({ quantity: 2 })]
    const after = [line({ quantity: 2 })]
    const diffs = diffLines(before, after)
    expect(diffs).toMatchObject([
      { type: 'unchanged', before: { quantity: 2 } },
      { type: 'removed', before: { quantity: 1 } },
    ])
  })

  it('keeps the newer order and puts removed lines last', () => {
    const a = line({ description: 'A' })
    const b = line({ description: 'B' })
    const c = line({ description: 'C' })
    const diffs = diffLines([a, b], [c, a])
    expect(
      diffs.map((d) => [
        d.type,
        d.type === 'removed' ? d.before.description : d.after.description,
      ]),
    ).toEqual([
      ['added', 'C'],
      ['unchanged', 'A'],
      ['removed', 'B'],
    ])
  })
})

describe('diffHeader', () => {
  it('treats null and blank as equal and reports real changes', () => {
    expect(
      diffHeader(
        { notes: null, terms: 'Net 30', valid_until: '2026-10-01' },
        { notes: '  ', terms: 'Net 14', valid_until: '2026-10-01' },
      ),
    ).toEqual([{ field: 'terms', before: 'Net 30', after: 'Net 14' }])
  })
})
