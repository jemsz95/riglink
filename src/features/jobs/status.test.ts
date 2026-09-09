import { describe, expect, it } from 'vitest'
import {
  JOB_STATUS_PRESENTATION,
  allowedTransitions,
  canTransitionJobs,
  isDestructiveTransition,
  transitionLabel,
} from './status'
import { JOB_STATUS_EXCEPTIONAL, JOB_STATUS_ORDER } from '@/lib/supabase/db'
import type { StatusTransition } from './status'
import type { JobStatus } from '@/lib/supabase/db'

// Mirrors the rows seeded by 20260908225630_jobs.sql. Kept small and explicit:
// the point is to test the filter, not to re-encode the whole state machine.
const TRANSITIONS: Array<StatusTransition> = [
  { from_status: 'quoted', to_status: 'triaged', actor_kind: 'staff' },
  { from_status: 'quoted', to_status: 'on_hold', actor_kind: 'staff' },
  { from_status: 'quoted', to_status: 'cancelled', actor_kind: 'staff' },
  { from_status: 'quoted', to_status: 'approved', actor_kind: 'client' },
  { from_status: 'quoted', to_status: 'declined', actor_kind: 'client' },
  { from_status: 'closed', to_status: 'invoiced', actor_kind: 'system' },
]

describe('allowedTransitions', () => {
  it('offers staff only the staff edges', () => {
    expect(allowedTransitions(TRANSITIONS, 'quoted', 'staff')).toEqual([
      'triaged',
      'on_hold',
      'cancelled',
    ])
  })

  // Staff must not be handed the client's approve button: approving on the
  // client's behalf is exactly the audit-trail hole the actor_kind split closes.
  it('never leaks a client-only edge to staff', () => {
    const staffEdges = allowedTransitions(TRANSITIONS, 'quoted', 'staff')
    expect(staffEdges).not.toContain('approved')
    expect(staffEdges).not.toContain('declined')
  })

  it('offers the client only their two edges', () => {
    expect(allowedTransitions(TRANSITIONS, 'quoted', 'client')).toEqual([
      'approved',
      'declined',
    ])
  })

  it('returns nothing for a terminal state rather than throwing', () => {
    expect(allowedTransitions(TRANSITIONS, 'closed', 'staff')).toEqual([])
  })

  it('returns nothing when the table has not loaded yet', () => {
    expect(allowedTransitions([], 'quoted', 'staff')).toEqual([])
  })
})

describe('presentation', () => {
  // A status with no entry renders as a blank chip. The enum has 14 values and
  // will grow; this fails the moment the two drift apart.
  it('covers every value of the job_status enum', () => {
    const all: Array<JobStatus> = [
      ...JOB_STATUS_ORDER,
      ...JOB_STATUS_EXCEPTIONAL,
    ]
    expect(all).toHaveLength(14)
    for (const status of all) {
      expect(JOB_STATUS_PRESENTATION[status]).toBeDefined()
      expect(JOB_STATUS_PRESENTATION[status].label).not.toBe('')
    }
    expect(Object.keys(JOB_STATUS_PRESENTATION)).toHaveLength(all.length)
  })

  // A runtime-interpolated class name produces no CSS at all, and the chip
  // renders with no colour. Static strings are the only safe form.
  it('uses literal token classes the Tailwind scanner can see', () => {
    for (const presentation of Object.values(JOB_STATUS_PRESENTATION)) {
      expect(presentation.className).not.toContain('${')
      expect(presentation.className).toMatch(/text-status-/)
    }
  })

  it('marks exactly the states where the ball is with the client', () => {
    const awaiting = Object.entries(JOB_STATUS_PRESENTATION)
      .filter(([, value]) => value.awaitingClient)
      .map(([key]) => key)
      .sort()
    expect(awaiting).toEqual(['invoiced', 'quoted', 'work_complete'])
  })
})

describe('transition labels', () => {
  it('reads as an imperative action, not a status name', () => {
    expect(transitionLabel('in_progress')).toBe('Start work')
    expect(transitionLabel('cancelled')).toBe('Cancel job')
  })

  it('falls back rather than rendering undefined', () => {
    expect(transitionLabel('draft')).toBe('Move to Draft')
  })

  it('flags the transitions worth a confirmation step', () => {
    expect(isDestructiveTransition('cancelled')).toBe(true)
    expect(isDestructiveTransition('declined')).toBe(true)
    expect(isDestructiveTransition('scheduled')).toBe(false)
  })
})

describe('canTransitionJobs', () => {
  it('admits the dispatch roles and refuses the rest', () => {
    expect(canTransitionJobs('owner')).toBe(true)
    expect(canTransitionJobs('admin')).toBe(true)
    expect(canTransitionJobs('dispatcher')).toBe(true)
    expect(canTransitionJobs('tech')).toBe(false)
    expect(canTransitionJobs('viewer')).toBe(false)
  })
})
