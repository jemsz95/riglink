import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  SlidersHorizontal,
} from 'lucide-react'
import { useAppTable } from './table-hook'
import { resolveUpdater } from './url-state'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'
import type {
  PaginationState,
  RowData,
  SortingState,
  ColumnVisibilityState,
} from '@tanstack/react-table'
import type { ReactNode } from 'react'
import type { AppColumnDef } from './table-hook'

export interface DataTableProps<TRow extends RowData> {
  /** Already the requested page, in the requested order -- see manualSorting
   *  in table-hook.ts. */
  data: Array<TRow>
  columns: Array<AppColumnDef<TRow>>
  /** Total matching rows on the server, not the length of `data`. */
  total: number
  getRowId: (row: TRow) => string

  sorting: SortingState
  onSortingChange: (next: SortingState) => void
  pagination: PaginationState
  onPaginationChange: (next: PaginationState) => void

  /** Stable id, used to remember this table's hidden columns per browser. */
  tableId: string
  /** Accessible name. A table with no name is unusable with a screen reader. */
  label: string

  /** True only when there is nothing to show yet. */
  isLoading?: boolean
  /** True while refetching with rows still on screen. */
  isFetching?: boolean
  empty?: ReactNode

  /**
   * Phone rendering. Below md the table is replaced by these, never scrolled
   * sideways: a horizontally scrolled table hides the columns that matter and
   * cannot be read one-handed in a plant room.
   */
  renderCard?: (row: TRow) => ReactNode
  onRowClick?: (row: TRow) => void
  /** Offered page sizes. Omit to hide the selector entirely. */
  pageSizes?: ReadonlyArray<number>
  density?: 'compact' | 'comfortable'
  className?: string
}

const VISIBILITY_KEY_PREFIX = 'riglink:table-columns:'

function readVisibility(tableId: string): ColumnVisibilityState {
  try {
    const raw = localStorage.getItem(VISIBILITY_KEY_PREFIX + tableId)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      return {}
    return parsed as ColumnVisibilityState
  } catch {
    // Private windows and blocked site data throw on access rather than
    // returning null. A remembered column layout is never worth a blank page.
    return {}
  }
}

export function DataTable<TRow extends RowData>({
  data,
  columns,
  total,
  getRowId,
  sorting,
  onSortingChange,
  pagination,
  onPaginationChange,
  tableId,
  label,
  isLoading = false,
  isFetching = false,
  empty,
  renderCard,
  onRowClick,
  pageSizes,
  density = 'compact',
  className,
}: DataTableProps<TRow>) {
  const isMobile = useIsMobile()
  const [columnVisibility, setColumnVisibility] =
    useState<ColumnVisibilityState>(() => readVisibility(tableId))

  useEffect(() => {
    try {
      localStorage.setItem(
        VISIBILITY_KEY_PREFIX + tableId,
        JSON.stringify(columnVisibility),
      )
    } catch {
      // Preference only. Failing to persist it must not break the table.
    }
  }, [tableId, columnVisibility])

  const table = useAppTable({
    data,
    columns,
    getRowId,
    // Server owns the row count; the table only reports the page it was given.
    rowCount: total,
    state: { sorting, pagination, columnVisibility },
    onSortingChange: useCallback(
      (next: SortingState | ((old: SortingState) => SortingState)) => {
        onSortingChange(resolveUpdater(next, sorting))
      },
      [onSortingChange, sorting],
    ),
    onPaginationChange: useCallback(
      (next: PaginationState | ((old: PaginationState) => PaginationState)) => {
        onPaginationChange(resolveUpdater(next, pagination))
      },
      [onPaginationChange, pagination],
    ),
    onColumnVisibilityChange: useCallback(
      (
        next:
          | ColumnVisibilityState
          | ((old: ColumnVisibilityState) => ColumnVisibilityState),
      ) => {
        setColumnVisibility((current: ColumnVisibilityState) =>
          resolveUpdater(next, current),
        )
      },
      [],
    ),
  })

  const pageCount = Math.max(1, Math.ceil(total / pagination.pageSize))
  const rows = table.getRowModel().rows
  // getCanHide() reflects `enableHiding` on the column def. A parallel meta
  // flag would be a second source of truth that can disagree with the feature.
  const hideableColumns = useMemo(
    () => table.getAllLeafColumns().filter((column) => column.getCanHide()),
    [table],
  )

  const firstRow =
    total === 0 ? 0 : pagination.pageIndex * pagination.pageSize + 1
  const lastRow = Math.min(
    total,
    (pagination.pageIndex + 1) * pagination.pageSize,
  )

  if (isLoading) {
    return (
      <TableSkeleton columns={columns.length} density={density} label={label} />
    )
  }

  if (rows.length === 0) {
    return <>{empty}</>
  }

  return (
    <div
      className={cn('flex flex-col gap-3', className)}
      data-density={density}
      // Announces the refetch to assistive tech and dims the stale page.
      aria-busy={isFetching || undefined}
    >
      {!isMobile ? (
        <div className="flex items-center justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <SlidersHorizontal className="size-4" aria-hidden />
                Columns
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {hideableColumns.map((column) => (
                <DropdownMenuCheckboxItem
                  key={column.id}
                  checked={column.getIsVisible()}
                  onCheckedChange={(checked) => {
                    column.toggleVisibility(checked)
                  }}
                >
                  {column.columnDef.meta?.label ?? column.id}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : null}

      <div
        className={cn(
          'transition-opacity',
          isFetching && 'pointer-events-none opacity-60',
        )}
      >
        {isMobile && renderCard ? (
          <ul className="flex flex-col gap-2">
            {rows.map((row) => (
              <li key={row.id}>{renderCard(row.original)}</li>
            ))}
          </ul>
        ) : (
          <div className="border-border overflow-hidden rounded-lg border">
            <Table>
              <caption className="sr-only">{label}</caption>
              <TableHeader>
                {table.getHeaderGroups().map((group) => (
                  <TableRow key={group.id}>
                    {group.headers.map((header) => {
                      const meta = header.column.columnDef.meta
                      const sorted = header.column.getIsSorted()
                      const canSort = header.column.getCanSort()
                      return (
                        <TableHead
                          key={header.id}
                          className={cn(
                            'bg-card sticky top-0 z-10',
                            meta?.align === 'right' && 'text-right',
                          )}
                          aria-sort={
                            !canSort
                              ? undefined
                              : sorted === 'asc'
                                ? 'ascending'
                                : sorted === 'desc'
                                  ? 'descending'
                                  : 'none'
                          }
                        >
                          {header.isPlaceholder ? null : canSort ? (
                            <button
                              type="button"
                              className="hover:text-foreground -mx-2 flex items-center gap-1 rounded px-2 py-1"
                              onClick={header.column.getToggleSortingHandler()}
                            >
                              <table.FlexRender header={header} />
                              <SortIcon direction={sorted} />
                            </button>
                          ) : (
                            <table.FlexRender header={header} />
                          )}
                        </TableHead>
                      )
                    })}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow
                    key={row.id}
                    className={cn(onRowClick && 'cursor-pointer')}
                    onClick={
                      onRowClick ? () => onRowClick(row.original) : undefined
                    }
                  >
                    {row.getVisibleCells().map((cell) => {
                      const meta = cell.column.columnDef.meta
                      return (
                        <TableCell
                          key={cell.id}
                          className={cn(
                            'h-(--row-height)',
                            meta?.align === 'right' &&
                              'text-right font-mono tabular-nums',
                            meta?.nowrap && 'whitespace-nowrap',
                          )}
                        >
                          <table.FlexRender cell={cell} />
                        </TableCell>
                      )
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-sm" aria-live="polite">
          {firstRow}–{lastRow} of {total}
        </p>
        <div className="flex items-center gap-2">
          {pageSizes && pageSizes.length > 1 ? (
            <Select
              value={String(pagination.pageSize)}
              onValueChange={(value) => {
                table.setPageSize(Number(value))
              }}
            >
              <SelectTrigger
                size="sm"
                className="w-auto"
                aria-label="Rows per page"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pageSizes.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size} / page
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={pagination.pageIndex === 0}
          >
            <ChevronLeft className="size-4" aria-hidden />
            <span className="sr-only sm:not-sr-only">Previous</span>
          </Button>
          <span className="text-muted-foreground text-sm">
            Page {pagination.pageIndex + 1} of {pageCount}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={pagination.pageIndex + 1 >= pageCount}
          >
            <span className="sr-only sm:not-sr-only">Next</span>
            <ChevronRight className="size-4" aria-hidden />
          </Button>
        </div>
      </div>
    </div>
  )
}

function SortIcon({ direction }: { direction: false | 'asc' | 'desc' }) {
  if (direction === 'asc') return <ArrowUp className="size-3.5" aria-hidden />
  if (direction === 'desc')
    return <ArrowDown className="size-3.5" aria-hidden />
  return <ChevronsUpDown className="size-3.5 opacity-40" aria-hidden />
}

function TableSkeleton({
  columns,
  density,
  label,
}: {
  columns: number
  density: 'compact' | 'comfortable'
  label: string
}) {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">Loading {label}…</span>
      <div
        className="border-border overflow-hidden rounded-lg border"
        data-density={density}
        // Decoration. The live region above is what a screen reader announces;
        // eight rows of shimmering placeholder boxes are noise to it.
        aria-hidden
      >
        {Array.from({ length: 8 }).map((_, rowIndex) => (
          <div
            key={rowIndex}
            className="border-border flex h-(--row-height) items-center gap-4 border-b px-4 last:border-b-0"
          >
            {Array.from({ length: columns }).map((__, columnIndex) => (
              <Skeleton
                key={columnIndex}
                className={cn('h-4', columnIndex === 0 ? 'w-16' : 'flex-1')}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
