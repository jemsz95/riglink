import type { InvoiceCsvRow } from './csv'

/**
 * A real invoice, copied out of the live database.
 *
 * These three lines and the header totals beside them were produced by
 * Postgres -- the generated columns on `invoice_line_items`, which are
 * byte-identical to the ones on `quote_line_items`, and the statement trigger
 * that sums them. Nothing here was computed in TypeScript.
 *
 * That is the point. The export is only trustworthy if the numbers it writes
 * are the numbers the database holds, so the tests assert against values the
 * database generated rather than against my arithmetic. Same technique as
 * `features/quotes/totals.fixtures.ts`: the fixture is the oracle.
 *
 * The discount line carries a negative tax (-619 on -7500 at 8.25%), which
 * is the case a naive export gets wrong by dropping the sign or by formatting
 * through a float. Note that this particular value does NOT demonstrate the
 * Postgres/JavaScript rounding split: -618.75 has a .75 fraction, so both
 * engines give -619. They diverge only on an exact half -- `round(-2.5)` is
 * -3 in Postgres and -2 in JavaScript -- which is asserted in
 * `features/quotes/totals.fixtures.ts`, where the arithmetic itself lives.
 */
export const LIVE_INVOICE_ROWS: ReadonlyArray<InvoiceCsvRow> = [
  {
    invoice_number: 1,
    invoice_status: 'sent',
    currency: 'USD',
    issued_at: '2026-09-09T21:42:11.757663+00:00',
    due_at: '2026-10-09',
    paid_at: null,
    payment_ref: null,
    client_name: 'Northwind Cold Store',
    client_billing_email: 'ap@northwind.test',
    job_number: 1,
    job_title: 'Freezer compressor rebuild',
    line_position: 1,
    line_kind: 'labor',
    description: 'Rebuild labour',
    unit: 'hr',
    quantity: '6.500',
    unit_price_cents: 11500,
    line_total_cents: 74750,
    line_tax_cents: 6167,
    tax_rate: '0.0825',
  },
  {
    invoice_number: 1,
    invoice_status: 'sent',
    currency: 'USD',
    issued_at: '2026-09-09T21:42:11.757663+00:00',
    due_at: '2026-10-09',
    paid_at: null,
    payment_ref: null,
    client_name: 'Northwind Cold Store',
    client_billing_email: 'ap@northwind.test',
    job_number: 1,
    job_title: 'Freezer compressor rebuild',
    line_position: 2,
    line_kind: 'material',
    description: 'Valve plate kit',
    unit: 'ea',
    quantity: '1.000',
    unit_price_cents: 48750,
    line_total_cents: 48750,
    line_tax_cents: 4022,
    tax_rate: '0.0825',
  },
  {
    invoice_number: 1,
    invoice_status: 'sent',
    currency: 'USD',
    issued_at: '2026-09-09T21:42:11.757663+00:00',
    due_at: '2026-10-09',
    paid_at: null,
    payment_ref: null,
    client_name: 'Northwind Cold Store',
    client_billing_email: 'ap@northwind.test',
    job_number: 1,
    job_title: 'Freezer compressor rebuild',
    line_position: 3,
    line_kind: 'discount',
    description: 'Service agreement discount',
    unit: 'ea',
    quantity: '1.000',
    unit_price_cents: -7500,
    line_total_cents: -7500,
    line_tax_cents: -619,
    tax_rate: '0.0825',
  },
]

/** The header the database computed for the invoice above. */
export const LIVE_INVOICE_HEADER = {
  subtotal_cents: 116000,
  tax_cents: 9570,
  total_cents: 125570,
} as const

/**
 * The approved quote this invoice was raised from, read before any of it was
 * copied. The two must agree exactly -- see the test.
 */
export const LIVE_APPROVED_QUOTE_HEADER = {
  subtotal_cents: 116000,
  tax_cents: 9570,
  total_cents: 125570,
} as const
