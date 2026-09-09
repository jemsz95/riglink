import { describe, expect, it } from 'vitest'
import {
  ADMIN_ROLES,
  DISPATCH_ROLES,
  canAdminister,
  canDispatch,
} from './permissions'
import { canTransitionJobs } from '@/features/jobs/status'

describe('canDispatch', () => {
  // These lists mirror the `*_staff_insert` / `*_staff_update` RLS policies on
  // clients, sites and jobs. If they drift, the app shows forms the database
  // refuses -- so the role sets are pinned here rather than left implicit.
  it('matches the role set in the staff write policies', () => {
    expect([...DISPATCH_ROLES]).toEqual(['owner', 'admin', 'dispatcher'])
  })

  it('admits the dispatch roles', () => {
    expect(canDispatch('owner')).toBe(true)
    expect(canDispatch('admin')).toBe(true)
    expect(canDispatch('dispatcher')).toBe(true)
  })

  it('refuses techs and viewers', () => {
    // A tech CAN update jobs they lead, but through jobs_tech_update and only
    // their own rows -- never the create/reassign surfaces this gates.
    expect(canDispatch('tech')).toBe(false)
    expect(canDispatch('viewer')).toBe(false)
  })

  it('refuses an unknown role rather than defaulting open', () => {
    expect(canDispatch('')).toBe(false)
    expect(canDispatch('superuser')).toBe(false)
  })
})

describe('canAdminister', () => {
  it('matches the narrower admin policies', () => {
    expect([...ADMIN_ROLES]).toEqual(['owner', 'admin'])
    expect(canAdminister('dispatcher')).toBe(false)
    expect(canAdminister('admin')).toBe(true)
  })
})

describe('canTransitionJobs', () => {
  it('is the same gate as canDispatch, not a second copy of the role list', () => {
    for (const role of [
      'owner',
      'admin',
      'dispatcher',
      'tech',
      'viewer',
      'x',
    ]) {
      expect(canTransitionJobs(role)).toBe(canDispatch(role))
    }
  })
})
