import { describe, expect, it } from 'vitest'
import {
  JOB_LIST_DEFAULTS,
  hasActiveJobFilters,
  jobListSearchSchema,
  pageCount,
  pageRange,
  stripJobListDefaults,
} from './filters'
import { escapeOrFilterTerm } from './queries'

const UUID = '3f0c2a1e-7b4d-4c8a-9e2f-1a2b3c4d5e6f'

describe('jobListSearchSchema', () => {
  it('fills every field from an empty URL', () => {
    expect(jobListSearchSchema.parse({})).toEqual(JOB_LIST_DEFAULTS)
  })

  // People bookmark and paste filtered list URLs. A link that throws an error
  // boundary after the filter vocabulary changes is a support ticket, so every
  // field catches rather than rejects.
  it('degrades a hand-edited or stale URL to the default view', () => {
    const parsed = jobListSearchSchema.parse({
      status: ['not_a_status'],
      sort: 'internal_notes',
      dir: 'sideways',
      page: -4,
      size: 9999,
      client: 'not-a-uuid',
    })
    expect(parsed).toEqual(JOB_LIST_DEFAULTS)
  })

  it('refuses a sort column outside the whitelist', () => {
    // Ordering is an oracle: it leaks the relative content of a column the
    // portal is never shown, so the set is closed.
    expect(jobListSearchSchema.parse({ sort: 'internal_notes' }).sort).toBe(
      'updated_at',
    )
    expect(jobListSearchSchema.parse({ sort: 'number' }).sort).toBe('number')
  })

  it('accepts only the offered page sizes', () => {
    expect(jobListSearchSchema.parse({ size: 50 }).size).toBe(50)
    expect(jobListSearchSchema.parse({ size: 30 }).size).toBe(25)
  })

  it('coerces the numeric params a URL delivers as strings', () => {
    const parsed = jobListSearchSchema.parse({ page: '3', size: '100' })
    expect(parsed.page).toBe(3)
    expect(parsed.size).toBe(100)
  })

  it('keeps a valid multi-status filter', () => {
    expect(
      jobListSearchSchema.parse({ status: ['quoted', 'approved'] }).status,
    ).toEqual(['quoted', 'approved'])
  })

  it('trims the search term', () => {
    expect(jobListSearchSchema.parse({ q: '  boiler  ' }).q).toBe('boiler')
  })
})

describe('stripJobListDefaults', () => {
  it('writes nothing to the URL for a default view', () => {
    expect(stripJobListDefaults(JOB_LIST_DEFAULTS)).toEqual({})
  })

  it('keeps only what actually narrows or reorders the list', () => {
    expect(
      stripJobListDefaults({
        ...JOB_LIST_DEFAULTS,
        status: ['quoted'],
        page: 2,
        q: 'boiler',
      }),
    ).toEqual({ status: ['quoted'], page: 2, q: 'boiler' })
  })

  it('drops an empty status array rather than serialising []', () => {
    expect(stripJobListDefaults({ status: [] })).toEqual({})
  })

  it('round-trips through the schema unchanged', () => {
    const filters = jobListSearchSchema.parse({
      status: ['in_progress'],
      sort: 'number',
      dir: 'asc',
      page: 4,
      client: UUID,
    })
    expect(jobListSearchSchema.parse(stripJobListDefaults(filters))).toEqual(
      filters,
    )
  })
})

describe('hasActiveJobFilters', () => {
  it('ignores sort and pagination', () => {
    const filters = jobListSearchSchema.parse({ sort: 'number', page: 3 })
    expect(hasActiveJobFilters(filters)).toBe(false)
  })

  it('notices each narrowing filter', () => {
    expect(
      hasActiveJobFilters(jobListSearchSchema.parse({ status: ['quoted'] })),
    ).toBe(true)
    expect(hasActiveJobFilters(jobListSearchSchema.parse({ q: 'x' }))).toBe(
      true,
    )
    expect(
      hasActiveJobFilters(jobListSearchSchema.parse({ client: UUID })),
    ).toBe(true)
    expect(hasActiveJobFilters(jobListSearchSchema.parse({ site: UUID }))).toBe(
      true,
    )
  })
})

describe('pagination arithmetic', () => {
  it('converts a 1-based page to an inclusive PostgREST range', () => {
    expect(pageRange(1, 25)).toEqual({ from: 0, to: 24 })
    expect(pageRange(2, 25)).toEqual({ from: 25, to: 49 })
    expect(pageRange(3, 100)).toEqual({ from: 200, to: 299 })
  })

  it('never reports zero pages, so the pager always has a page 1', () => {
    expect(pageCount(0, 25)).toBe(1)
    expect(pageCount(1, 25)).toBe(1)
    expect(pageCount(25, 25)).toBe(1)
    expect(pageCount(26, 25)).toBe(2)
  })
})

describe('escapeOrFilterTerm', () => {
  // Verified against the live API: an unquoted comma fails the PostgREST logic
  // tree parse with PGRST100, so `boiler, room` would error instead of
  // returning results. The call site wraps the term in double quotes; this
  // escapes what would end them early.
  it('escapes the characters that would break out of the quoted term', () => {
    expect(escapeOrFilterTerm('say "hi"')).toBe('say \\"hi\\"')
    expect(escapeOrFilterTerm('a\\b')).toBe('a\\\\b')
  })

  it('leaves a comma alone -- quoting is what makes it safe', () => {
    expect(escapeOrFilterTerm('boiler, room')).toBe('boiler, room')
  })

  it('leaves % alone, where a wildcard is the useful behaviour', () => {
    expect(escapeOrFilterTerm('100%')).toBe('100%')
  })
})
