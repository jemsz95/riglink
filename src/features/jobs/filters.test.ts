import { describe, expect, it } from 'vitest'
import {
  JOB_LIST_DEFAULTS,
  hasActiveJobFilters,
  jobListSearchSchema,
  pageCount,
  pageRange,
  stripJobListDefaults,
} from './filters'
import { toSearchPattern } from './queries'

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

describe('toSearchPattern', () => {
  // The whole reason `escapeOrFilterTerm` existed was that a comma inside a
  // PostgREST `or` term breaks the logic-tree parse with PGRST100. Search is
  // now a single ILIKE against one `search_text` column, so there is no logic
  // tree to break and nothing to escape.
  it('leaves a comma alone -- there is no longer a logic tree to break', () => {
    expect(toSearchPattern('boiler, room')).toBe('%boiler, room%')
  })

  it('leaves quotes and backslashes alone', () => {
    expect(toSearchPattern('say "hi"')).toBe('%say "hi"%')
    expect(toSearchPattern('a\\b')).toBe('%a\\b%')
  })

  it('leaves % alone, where a wildcard is the useful behaviour', () => {
    expect(toSearchPattern('100%')).toBe('%100%%')
  })

  // Job numbers are rendered as #1043 and get pasted back in that form.
  it('drops a leading # so a pasted job number matches', () => {
    expect(toSearchPattern('#1043')).toBe('%1043%')
    expect(toSearchPattern('  #1043  ')).toBe('%1043%')
  })

  it('keeps a # that is not leading', () => {
    expect(toSearchPattern('unit #4 boiler')).toBe('%unit #4 boiler%')
  })
})
