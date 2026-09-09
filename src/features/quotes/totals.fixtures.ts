/**
 * Expected values produced by POSTGRES, not by this codebase.
 *
 * Every row below was computed by running the generated columns' own
 * expressions against the live project's numeric engine:
 *
 *     round(quantity * unit_price_cents)
 *     round(round(quantity * unit_price_cents) * tax_rate)
 *
 * That is what makes `totals.test.ts` a cross-engine agreement test rather
 * than a restatement of the TypeScript implementation. A case only earns a
 * place here if it can distinguish the two engines or catch a plausible
 * regression -- half-cents in both directions, the classic binary-float
 * traps, four-decimal tax rates, and magnitudes near the safe-integer edge.
 *
 * To regenerate after a formula change, run the same SELECT against the
 * database and paste the results; do not hand-edit an expectation to make a
 * failing test pass, because the database is the authority here.
 */
export interface TotalsFixture {
  label: string
  quantity: string
  unitPriceCents: number
  taxRate: string
  /** From Postgres. */
  lineTotalCents: number
  /** From Postgres. */
  lineTaxCents: number
}

export const TOTALS_FIXTURES: ReadonlyArray<TotalsFixture> = [
  {
    label: 'exact whole',
    quantity: '1.000',
    unitPriceCents: 1000,
    taxRate: '0.0000',
    lineTotalCents: 1000,
    lineTaxCents: 0,
  },
  {
    label: 'third of a unit',
    quantity: '3.333',
    unitPriceCents: 1999,
    taxRate: '0.2000',
    lineTotalCents: 6663,
    lineTaxCents: 1333,
  },
  {
    label: 'half cent rounds up',
    quantity: '0.500',
    unitPriceCents: 1,
    taxRate: '0.0000',
    lineTotalCents: 1,
    lineTaxCents: 0,
  },
  // Math.round(-0.5) is -0 in JS; Postgres gives -1.
  {
    label: 'negative half rounds away',
    quantity: '-0.500',
    unitPriceCents: 1,
    taxRate: '0.0000',
    lineTotalCents: -1,
    lineTaxCents: 0,
  },
  {
    label: 'discount line',
    quantity: '1.000',
    unitPriceCents: -2550,
    taxRate: '0.2000',
    lineTotalCents: -2550,
    lineTaxCents: -510,
  },
  {
    label: 'negative qty and price',
    quantity: '-2.000',
    unitPriceCents: -1250,
    taxRate: '0.2000',
    lineTotalCents: 2500,
    lineTaxCents: 500,
  },
  // 1.005 * 100 is 100.49999999999999 in binary float, so Math.round gives 100.
  {
    label: '1.005 float trap',
    quantity: '1.005',
    unitPriceCents: 100,
    taxRate: '0.0000',
    lineTotalCents: 101,
    lineTaxCents: 0,
  },
  // 2.675 * 100 is 267.49999999999994 in binary float.
  {
    label: '2.675 float trap',
    quantity: '2.675',
    unitPriceCents: 100,
    taxRate: '0.0000',
    lineTotalCents: 268,
    lineTaxCents: 0,
  },
  {
    label: 'tax half cent',
    quantity: '1.000',
    unitPriceCents: 5,
    taxRate: '0.5000',
    lineTotalCents: 5,
    lineTaxCents: 3,
  },
  {
    label: 'tax on negative half',
    quantity: '1.000',
    unitPriceCents: -5,
    taxRate: '0.5000',
    lineTotalCents: -5,
    lineTaxCents: -3,
  },
  {
    label: 'four dp tax rate',
    quantity: '7.000',
    unitPriceCents: 1234,
    taxRate: '0.0825',
    lineTotalCents: 8638,
    lineTaxCents: 713,
  },
  {
    label: 'tiny qty',
    quantity: '0.001',
    unitPriceCents: 99999,
    taxRate: '0.2000',
    lineTotalCents: 100,
    lineTaxCents: 20,
  },
  {
    label: 'big qty',
    quantity: '999999.999',
    unitPriceCents: 9999,
    taxRate: '0.1750',
    lineTotalCents: 9998999990,
    lineTaxCents: 1749824998,
  },
  {
    label: 'zero price',
    quantity: '5.000',
    unitPriceCents: 0,
    taxRate: '0.2000',
    lineTotalCents: 0,
    lineTaxCents: 0,
  },
  {
    label: 'zero tax on big line',
    quantity: '120.500',
    unitPriceCents: 45000,
    taxRate: '0.0000',
    lineTotalCents: 5422500,
    lineTaxCents: 0,
  },
  {
    label: 'odd cent with tax',
    quantity: '3.000',
    unitPriceCents: 333,
    taxRate: '0.0700',
    lineTotalCents: 999,
    lineTaxCents: 70,
  },
  {
    label: 'rounds to zero',
    quantity: '0.001',
    unitPriceCents: 1,
    taxRate: '0.2000',
    lineTotalCents: 0,
    lineTaxCents: 0,
  },
  {
    label: 'negative rounds to zero',
    quantity: '-0.001',
    unitPriceCents: 1,
    taxRate: '0.2000',
    lineTotalCents: 0,
    lineTaxCents: 0,
  },
]

/**
 * The three-line mixed quote used by the header-total test, with the values
 * the database's own trigger produced for it.
 */
export const QUOTE_HEADER_FIXTURE = {
  lines: [
    { quantity: '3.333', unitPriceCents: 1999, taxRate: '0.20' },
    { quantity: '2.500', unitPriceCents: 8500, taxRate: '0.20' },
    { quantity: '1', unitPriceCents: -2550, taxRate: '0.20' },
  ],
  subtotalCents: 25363,
  taxCents: 5073,
  totalCents: 30436,
} as const
