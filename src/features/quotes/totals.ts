/**
 * Quote and invoice arithmetic. The single source of truth on the client.
 *
 * This module mirrors, exactly, the formulas in
 * `20260909161713_quotes_and_approvals.sql`:
 *
 *     line_total_cents = round(quantity * unit_price_cents)
 *     line_tax_cents   = round(line_total_cents * tax_rate)
 *     subtotal         = sum(line_total_cents)
 *     tax              = sum(line_tax_cents)
 *     total            = subtotal + tax
 *
 * Two properties of Postgres `numeric` make a naive JS port wrong, and both
 * are verified against the live database in `totals.fixtures.ts`:
 *
 * 1. `round()` on numeric is HALF AWAY FROM ZERO. `round(-2.5) = -3`, whereas
 *    `Math.round(-2.5) = -2`. Discount lines are negative, so this is not
 *    academic -- it is a one-cent disagreement between the quote the client
 *    approved and the invoice they receive.
 *
 * 2. `numeric` is exact decimal. `round(1.005 * 100) = 101` in Postgres, but
 *    `Math.round(1.005 * 100) = 100` in JS because 1.005 is not representable
 *    in binary floating point. Any `parseFloat` here reintroduces that error,
 *    which is why quantities and rates are parsed to integers and every
 *    multiplication runs in BigInt.
 */

/** Decimal places on `quote_line_items.quantity` -- numeric(12,3). */
const QUANTITY_SCALE = 3
/** Decimal places on `quote_line_items.tax_rate` -- numeric(6,4). */
const TAX_RATE_SCALE = 4

export class MoneyFormatError extends Error {}

/**
 * Parses a decimal string into a scaled integer WITHOUT floating point.
 *
 * `"3.333"` at scale 3 becomes `3333n`. Rejects more decimal places than the
 * column can hold rather than silently truncating, because a silently
 * truncated quantity is a silently wrong price.
 */
export function parseScaled(value: string | number, scale: number): bigint {
  const text =
    typeof value === 'number' ? numberToDecimalString(value) : value.trim()
  if (text === '') return 0n

  const match = /^([+-]?)(\d*)(?:\.(\d*))?$/.exec(text)
  if (!match) throw new MoneyFormatError(`not a decimal number: ${text}`)

  const [, sign, whole = '', fraction = ''] = match
  if (whole === '' && fraction === '') {
    throw new MoneyFormatError(`not a decimal number: ${text}`)
  }
  if (fraction.length > scale) {
    throw new MoneyFormatError(
      `${text} has more than ${scale} decimal places, which the column cannot store`,
    )
  }

  const padded = fraction.padEnd(scale, '0')
  const magnitude = BigInt((whole === '' ? '0' : whole) + padded)
  return sign === '-' ? -magnitude : magnitude
}

/**
 * A JS number reaches here only from a control that already holds a number
 * (a stepper, a fixture). `toFixed` is safe for that: it is decimal-correct
 * for the magnitudes money uses, unlike arithmetic on the same value.
 */
function numberToDecimalString(value: number): string {
  if (!Number.isFinite(value)) {
    throw new MoneyFormatError(`not a finite number: ${value}`)
  }
  // 6 is above both column scales, so nothing legitimate is lost; parseScaled
  // then rejects anything that really does need more places.
  return stripTrailingZeros(value.toFixed(6))
}

function stripTrailingZeros(text: string): string {
  return text.includes('.') ? text.replace(/\.?0+$/, '') : text
}

/**
 * Integer division rounding halves AWAY FROM ZERO, matching Postgres.
 *
 * `divisor` must be positive; the sign of the result follows the dividend.
 */
export function roundDivAwayFromZero(
  dividend: bigint,
  divisor: bigint,
): bigint {
  if (divisor <= 0n) throw new MoneyFormatError('divisor must be positive')

  const quotient = dividend / divisor // BigInt division truncates toward zero
  const remainder = dividend % divisor
  if (remainder === 0n) return quotient

  const twiceRemainder = remainder < 0n ? -remainder * 2n : remainder * 2n
  if (twiceRemainder < divisor) return quotient
  return dividend < 0n ? quotient - 1n : quotient + 1n
}

export interface LineInput {
  /** Decimal string or number, at most 3 decimal places. */
  quantity: string | number
  /** Integer cents. Negative for a discount or credit line. */
  unitPriceCents: number
  /** Decimal 0..1, at most 4 decimal places. */
  taxRate: string | number
}

export interface LineTotals {
  lineTotalCents: number
  lineTaxCents: number
}

/** One line, computed the way the generated columns compute it. */
export function computeLine(line: LineInput): LineTotals {
  if (!Number.isInteger(line.unitPriceCents)) {
    throw new MoneyFormatError(
      `unitPriceCents must be an integer, got ${line.unitPriceCents}`,
    )
  }

  const quantity = parseScaled(line.quantity, QUANTITY_SCALE)
  const taxRate = parseScaled(line.taxRate, TAX_RATE_SCALE)
  const price = BigInt(line.unitPriceCents)

  const lineTotal = roundDivAwayFromZero(
    quantity * price,
    10n ** BigInt(QUANTITY_SCALE),
  )
  const lineTax = roundDivAwayFromZero(
    lineTotal * taxRate,
    10n ** BigInt(TAX_RATE_SCALE),
  )

  return {
    lineTotalCents: toSafeNumber(lineTotal),
    lineTaxCents: toSafeNumber(lineTax),
  }
}

export interface QuoteTotals {
  subtotalCents: number
  taxCents: number
  totalCents: number
  lines: Array<LineTotals>
}

/**
 * The whole document.
 *
 * Tax is the sum of per-line rounded tax, NOT tax recomputed on the subtotal:
 * the client is taxed on the amounts actually charged, and re-deriving from
 * the subtotal can round differently and put the printed quote a cent away
 * from the database.
 */
export function computeTotals(lines: ReadonlyArray<LineInput>): QuoteTotals {
  let subtotal = 0n
  let tax = 0n
  const computed: Array<LineTotals> = []

  for (const line of lines) {
    const result = computeLine(line)
    computed.push(result)
    subtotal += BigInt(result.lineTotalCents)
    tax += BigInt(result.lineTaxCents)
  }

  return {
    subtotalCents: toSafeNumber(subtotal),
    taxCents: toSafeNumber(tax),
    totalCents: toSafeNumber(subtotal + tax),
    lines: computed,
  }
}

/**
 * BigInt is used for the arithmetic; the result crosses back to `number`
 * because that is what the DB's bigint columns deserialise to over JSON. The
 * guard is real: past 2^53 a JS number silently stops being exact, and
 * silently-wrong money is the failure this whole module exists to prevent.
 */
function toSafeNumber(value: bigint): number {
  if (
    value > BigInt(Number.MAX_SAFE_INTEGER) ||
    value < -BigInt(Number.MAX_SAFE_INTEGER)
  ) {
    throw new MoneyFormatError(
      `${value} cents exceeds the exact range of a JS number`,
    )
  }
  return Number(value)
}

/**
 * Integer cents -> the text a money input shows. Always two decimal places,
 * so a field never displays "12.5" for $12.50.
 */
export function centsToInput(cents: number): string {
  if (!Number.isInteger(cents)) {
    throw new MoneyFormatError(`cents must be an integer, got ${cents}`)
  }
  const negative = cents < 0
  const digits = String(Math.abs(cents)).padStart(3, '0')
  const whole = digits.slice(0, -2)
  const fraction = digits.slice(-2)
  return `${negative ? '-' : ''}${whole}.${fraction}`
}

/**
 * The text a money input holds -> integer cents.
 *
 * Deliberately NOT parseFloat: `parseFloat('12.345') * 100` is 1234.4999...
 * and a naive round then loses or gains a cent depending on the value. This
 * goes through exact decimal parsing and refuses a third decimal place rather
 * than silently discarding it.
 *
 * Accepts the shapes people actually type -- "12", "12.", ".5", "-3.20",
 * "1,234.56" -- because rejecting a trailing dot mid-typing makes the field
 * feel broken.
 */
export function inputToCents(text: string): number {
  const cleaned = text.trim().replace(/,/g, '')
  if (cleaned === '' || cleaned === '-') return 0
  // A trailing separator is a half-typed number, not an error.
  const normalised = cleaned.endsWith('.') ? cleaned.slice(0, -1) : cleaned
  return Number(parseScaled(normalised, 2))
}

/** True when the text is something `inputToCents` can accept. */
export function isMoneyInput(text: string): boolean {
  try {
    inputToCents(text)
    return true
  } catch {
    return false
  }
}

/** True when the text is a quantity the column can store. */
export function isQuantityInput(text: string): boolean {
  const cleaned = text.trim()
  if (cleaned === '' || cleaned === '-' || cleaned.endsWith('.')) return true
  try {
    parseScaled(cleaned, 3)
    return true
  } catch {
    return false
  }
}
