import type { PaginationState, SortingState } from '@tanstack/react-table'

/**
 * The URL is the single owner of sort and page state.
 *
 * TanStack Table can own them internally, but then a filtered, sorted,
 * paginated view is not linkable, the back button does not undo a sort, and
 * two tabs cannot show two different pages. These functions are the whole
 * translation layer, kept pure so the off-by-one that pagination indices invite
 * is unit-testable without a browser.
 */

export interface TableUrlState<TSort extends string> {
  sort: TSort
  dir: 'asc' | 'desc'
  /** 1-based, because it is user-facing and appears in the address bar. */
  page: number
  size: number
}

/** Table sorting is an array; the URL carries a single column. */
export function toSortingState<TSort extends string>(
  state: Pick<TableUrlState<TSort>, 'sort' | 'dir'>,
): SortingState {
  return [{ id: state.sort, desc: state.dir === 'desc' }]
}

export function fromSortingState<TSort extends string>(
  sorting: SortingState,
  fallback: Pick<TableUrlState<TSort>, 'sort' | 'dir'>,
): Pick<TableUrlState<TSort>, 'sort' | 'dir'> {
  // Length, not a truthiness check on sorting[0]: without
  // noUncheckedIndexedAccess the element type lies about being defined, so
  // `!first` looks like dead code to the linter while being the real case.
  //
  // Clearing the sort entirely would leave PostgREST with no ORDER BY, and
  // therefore no stable row order across pages. Fall back to the default.
  if (sorting.length === 0) return fallback
  const first = sorting[0]
  return { sort: first.id as TSort, dir: first.desc ? 'desc' : 'asc' }
}

/** The table is 0-based; the URL is 1-based. This is the only place that
 *  conversion happens. */
export function toPaginationState(
  state: Pick<TableUrlState<string>, 'page' | 'size'>,
): PaginationState {
  return { pageIndex: Math.max(0, state.page - 1), pageSize: state.size }
}

export function fromPaginationState(
  pagination: PaginationState,
): Pick<TableUrlState<string>, 'page' | 'size'> {
  return { page: pagination.pageIndex + 1, size: pagination.pageSize }
}

/**
 * TanStack Table hands change handlers either a value or an updater function.
 * Handling only the value silently drops every change made by the built-in
 * helpers (`table.nextPage()`, `column.toggleSorting()`), which pass updaters.
 */
export function resolveUpdater<T>(next: T | ((old: T) => T), current: T): T {
  return typeof next === 'function' ? (next as (old: T) => T)(current) : next
}

/**
 * A change of sort, page size or filter must return to page 1.
 *
 * Staying on page 7 of a result set that now has two pages shows an empty
 * table, which reads as "no results" rather than "wrong page".
 */
export function resetPage<T extends { page: number }>(next: T): T {
  return { ...next, page: 1 }
}
