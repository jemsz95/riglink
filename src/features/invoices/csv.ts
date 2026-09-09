/**
 * Accounting export. One CSV, no payments, no integrations.
 *
 * This is where the system's responsibility for money ends: a file a
 * bookkeeper imports into whatever they already use. That makes it the last
 * chance to get the numbers right and the first place a mistake becomes
 * someone else's ledger, so all of it is pure and all of it is tested.
 *
 * Three things this file exists to get right:
 *
 * 1. MONEY NEVER TOUCHES A FLOAT. Amounts arrive as integer cents and are
 *    formatted by splitting the integer, not by dividing. `125570 / 100`
 *    happens to be exact, but `(0.1 + 0.2) * 100` is not, and a cent lost in
 *    an export is a reconciliation that does not balance.
 *
 * 2. TEXT CANNOT BECOME A FORMULA. A field beginning `=`, `+`, `-`, `@`, tab
 *    or CR is executed as a formula by Excel and Google Sheets. A client named
 *    `=HYPERLINK("http://x","Invoice")` is a live attack on the bookkeeper's
 *    machine, delivered by our own export. Text fields are neutralised; NUMERIC
 *    fields are not, because a negative amount legitimately starts with `-`
 *    and prefixing it would corrupt every credit line. That distinction is the
 *    subtle part, and it is why columns carry a type.
 *
 * 3. RFC 4180, properly. Quotes doubled, fields containing a delimiter,
 *    quote or newline wrapped, CRLF line endings.
 */

export type CsvColumnType = 'text' | 'number' | 'date'

export interface InvoiceCsvRow {
  invoice_number: number
  invoice_status: string
  currency: string
  issued_at: string | null
  due_at: string | null
  paid_at: string | null
  payment_ref: string | null
  client_name: string
  client_billing_email: string | null
  job_number: number
  job_title: string
  line_position: number
  line_kind: string
  description: string
  unit: string
  /** Decimal string, at most 3 places, exactly as stored. */
  quantity: string
  unit_price_cents: number
  line_total_cents: number
  line_tax_cents: number
  /** Decimal string, at most 4 places. */
  tax_rate: string
}

/**
 * Formats integer minor units as an exact decimal string.
 *
 * Splits rather than divides: the integer part is `abs / 10^minorUnits` in
 * integer arithmetic and the fraction is the remainder, zero-padded. No
 * division by 100 anywhere, so no representable-value assumptions.
 *
 * `minorUnits` comes from the currency, not from a constant: JPY has none and
 * BHD has three, and an export that assumes two is wrong in both.
 */
export function minorUnitsToDecimal(amount: number, minorUnits = 2): string {
  if (!Number.isInteger(amount)) {
    throw new Error(
      `refusing to format a non-integer money amount: ${amount}. Amounts are minor units (cents) and must be integers.`,
    )
  }
  if (minorUnits === 0) return String(amount)

  const negative = amount < 0
  const abs = Math.abs(amount)
  const divisor = 10 ** minorUnits
  const whole = Math.trunc(abs / divisor)
  const fraction = abs - whole * divisor
  return `${negative ? '-' : ''}${whole}.${String(fraction).padStart(minorUnits, '0')}`
}

/** Currencies whose minor unit is not two decimal places. */
const MINOR_UNITS: Record<string, number> = {
  JPY: 0,
  KRW: 0,
  VND: 0,
  CLP: 0,
  ISK: 0,
  BHD: 3,
  JOD: 3,
  KWD: 3,
  OMR: 3,
  TND: 3,
}

export function minorUnitsFor(currency: string): number {
  return MINOR_UNITS[currency.toUpperCase()] ?? 2
}

const FORMULA_TRIGGERS = new Set(['=', '+', '-', '@', '\t', '\r'])

/**
 * Neutralises a text field that a spreadsheet would treat as a formula.
 *
 * Prefixes a single quote, which Excel and Sheets read as "the rest is
 * literal text" and do not display. Applied ONLY to text -- see the header.
 */
export function neutraliseFormula(value: string): string {
  if (value.length === 0) return value
  return FORMULA_TRIGGERS.has(value[0]) ? `'${value}` : value
}

/** RFC 4180 field encoding. */
export function encodeCsvField(
  value: string | number | null | undefined,
  type: CsvColumnType = 'text',
): string {
  if (value == null) return ''
  let text = String(value)
  if (type === 'text') text = neutraliseFormula(text)

  const needsQuoting =
    text.includes('"') ||
    text.includes(',') ||
    text.includes('\n') ||
    text.includes('\r') ||
    // Leading or trailing whitespace survives only inside quotes, and a
    // trailing space in an account code has caused real reconciliation
    // failures.
    text !== text.trim()

  if (!needsQuoting) return text
  return `"${text.replaceAll('"', '""')}"`
}

interface Column {
  header: string
  type: CsvColumnType
  value: (row: InvoiceCsvRow, minorUnits: number) => string | number | null
}

/**
 * The column set, in order.
 *
 * One row per invoice LINE with the header fields repeated, because that is
 * the shape every accounting package can import: a package that wants totals
 * only can group, but one that wants lines cannot invent them.
 */
const COLUMNS: Array<Column> = [
  { header: 'invoice_number', type: 'number', value: (r) => r.invoice_number },
  { header: 'invoice_status', type: 'text', value: (r) => r.invoice_status },
  { header: 'currency', type: 'text', value: (r) => r.currency },
  { header: 'issued_date', type: 'date', value: (r) => isoDate(r.issued_at) },
  { header: 'due_date', type: 'date', value: (r) => isoDate(r.due_at) },
  { header: 'paid_date', type: 'date', value: (r) => isoDate(r.paid_at) },
  { header: 'payment_ref', type: 'text', value: (r) => r.payment_ref },
  { header: 'client_name', type: 'text', value: (r) => r.client_name },
  {
    header: 'client_email',
    type: 'text',
    value: (r) => r.client_billing_email,
  },
  { header: 'job_number', type: 'number', value: (r) => r.job_number },
  { header: 'job_title', type: 'text', value: (r) => r.job_title },
  { header: 'line_no', type: 'number', value: (r) => r.line_position },
  { header: 'line_kind', type: 'text', value: (r) => r.line_kind },
  { header: 'description', type: 'text', value: (r) => r.description },
  { header: 'unit', type: 'text', value: (r) => r.unit },
  { header: 'quantity', type: 'number', value: (r) => r.quantity },
  {
    header: 'unit_price',
    type: 'number',
    value: (r, m) => minorUnitsToDecimal(r.unit_price_cents, m),
  },
  {
    header: 'line_total',
    type: 'number',
    value: (r, m) => minorUnitsToDecimal(r.line_total_cents, m),
  },
  { header: 'tax_rate', type: 'number', value: (r) => r.tax_rate },
  {
    header: 'line_tax',
    type: 'number',
    value: (r, m) => minorUnitsToDecimal(r.line_tax_cents, m),
  },
]

export const CSV_HEADERS = COLUMNS.map((c) => c.header)

export interface CsvOptions {
  /**
   * Prepend a UTF-8 byte order mark. Excel on Windows assumes the system
   * codepage without it and mangles any non-ASCII client name; every other
   * consumer tolerates it. Defaults to true because the likeliest reader of
   * this file is Excel on Windows.
   */
  bom?: boolean
}

/**
 * `YYYY-MM-DD`, in UTC.
 *
 * Deliberately not the site or org timezone: an invoice date that shifts by a
 * day depending on who exported it, from where, is an audit problem. A
 * timestamp is truncated to its UTC date; a value that is already a date is
 * passed through.
 */
function isoDate(value: string | null): string | null {
  if (!value) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString().slice(0, 10)
}

export function buildInvoiceCsv(
  rows: ReadonlyArray<InvoiceCsvRow>,
  options: CsvOptions = {},
): string {
  const { bom = true } = options
  const lines = [CSV_HEADERS.join(',')]

  for (const row of rows) {
    const minorUnits = minorUnitsFor(row.currency)
    lines.push(
      COLUMNS.map((column) =>
        encodeCsvField(column.value(row, minorUnits), column.type),
      ).join(','),
    )
  }

  // CRLF per RFC 4180, and a trailing newline so the last record is
  // terminated like every other one.
  return `${bom ? '﻿' : ''}${lines.join('\r\n')}\r\n`
}

/** `riglink-invoices-2026-09-09.csv` */
export function invoiceCsvFilename(now: Date = new Date()): string {
  return `riglink-invoices-${now.toISOString().slice(0, 10)}.csv`
}
