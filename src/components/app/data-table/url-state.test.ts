import { describe, expect, it } from 'vitest'
import {
  fromPaginationState,
  fromSortingState,
  resetPage,
  resolveUpdater,
  toPaginationState,
  toSortingState,
} from './url-state'

describe('sorting translation', () => {
  it('round-trips a descending sort', () => {
    const url = { sort: 'updated_at' as const, dir: 'desc' as const }
    expect(toSortingState(url)).toEqual([{ id: 'updated_at', desc: true }])
    expect(fromSortingState(toSortingState(url), url)).toEqual(url)
  })

  it('round-trips an ascending sort', () => {
    const url = { sort: 'number' as const, dir: 'asc' as const }
    expect(toSortingState(url)).toEqual([{ id: 'number', desc: false }])
    expect(fromSortingState(toSortingState(url), url)).toEqual(url)
  })

  // Toggling a header a third time clears sorting in TanStack Table. With no
  // ORDER BY, PostgREST returns rows in no defined order and pagination starts
  // duplicating and skipping rows.
  it('falls back rather than leaving the query unordered', () => {
    const fallback = { sort: 'updated_at' as const, dir: 'desc' as const }
    expect(fromSortingState([], fallback)).toEqual(fallback)
  })
})

describe('pagination translation', () => {
  it('maps 1-based URL pages onto 0-based table indices', () => {
    expect(toPaginationState({ page: 1, size: 25 })).toEqual({
      pageIndex: 0,
      pageSize: 25,
    })
    expect(toPaginationState({ page: 4, size: 50 })).toEqual({
      pageIndex: 3,
      pageSize: 50,
    })
  })

  it('never produces a negative index from a malformed URL', () => {
    expect(toPaginationState({ page: 0, size: 25 }).pageIndex).toBe(0)
    expect(toPaginationState({ page: -3, size: 25 }).pageIndex).toBe(0)
  })

  it('round-trips', () => {
    const url = { page: 3, size: 100 }
    expect(fromPaginationState(toPaginationState(url))).toEqual(url)
  })
})

describe('resolveUpdater', () => {
  it('passes a plain value straight through', () => {
    expect(resolveUpdater(5, 1)).toBe(5)
  })

  // table.nextPage() and column.toggleSorting() both pass updaters. A handler
  // that only reads plain values ignores every one of those calls.
  it('applies an updater function against the current value', () => {
    expect(resolveUpdater((old: number) => old + 1, 41)).toBe(42)
    expect(
      resolveUpdater(
        (old: Array<{ id: string; desc: boolean }>) => [
          { id: 'title', desc: !old[0].desc },
        ],
        [{ id: 'title', desc: false }],
      ),
    ).toEqual([{ id: 'title', desc: true }])
  })
})

describe('resetPage', () => {
  it('returns to the first page and leaves everything else alone', () => {
    expect(resetPage({ page: 7, size: 25, q: 'boiler' })).toEqual({
      page: 1,
      size: 25,
      q: 'boiler',
    })
  })
})
