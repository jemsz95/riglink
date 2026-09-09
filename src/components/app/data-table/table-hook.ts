import {
  columnVisibilityFeature,
  createTableHook,
  rowPaginationFeature,
  rowSortingFeature,
  tableFeatures,
} from '@tanstack/react-table'
import type { ColumnDef, RowData } from '@tanstack/react-table'

/**
 * Per-column presentation metadata.
 *
 * Attached through `tableFeatures({ columnMeta })` rather than by globally
 * declaration-merging `ColumnMeta`: the global form leaks these fields into
 * every table type in the app, including third-party ones.
 */
export interface AppColumnMeta {
  /** Right-align numerics so digits line up down the column. */
  align?: 'left' | 'right'
  /** Shown in the column-visibility menu; the header may be an icon or empty. */
  label?: string
  /** Suppresses wrapping for values that must stay on one line. */
  nowrap?: boolean
}

/**
 * One feature set for every table in the app.
 *
 * `manualSorting` and `manualPagination` are defaults here because sorting and
 * paging are done by PostgREST, not in the browser. The flags do NOT ask the
 * table to fetch anything -- they tell it the `data` it was handed is already
 * the requested page, in the requested order, so it must not re-sort or slice
 * it. Getting this wrong sorts only the visible page, which looks plausible and
 * is wrong.
 */
export const appTableFeatures = tableFeatures({
  rowSortingFeature,
  rowPaginationFeature,
  columnVisibilityFeature,
  // The assertion looks redundant -- the option accepts `{}` -- but it is the
  // only thing carrying AppColumnMeta into the feature set's types. Removing it
  // types every `columnDef.meta` as `{}` and breaks every read of it. This is
  // the documented idiom, so it is disabled narrowly rather than reshaped.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
  columnMeta: {} as AppColumnMeta,
})

export type AppTableFeatures = typeof appTableFeatures

export const {
  createAppColumnHelper,
  useAppTable,
  useTableContext: useAppTableContext,
} = createTableHook({
  features: appTableFeatures,
  manualSorting: true,
  manualPagination: true,
})

/**
 * `any` for the cell value matches the library's own `helper.columns()` return
 * type. A narrower parameter rejects a heterogeneous column array outright,
 * which is every real table.
 */
export type AppColumnDef<TRow extends RowData> = ColumnDef<
  AppTableFeatures,
  TRow,
  any
>
