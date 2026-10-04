import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { withStaleClaimsRetry } from '@/lib/auth/refresh-on-stale-claims'
import { jobKeys, quoteKeys } from '@/features/jobs/keys'
import type { LineKind, Quote, QuoteInsert } from '@/lib/supabase/db'
import type { Json, TablesInsert } from '@/lib/supabase/database.types'

/**
 * Wire shape for one line inside the `save_quote_draft` payload.
 *
 * `quantity` and `tax_rate` are decimal STRINGS. The RPC declares them as
 * `text` in its `jsonb_to_recordset` list and casts text -> numeric, so a
 * value typed by the user reaches Postgres exactly as written and never
 * round-trips through a double.
 *
 * No `org_id` and no `client_id`: the RPC reads both from the quote row it has
 * locked. A caller cannot assert which tenant a line belongs to.
 */
interface QuoteLineWire {
  /** null for a line that does not exist server-side yet. */
  id: string | null
  position: number
  kind: LineKind
  catalog_item_id: string | null
  description: string
  unit: string
  quantity: string
  unit_price_cents: number
  tax_rate: string
}

function toWire(line: DraftLine): QuoteLineWire {
  return {
    id: line.id ?? null,
    position: line.position,
    kind: line.kind,
    catalog_item_id: line.catalog_item_id,
    description: line.description,
    unit: line.unit,
    quantity: line.quantity,
    unit_price_cents: line.unit_price_cents,
    tax_rate: line.tax_rate,
  }
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
  lines: Array<DraftLine>
  /** Only the keys present are written, so a lines-only save cannot blank the
   *  notes. Omit entirely to leave the header alone. */
  header?: {
    notes?: string | null
    terms?: string | null
    internal_note?: string | null
    valid_until?: string | null
  }
}

/**
 * Saves the whole draft -- header, lines, deletions -- in one transaction.
 *
 * This was three separate PostgREST requests, and PostgREST gives each request
 * its own transaction, so there was no way to make them one from here. The
 * DELETE went first, which meant a dropped connection between requests two and
 * three left the quote with its lines destroyed and nothing put back. On an
 * 800ms autosave debounce, unattended, on site network. `save_quote_draft`
 * exists for that reason, not to tidy this file.
 *
 * Deletions are no longer computed client-side: the server deletes whatever is
 * not in the array it was handed. That removes the `removedIds` bookkeeping
 * and, with it, the chance of the two disagreeing.
 *
 * The RPC is SECURITY INVOKER, so RLS and the quote lock decide exactly as
 * they did for the original requests.
 */
export function useSaveQuoteDraft(orgId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: SaveDraftInput) =>
      withStaleClaimsRetry(async (): Promise<Quote> => {
        const { data, error } = await supabase.rpc('save_quote_draft', {
          p_quote_id: input.quoteId,
          // `as unknown as Json`: the generated Args type is the opaque `Json`
          // union, and an array of interfaces with optional-free string fields
          // is structurally compatible but not assignable to it without help.
          p_lines: input.lines.map(toWire) as unknown as Json,
          ...(input.header
            ? { p_header: input.header as unknown as Json }
            : {}),
        })
        if (error) throw error
        return data
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

/**
 * Replaces a sent quote with a fresh draft, carrying the lines across.
 *
 * Also one transaction now, for the same reason: as four client-side requests
 * this could leave an orphan draft with no lines, or a job whose only quote
 * had been marked superseded with nothing to replace it.
 */
export function useSupersedeQuote(orgId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: { quoteId: string }) =>
      withStaleClaimsRetry(async (): Promise<Quote> => {
        const { data, error } = await supabase.rpc('supersede_quote', {
          p_quote_id: input.quoteId,
        })
        if (error) throw error
        return data
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: quoteKeys.all(orgId) })
    },
  })
}

/**
 * Throws a draft away. If it was a revision, the quote it replaced goes back
 * to `sent` (or `expired`) in the same transaction -- `supersede_quote`
 * marked it superseded when the draft was created, and a plain DELETE would
 * leave the job with no live quote and no way to revise it again.
 *
 * Owners and admins only, by `quotes_admin_delete_draft`; the RPC raises
 * 42501 for anyone else rather than quietly deleting nothing.
 */
export function useDiscardQuoteDraft(orgId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: { quoteId: string; jobId: string }) =>
      withStaleClaimsRetry(async (): Promise<void> => {
        const { error } = await supabase.rpc('discard_quote_draft', {
          p_quote_id: input.quoteId,
        })
        if (error) throw error
      }),
    onSuccess: (_data, input) => {
      void queryClient.invalidateQueries({
        queryKey: quoteKeys.forJob(orgId, input.jobId),
      })
      void queryClient.invalidateQueries({ queryKey: quoteKeys.all(orgId) })
    },
  })
}
