import { describe, expect, it } from 'vitest'
import {
  formatAddressLine,
  formatDate,
  formatDateTime,
  formatJobNumber,
  formatMoney,
  formatRelative,
  orDash,
} from './index'

describe('formatMoney', () => {
  it('treats the input as integer cents', () => {
    expect(formatMoney(123456, 'USD', 'en-US')).toBe('$1,234.56')
  })

  it('renders zero rather than an empty string', () => {
    expect(formatMoney(0, 'USD', 'en-US')).toBe('$0.00')
  })

  it('renders a credit with a sign', () => {
    expect(formatMoney(-5000, 'USD', 'en-US')).toBe('-$50.00')
  })

  it('respects the org currency', () => {
    // \u00a0, not a space: Intl separates the amount from the symbol with a
    // non-breaking space, and a plain space here fails while looking identical.
    expect(formatMoney(100000, 'EUR', 'de-DE')).toBe('1.000,00\u00a0€')
  })

  // A cent is not divisible. If this ever rounds, a quote and its invoice can
  // differ by a penny and the client is right to distrust both.
  it('does not lose the last cent', () => {
    expect(formatMoney(1, 'USD', 'en-US')).toBe('$0.01')
    expect(formatMoney(999999999, 'USD', 'en-US')).toBe('$9,999,999.99')
  })
})

describe('formatDate', () => {
  it('formats in the requested timezone, not the runner timezone', () => {
    // 01:30 UTC is still the previous day in New York. A site-local formatter
    // that ignores the zone shows the tech the wrong day.
    expect(formatDate('2026-03-10T01:30:00Z', 'UTC', 'en-US')).toBe(
      'Mar 10, 2026',
    )
    expect(
      formatDate('2026-03-10T01:30:00Z', 'America/New_York', 'en-US'),
    ).toBe('Mar 9, 2026')
  })

  it('returns a dash for null and for garbage', () => {
    expect(formatDate(null)).toBe('—')
    expect(formatDate(undefined)).toBe('—')
    expect(formatDate('not a date')).toBe('—')
  })
})

describe('formatDateTime', () => {
  it('includes the time', () => {
    expect(formatDateTime('2026-03-10T14:05:00Z', 'UTC', 'en-US')).toBe(
      'Mar 10, 2026, 2:05 PM',
    )
  })
})

describe('formatRelative', () => {
  const now = new Date('2026-03-10T12:00:00Z')

  it('describes the past', () => {
    expect(formatRelative('2026-03-07T12:00:00Z', now, 'en-US')).toBe(
      '3 days ago',
    )
  })

  it('describes the future', () => {
    expect(formatRelative('2026-03-12T12:00:00Z', now, 'en-US')).toBe(
      'in 2 days',
    )
  })

  it('uses the coarsest fitting unit', () => {
    expect(formatRelative('2025-03-10T12:00:00Z', now, 'en-US')).toBe(
      'last year',
    )
    expect(formatRelative('2026-03-10T11:00:00Z', now, 'en-US')).toBe(
      '1 hour ago',
    )
  })

  it('falls through to seconds rather than dividing by zero', () => {
    expect(formatRelative('2026-03-10T11:59:30Z', now, 'en-US')).toBe(
      '30 seconds ago',
    )
  })
})

describe('orDash and formatJobNumber', () => {
  it('treats whitespace as absent', () => {
    expect(orDash('   ')).toBe('—')
    expect(orDash(null)).toBe('—')
    expect(orDash(' Boiler room ')).toBe('Boiler room')
  })

  it('prefixes the job number the way clients read it back', () => {
    expect(formatJobNumber(1043)).toBe('#1043')
  })
})

describe('formatAddressLine', () => {
  it('joins the parts that exist', () => {
    expect(
      formatAddressLine({
        line1: '12 Mill St',
        city: 'Leeds',
        postcode: 'LS1',
      }),
    ).toBe('12 Mill St, Leeds, LS1')
  })

  it('survives the jsonb column being null, empty or the wrong shape', () => {
    expect(formatAddressLine(null)).toBe('—')
    expect(formatAddressLine({})).toBe('—')
    expect(formatAddressLine('12 Mill St')).toBe('—')
    expect(formatAddressLine({ line1: '', city: null })).toBe('—')
  })
})
