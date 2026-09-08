import { describe, expect, it } from 'vitest'
import {
  isCheckViolation,
  isForbiddenError,
  isStaleClaimsError,
  toUserMessage,
} from '@/lib/supabase/errors'
import { EXPECTED_CLAIMS_VERSION, needsClaimsRefresh } from './session-store'

const staleClaims = {
  code: 'P0001',
  message: 'stale authorization claims (token epoch 1, current 2)',
  hint: 'refresh_session',
  details: '',
}

describe('isStaleClaimsError', () => {
  it('recognises the epoch gate by code and hint', () => {
    expect(isStaleClaimsError(staleClaims)).toBe(true)
  })

  it('recognises it by message when the hint is stripped', () => {
    expect(isStaleClaimsError({ ...staleClaims, hint: '' })).toBe(true)
  })

  it('does not fire on other P0001 errors', () => {
    expect(
      isStaleClaimsError({
        code: 'P0001',
        message: 'something else',
        hint: '',
        details: '',
      }),
    ).toBe(false)
  })

  it('is safe on non-Postgrest values', () => {
    expect(isStaleClaimsError(new Error('boom'))).toBe(false)
    expect(isStaleClaimsError(null)).toBe(false)
    expect(isStaleClaimsError(undefined)).toBe(false)
  })
})

describe('error taxonomy', () => {
  it('maps the definer guard to forbidden', () => {
    const err = {
      code: '42501',
      message: 'not authorized',
      hint: '',
      details: '',
    }
    expect(isForbiddenError(err)).toBe(true)
    expect(toUserMessage(err)).toMatch(/permission/i)
  })

  it('maps an illegal status transition to a check violation', () => {
    const err = {
      code: '23514',
      message: 'illegal job transition quoted -> closed for actor staff',
      hint: '',
      details: '',
    }
    expect(isCheckViolation(err)).toBe(true)
    expect(toUserMessage(err)).toMatch(/not allowed/i)
  })

  it('falls back to a generic message for unknown values', () => {
    expect(toUserMessage({})).toBe('Something went wrong.')
    expect(toUserMessage(new Error('specific'))).toBe('specific')
  })
})

describe('needsClaimsRefresh', () => {
  const base = {
    userId: 'u1',
    email: 'a@b.test',
    orgRoles: {},
    portalClientIds: [],
    overflow: false,
    epoch: 0,
    claimsVersion: EXPECTED_CLAIMS_VERSION as number | null,
    hydrated: true,
  }

  it('is false for a current token', () => {
    expect(needsClaimsRefresh(base)).toBe(false)
  })

  it('is true for a token minted before a claim-shape change', () => {
    expect(
      needsClaimsRefresh({
        ...base,
        claimsVersion: EXPECTED_CLAIMS_VERSION - 1,
      }),
    ).toBe(true)
  })

  it('is false when signed out', () => {
    expect(needsClaimsRefresh({ ...base, userId: null })).toBe(false)
  })

  it('does not try to refresh its way out of a deployment fault', () => {
    // No claims at all means config.toml was not pushed with the migrations.
    // That is fixed at the deployment boundary, not by looping on refresh.
    expect(needsClaimsRefresh({ ...base, claimsVersion: null })).toBe(false)
  })

  it('treats a user with no memberships as current, not stale', () => {
    expect(
      needsClaimsRefresh({ ...base, orgRoles: {}, portalClientIds: [] }),
    ).toBe(false)
  })
})
