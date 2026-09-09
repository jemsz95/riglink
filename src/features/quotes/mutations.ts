import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { withStaleClaimsRetry } from '@/lib/auth/refresh-on-stale-claims'
import { jobKeys, quoteKeys } from '@/features/jobs/keys'
import type { LineKind, Quote, QuoteInsert } from '@/lib/supabase/db'
import type { TablesInsert } from '@/lib/supabase/database.types'

/**
 * Wire shape for a line insert.
 *
 * `quantity` and `tax_rate` go over the wire as decimal STRINGS -- PostgREST
 * casts them to numeric server-side, which is exact, whereas a JSON number
 * round-trips through a double on the way out of the browser. The generated
 * types describe those columns as `number` because that is what they
 * deserialise to on read, so the array is cast once at the call below rather
 * than field by field.
 */
interface QuoteLineWire {
  id?: string
  org_id: string
  quote_id: string
  client_id: string
  position: number
  kind: LineKind
  catalog_item_id: string | null
  description: string
  unit: string
  quantity: string
  unit_price_cents: number
  tax_rate: string
}

export interface DraftLine {
  /** Present for a line already in the database. */
  id?: string
  position: number
  kind: LineKind
  catalog_item_id: string | null
  description: string
  unit: string
  /** Decimal string, at most 3 places. Kept as text so a half-typed "1." is
   *  representable and no float ever touches it. */
  quantity: string
  unit_price_cents: number
  /** Decimal string, at most 4 places. */
  tax_rate: string
}

export function useCreateQuote(orgId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: { jobId: string; clientId: string }) =>
      withStaleClaimsRetry(async (): Promise<Quote> => {
        // `number` comes from the per-org sequence trigger and the three
        // totals from the header trigger, so QuoteInsert omits all four. The
        // generated Insert type cannot see triggers and marks `number`
        // required, hence the single cast at the call.
        const row = {
          org_id: orgId,
          job_id: input.jobId,
          client_id: input.clientId,
        } satisfies QuoteInsert
        const { data, error } = await supabase
          .from('quotes')
          .insert(row as TablesInsert<'quotes'>)
          .select('*')
          .single()
        if (error) throw error
        return data
      }),
    onSuccess: (_data, input) => {
      void queryClient.invalidateQueries({
        queryKey: quoteKeys.forJob(orgId, input.jobId),
      })
    },
  })
}

export interface SaveDraftInput {
  quoteId: string
  clientId: string
  lines: Array<DraftLine>
  /** Ids present on the server that the editor no longer has. */
  removedIds: Array<string>
  header?: {
    notes?: string | null
    terms?: string | null
    internal_note?: string | null
    valid_until?: string | null
  }
}

/**
 * Saves the whole draft: header fields, upserted lines, deleted lines.
 *
 * Sends the full array rather than per-keystroke patches. The editor is the
 * authority on ordering, and a positional unique constraint makes partial
 * updates order-dependent -- `unique (quote_id, position)` is DEFERRABLE
 * exactly so a reorder can pass through as one statement without tripping on
 * an intermediate collision.
 *
 * Deletes run BEFORE the upsert for the same reason: freeing the vacated
 * positions first means a swap does not momentarily duplicate one.
 */
export function useSaveQuoteDraft(orgId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: SaveDraftInput) =>
      withStaleClaimsRetry(async () => {
        if (input.header) {
          const { error } = await supabase
            .from('quotes')
            .update(input.header)
            .eq('org_id', orgId)
            .eq('id', input.quoteId)
          if (error) throw error
        }

        if (input.removedIds.length > 0) {
          const { error } = await supabase
            .from('quote_line_items')
            .delete()
            .eq('org_id', orgId)
            .eq('quote_id', input.quoteId)
            .in('id', input.removedIds)
          if (error) throw error
        }

        if (input.lines.length > 0) {
          const rows: Array<QuoteLineWire> = input.lines.map((line) => ({
            ...(line.id ? { id: line.id } : {}),
            org_id: orgId,
            quote_id: input.quoteId,
            client_id: input.clientId,
            position: line.position,
            kind: line.kind,
            catalog_item_id: line.catalog_item_id,
            description: line.description,
            unit: line.unit,
            quantity: line.quantity,
            unit_price_cents: line.unit_price_cents,
            tax_rate: line.tax_rate,
          }))

          const { error } = await supabase
            .from('quote_line_items')
            .upsert(
              rows as unknown as Array<TablesInsert<'quote_line_items'>>,
              {
                onConflict: 'id',
              },
            )
          if (error) throw error
        }
      }),
    onSuccess: (_data, input) => {
      void queryClient.invalidateQueries({
        queryKey: quoteKeys.lines(orgId, input.quoteId),
      })
      void queryClient.invalidateQueries({
        queryKey: quoteKeys.detail(orgId, input.quoteId),
      })
    },
  })
}

/**
 * Sends the quote. Explicit, separate, and never optimistic.
 *
 * This is the moment the document becomes visible to the client and freezes,
 * so it must not be a side effect of typing. The RPC checks there is at least
 * one line, sets `locked_at` in the same statement as the status, and moves
 * the job to `quoted`.
 */
export function useSendQuote(orgId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: { quoteId: string; jobId: string }) =>
      withStaleClaimsRetry(async (): Promise<Quote> => {
        const { data, error } = await supabase.rpc('send_quote', {
          p_quote_id: input.quoteId,
        })
        if (error) throw error
        // No cast needed: the RPC declares `returns quotes`, so the generated
        // types already give this the full row shape.
        return data
      }),
    onSuccess: (_data, input) => {
      // The job's status and history both moved, so invalidate broadly.
      void queryClient.invalidateQueries({ queryKey: quoteKeys.all(orgId) })
      void queryClient.invalidateQueries({ queryKey: jobKeys.all(orgId) })
      void queryClient.invalidateQueries({
        queryKey: jobKeys.detail(orgId, input.jobId),
      })
    },
  })
}

/** Replaces a sent quote with a fresh draft, carrying the lines across. */
export function useSupersedeQuote(orgId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: { quoteId: string; jobId: string; clientId: string }) =>
      withStaleClaimsRetry(async (): Promise<Quote> => {
        const { data: lines, error: linesError } = await supabase
          .from('quote_line_items')
          .select(
            'position, kind, catalog_item_id, description, unit, quantity, unit_price_cents, tax_rate',
          )
          .eq('org_id', orgId)
          .eq('quote_id', input.quoteId)
          .order('position', { ascending: true })
        if (linesError) throw linesError

        const newQuote = {
          org_id: orgId,
          job_id: input.jobId,
          client_id: input.clientId,
        } satisfies QuoteInsert
        const { data: quote, error: quoteError } = await supabase
          .from('quotes')
          .insert(newQuote as TablesInsert<'quotes'>)
          .select('*')
          .single()
        if (quoteError) throw quoteError

        if (lines.length > 0) {
          const { error } = await supabase.from('quote_line_items').insert(
            lines.map((line) => ({
              ...line,
              org_id: orgId,
              quote_id: quote.id,
              client_id: input.clientId,
            })),
          )
          if (error) throw error
        }

        // The old quote stays on the record: the client saw it, so it is
        // marked superseded rather than deleted.
        const { error: markError } = await supabase
          .from('quotes')
          .update({ status: 'superseded' })
          .eq('org_id', orgId)
          .eq('id', input.quoteId)
        if (markError) throw markError

        return quote
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: quoteKeys.all(orgId) })
    },
  })
}
