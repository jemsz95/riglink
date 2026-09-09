import { describe, expect, it } from 'vitest'
import {
  MoneyFormatError,
  centsToInput,
  computeLine,
  computeTotals,
  inputToCents,
  isMoneyInput,
  isQuantityInput,
  parseScaled,
  roundDivAwayFromZero,
} from './totals'
import { QUOTE_HEADER_FIXTURE, TOTALS_FIXTURES } from './totals.fixtures'

describe('agreement with Postgres', () => {
  // The expectations come from the database's numeric engine, so a failure
  // here means the client and the generated columns disagree about money --
  // the exact defect this module exists to prevent.
  it.each(TOTALS_FIXTURES)(
    'matches the database for $label',
    ({ quantity, unitPriceCents, taxRate, lineTotalCents, lineTaxCents }) => {
      expect(computeLine({ quantity, unitPriceCents, taxRate })).toEqual({
        lineTotalCents,
        lineTaxCents,
      })
    },
  )

  it('matches the header totals the trigger computed for a mixed quote', () => {
    const totals = computeTotals(QUOTE_HEADER_FIXTURE.lines)
    expect(totals.subtotalCents).toBe(QUOTE_HEADER_FIXTURE.subtotalCents)
    expect(totals.taxCents).toBe(QUOTE_HEADER_FIXTURE.taxCents)
    expect(totals.totalCents).toBe(QUOTE_HEADER_FIXTURE.totalCents)
  })
})

describe('the two ways a naive port goes wrong', () => {
  // Documented as executable proof, so the reason for the BigInt machinery is
  // visible rather than folklore.
  it('rounds negative halves the way Postgres does, not the way Math.round does', () => {
    expect(
      computeLine({ quantity: '-0.5', unitPriceCents: 1, taxRate: '0' }),
    ).toEqual({ lineTotalCents: -1, lineTaxCents: 0 })
    expect(Math.round(-0.5)).toBe(-0) // what a naive port would produce
  })

  it('is immune to the binary float representation of 1.005', () => {
    expect(
      computeLine({ quantity: '1.005', unitPriceCents: 100, taxRate: '0' })
        .lineTotalCents,
    ).toBe(101)
    expect(Math.round(1.005 * 100)).toBe(100) // what a naive port would produce
  })
})

describe('parseScaled', () => {
  it('scales without floating point', () => {
    expect(parseScaled('3.333', 3)).toBe(3333n)
    expect(parseScaled('1.005', 3)).toBe(1005n)
    expect(parseScaled('-0.5', 3)).toBe(-500n)
    expect(parseScaled('7', 3)).toBe(7000n)
    expect(parseScaled('.5', 3)).toBe(500n)
    expect(parseScaled('0.0825', 4)).toBe(825n)
  })

  it('treats an empty field as zero, so a half-typed row does not throw', () => {
    expect(parseScaled('', 3)).toBe(0n)
    expect(parseScaled('   ', 3)).toBe(0n)
  })

  // Truncating here would quietly change the price. Better to refuse.
  it('refuses more decimal places than the column can store', () => {
    expect(() => parseScaled('1.2345', 3)).toThrow(MoneyFormatError)
    expect(() => parseScaled('0.00005', 4)).toThrow(MoneyFormatError)
  })

  it('refuses text that is not a decimal number', () => {
    expect(() => parseScaled('1.2.3', 3)).toThrow(MoneyFormatError)
    expect(() => parseScaled('abc', 3)).toThrow(MoneyFormatError)
    expect(() => parseScaled('1e3', 3)).toThrow(MoneyFormatError)
    expect(() => parseScaled('.', 3)).toThrow(MoneyFormatError)
  })
})

describe('roundDivAwayFromZero', () => {
  it('rounds halves away from zero in both directions', () => {
    expect(roundDivAwayFromZero(5n, 2n)).toBe(3n)
    expect(roundDivAwayFromZero(-5n, 2n)).toBe(-3n)
    expect(roundDivAwayFromZero(1n, 2n)).toBe(1n)
    expect(roundDivAwayFromZero(-1n, 2n)).toBe(-1n)
  })

  it('leaves exact division alone', () => {
    expect(roundDivAwayFromZero(4n, 2n)).toBe(2n)
    expect(roundDivAwayFromZero(-4n, 2n)).toBe(-2n)
    expect(roundDivAwayFromZero(0n, 7n)).toBe(0n)
  })

  it('rounds below the halfway point toward zero', () => {
    expect(roundDivAwayFromZero(4n, 3n)).toBe(1n)
    expect(roundDivAwayFromZero(-4n, 3n)).toBe(-1n)
  })

  it('refuses a non-positive divisor rather than returning nonsense', () => {
    expect(() => roundDivAwayFromZero(1n, 0n)).toThrow(MoneyFormatError)
    expect(() => roundDivAwayFromZero(1n, -2n)).toThrow(MoneyFormatError)
  })
})

describe('computeTotals', () => {
  it('returns zeroes for an empty quote rather than NaN', () => {
    expect(computeTotals([])).toEqual({
      subtotalCents: 0,
      taxCents: 0,
      totalCents: 0,
      lines: [],
    })
  })

  // Sums per-line rounded tax rather than re-deriving tax from the subtotal:
  // three lines of 5c at 50% are 3+3+3 = 9, not round(15 * 0.5) = 8.
  it('sums per-line tax instead of taxing the subtotal', () => {
    const totals = computeTotals([
      { quantity: '1', unitPriceCents: 5, taxRate: '0.5' },
      { quantity: '1', unitPriceCents: 5, taxRate: '0.5' },
      { quantity: '1', unitPriceCents: 5, taxRate: '0.5' },
    ])
    expect(totals.subtotalCents).toBe(15)
    expect(totals.taxCents).toBe(9)
    expect(totals.totalCents).toBe(24)
  })

  it('handles mixed tax rates on one document', () => {
    const totals = computeTotals([
      { quantity: '2', unitPriceCents: 10000, taxRate: '0.20' },
      { quantity: '1', unitPriceCents: 5000, taxRate: '0' },
    ])
    expect(totals).toMatchObject({
      subtotalCents: 25000,
      taxCents: 4000,
      totalCents: 29000,
    })
  })

  it('refuses a fractional unit price instead of rounding it silently', () => {
    expect(() =>
      computeTotals([{ quantity: '1', unitPriceCents: 10.5, taxRate: '0' }]),
    ).toThrow(MoneyFormatError)
  })

  it('refuses to return a total that a JS number cannot hold exactly', () => {
    // ~1e17 cents, comfortably past 2^53. Past that boundary a JS number stops
    // being exact silently, which is the one failure mode worse than throwing.
    expect(() =>
      computeTotals([
        { quantity: '999999999.999', unitPriceCents: 99999999, taxRate: '0' },
      ]),
    ).toThrow(MoneyFormatError)
  })

  it('still computes exactly just below that boundary', () => {
    const totals = computeTotals([
      { quantity: '1000.000', unitPriceCents: 9_000_000_000, taxRate: '0' },
    ])
    expect(totals.totalCents).toBe(9_000_000_000_000)
  })
})

describe('centsToInput', () => {
  it('always shows two decimal places', () => {
    expect(centsToInput(1250)).toBe('12.50')
    expect(centsToInput(1234)).toBe('12.34')
    expect(centsToInput(0)).toBe('0.00')
    expect(centsToInput(5)).toBe('0.05')
    expect(centsToInput(99)).toBe('0.99')
    expect(centsToInput(100)).toBe('1.00')
  })

  it('keeps the sign on a discount', () => {
    expect(centsToInput(-2550)).toBe('-25.50')
    expect(centsToInput(-5)).toBe('-0.05')
  })

  it('refuses a fractional cent rather than displaying a rounded lie', () => {
    expect(() => centsToInput(10.5)).toThrow(MoneyFormatError)
  })
})

describe('inputToCents', () => {
  it('parses what people type', () => {
    expect(inputToCents('12.34')).toBe(1234)
    expect(inputToCents('12')).toBe(1200)
    expect(inputToCents('.5')).toBe(50)
    expect(inputToCents('0.05')).toBe(5)
    expect(inputToCents('-3.20')).toBe(-320)
    expect(inputToCents('  7.5  ')).toBe(750)
  })

  it('accepts thousands separators', () => {
    expect(inputToCents('1,234.56')).toBe(123456)
  })

  // Rejecting these mid-typing makes the field feel broken.
  it('treats half-typed input as zero rather than an error', () => {
    expect(inputToCents('')).toBe(0)
    expect(inputToCents('-')).toBe(0)
    expect(inputToCents('12.')).toBe(1200)
  })

  it('refuses a third decimal place instead of dropping it', () => {
    expect(() => inputToCents('12.345')).toThrow(MoneyFormatError)
  })

  it('round-trips with centsToInput', () => {
    for (const cents of [0, 1, 99, 100, 1234, -2550, 123456789]) {
      expect(inputToCents(centsToInput(cents))).toBe(cents)
    }
  })

  // The reason this module exists rather than parseFloat.
  it('does not lose the cent that parseFloat loses', () => {
    expect(inputToCents('12.34')).toBe(1234)
    expect(Math.round(Number.parseFloat('4.815') * 1000)).toBe(4815)
    expect(inputToCents('0.07')).toBe(7)
    // parseFloat('0.07') * 100 is 7.000000000000001
    expect(Number.parseFloat('0.07') * 100).not.toBe(7)
  })
})

describe('input validity predicates', () => {
  it('accepts in-progress money text', () => {
    for (const text of ['', '-', '12', '12.', '12.3', '12.34', '-0.05']) {
      expect(isMoneyInput(text)).toBe(true)
    }
  })

  it('rejects money text the column cannot hold', () => {
    expect(isMoneyInput('12.345')).toBe(false)
    expect(isMoneyInput('abc')).toBe(false)
  })

  it('allows three decimal places on a quantity but not four', () => {
    expect(isQuantityInput('3.333')).toBe(true)
    expect(isQuantityInput('3.3333')).toBe(false)
    expect(isQuantityInput('')).toBe(true)
    expect(isQuantityInput('2.')).toBe(true)
  })
})
