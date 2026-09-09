/**
 * Formatting is centralised because the same value must render identically in a
 * table cell, a card, a quote PDF and a CSV export. Three surfaces disagreeing
 * about a date or a total is the kind of bug customers never forgive.
 */

/**
 * Money is stored as integer cents everywhere. Never divide before formatting
 * and never let a float near a total -- `Intl` takes the minor unit directly.
 */
export function formatMoney(
  cents: number,
  currency: string,
  locale?: string,
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
  }).format(cents / 100)
}

/**
 * A site's own timezone wins over the org's: a job at a site two zones away
 * would otherwise show the wrong local time to the tech standing in it.
 */
export function formatDate(
  value: string | null | undefined,
  timezone?: string | null,
  locale?: string,
): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeZone: timezone ?? undefined,
  }).format(date)
}

export function formatDateTime(
  value: string | null | undefined,
  timezone?: string | null,
  locale?: string,
): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: timezone ?? undefined,
  }).format(date)
}

const RELATIVE_UNITS: ReadonlyArray<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 365 * 24 * 60 * 60_000],
  ['month', 30 * 24 * 60 * 60_000],
  ['week', 7 * 24 * 60 * 60_000],
  ['day', 24 * 60 * 60_000],
  ['hour', 60 * 60_000],
  ['minute', 60_000],
]

/**
 * "3 days ago" for activity feeds and last-touched columns.
 *
 * `now` is injectable so tests are not time-dependent -- a relative formatter
 * tested against the real clock fails at midnight and nobody knows why.
 */
export function formatRelative(
  value: string | null | undefined,
  now: Date = new Date(),
  locale?: string,
): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'

  const deltaMs = date.getTime() - now.getTime()
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })

  for (const [unit, ms] of RELATIVE_UNITS) {
    if (Math.abs(deltaMs) >= ms) {
      return formatter.format(Math.round(deltaMs / ms), unit)
    }
  }
  return formatter.format(Math.round(deltaMs / 1000), 'second')
}

/** `#1043` -- the number a client quotes back to you on the phone. */
export function formatJobNumber(value: number): string {
  return `#${value}`
}

/** Falls back to an em dash rather than rendering "null" or an empty cell. */
export function orDash(value: string | null | undefined): string {
  const trimmed = value?.trim()
  return trimmed ? trimmed : '—'
}

/** Single-line address for a table cell, from the sites.address jsonb blob. */
export function formatAddressLine(address: unknown): string {
  if (!address || typeof address !== 'object') return '—'
  const parts = ['line1', 'line2', 'city', 'region', 'postcode']
    .map((key) => (address as Record<string, unknown>)[key])
    .filter((part): part is string => typeof part === 'string' && part !== '')
  return parts.length > 0 ? parts.join(', ') : '—'
}
