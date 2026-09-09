import { useState } from 'react'
import { BookOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { formatMoney } from '@/lib/format'
import type { CatalogItem } from '@/lib/supabase/db'

const KIND_LABEL: Record<string, string> = {
  material: 'Materials',
  labor: 'Labour',
  discount: 'Discounts',
  other: 'Other',
}

export interface CatalogPickerProps {
  catalog: Array<CatalogItem>
  currency: string
  onPick: (item: CatalogItem) => void
  disabled?: boolean
}

/**
 * Adds a line from the price book.
 *
 * The picked price is COPIED onto the line rather than referenced. A quote is
 * a document: if the catalogue price rises next month, an already-sent quote
 * must not silently change. `catalog_item_id` is kept alongside for reporting
 * ("what do we sell most of"), which is the only thing the link is for.
 */
export function CatalogPicker({
  catalog,
  currency,
  onPick,
  disabled,
}: CatalogPickerProps) {
  const [open, setOpen] = useState(false)

  const grouped = catalog.reduce<Record<string, Array<CatalogItem>>>(
    (accumulator, item) => {
      const bucket = accumulator[item.kind] ?? []
      bucket.push(item)
      accumulator[item.kind] = bucket
      return accumulator
    },
    {},
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" disabled={disabled}>
          <BookOpen className="size-4" aria-hidden />
          From catalogue
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search the price book" />
          <CommandList>
            <CommandEmpty>
              {catalog.length === 0
                ? 'No catalogue items yet. Add them in settings, or type lines by hand.'
                : 'Nothing matches that search.'}
            </CommandEmpty>
            {Object.entries(grouped).map(([kind, items]) => (
              <CommandGroup key={kind} heading={KIND_LABEL[kind] ?? kind}>
                {items.map((item) => (
                  <CommandItem
                    key={item.id}
                    value={`${item.name} ${item.sku ?? ''}`}
                    onSelect={() => {
                      onPick(item)
                      setOpen(false)
                    }}
                  >
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate">{item.name}</span>
                      {item.sku ? (
                        <span className="text-muted-foreground text-2xs font-mono">
                          {item.sku}
                        </span>
                      ) : null}
                    </div>
                    <span className="font-mono text-xs tabular-nums">
                      {formatMoney(item.unit_price_cents, currency)}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
