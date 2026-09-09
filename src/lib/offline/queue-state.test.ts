import { describe, expect, it } from 'vitest'
import {
  MAX_ATTEMPTS,
  afterFailure,
  backoffMs,
  classifyFailure,
  comparePriority,
  isCommitAlreadyApplied,
  nextAction,
} from './queue-state'
import type { QueueItem } from './queue-state'

function item(overrides: Partial<QueueItem> = {}): QueueItem {
  return {
    clientRef: 'aaaaaaaa-0000-4000-8000-000000000001',
    orgId: 'org',
    jobId: 'job',
    clientId: 'client',
    kind: 'photo',
    status: 'queued',
    attempts: 0,
    nextAttemptAt: null,
    lastError: null,
    tusUrl: null,
    ...overrides,
  }
}

const online = { online: true, now: 1_000_000 }
const offline = { online: false, now: 1_000_000 }

describe('isCommitAlreadyApplied', () => {
  // The whole reason client_ref is minted before the first attempt. A commit
  // that succeeded and lost its response must not be retried into a duplicate.
  it('treats a 409 conflict as a success', () => {
    expect(isCommitAlreadyApplied(409)).toBe(true)
  })

  it('treats the underlying unique violation as a success too', () => {
    // Some paths surface the Postgres code rather than a clean 409.
    expect(isCommitAlreadyApplied(400, '23505')).toBe(true)
  })

  it('does not treat other failures as success', () => {
    expect(isCommitAlreadyApplied(403)).toBe(false)
    expect(isCommitAlreadyApplied(500)).toBe(false)
    expect(isCommitAlreadyApplied(400, '23503')).toBe(false)
  })
})

describe('classifyFailure', () => {
  // The normal field case: no HTTP status at all, because there was no
  // network. Always worth retrying.
  it('retries when there was no HTTP response', () => {
    expect(classifyFailure(null)).toBe('retryable')
  })

  it('retries the statuses that mean "come back later"', () => {
    for (const s of [408, 425, 429, 500, 502, 503, 504]) {
      expect(classifyFailure(s), `status ${s}`).toBe('retryable')
    }
  })

  it('gives up on a refusal the server understood', () => {
    // 403 is RLS saying no. Waiting does not change it.
    for (const s of [400, 401, 403, 404, 413, 422]) {
      expect(classifyFailure(s), `status ${s}`).toBe('permanent')
    }
  })
})

describe('backoffMs', () => {
  it('grows with each attempt', () => {
    const noJitter = () => 1
    const delays = [1, 2, 3, 4, 5].map((n) => backoffMs(n, noJitter))
    for (let i = 1; i < delays.length; i++) {
      expect(delays[i]).toBeGreaterThan(delays[i - 1])
    }
  })

  it('caps so a long outage does not schedule a retry hours away', () => {
    expect(backoffMs(50, () => 1)).toBe(5 * 60_000)
  })

  it('applies full jitter so a fleet does not retry in lockstep', () => {
    expect(backoffMs(4, () => 0)).toBe(0)
    expect(backoffMs(4, () => 1)).toBeGreaterThan(0)
  })
})

describe('nextAction', () => {
  it('uploads a queued photo', () => {
    expect(nextAction(item(), online)).toEqual({ type: 'upload' })
  })

  // A note has no object, so it skips the transfer entirely -- same queue,
  // same retry and same deduplication, one fewer step.
  it('commits a note without uploading', () => {
    expect(nextAction(item({ kind: 'note' }), online)).toEqual({
      type: 'commit',
    })
  })

  it('commits once the object is complete', () => {
    expect(nextAction(item({ status: 'uploaded' }), online)).toEqual({
      type: 'commit',
    })
  })

  it('resumes an interrupted upload rather than starting over', () => {
    const resumed = item({ status: 'uploading', tusUrl: 'https://x/upload/1' })
    expect(nextAction(resumed, online)).toEqual({ type: 'upload' })
  })

  it('evicts the blob once the row exists', () => {
    expect(nextAction(item({ status: 'committed' }), online)).toEqual({
      type: 'evict',
    })
  })

  it('waits while a backoff window is open', () => {
    const waiting = item({
      status: 'failed',
      attempts: 2,
      nextAttemptAt: online.now + 5_000,
    })
    expect(nextAction(waiting, online)).toEqual({
      type: 'wait',
      untilMs: online.now + 5_000,
    })
  })

  it('retries once the backoff window has passed', () => {
    const ready = item({
      status: 'failed',
      attempts: 2,
      nextAttemptAt: online.now - 1,
    })
    expect(nextAction(ready, online)).toEqual({ type: 'upload' })
  })

  it('blocks after the attempt budget is spent', () => {
    expect(
      nextAction(item({ status: 'failed', attempts: MAX_ATTEMPTS }), online),
    ).toEqual({
      type: 'blocked',
    })
  })

  it('does nothing that needs the network while offline', () => {
    expect(nextAction(item(), offline)).toEqual({ type: 'none' })
  })

  // Offline is not a reason to keep a blob whose row is already written, nor
  // to stop telling the user something needs attention.
  it('still evicts and still reports blocked items while offline', () => {
    expect(nextAction(item({ status: 'committed' }), offline)).toEqual({
      type: 'evict',
    })
    expect(nextAction(item({ status: 'blocked' }), offline)).toEqual({
      type: 'blocked',
    })
  })
})

describe('afterFailure', () => {
  it('schedules a retry for a transient failure', () => {
    const next = afterFailure(item(), null, 'network down', () => 1, 1_000)
    expect(next.status).toBe('failed')
    expect(next.attempts).toBe(1)
    expect(next.nextAttemptAt).toBeGreaterThan(1_000)
    expect(next.lastError).toBe('network down')
  })

  it('blocks immediately on a permanent refusal', () => {
    const next = afterFailure(item(), 403, 'forbidden', () => 1, 1_000)
    expect(next.status).toBe('blocked')
    // No point scheduling a retry that will be refused identically.
    expect(next.nextAttemptAt).toBeNull()
  })

  it('blocks when the budget runs out, even for a transient failure', () => {
    const next = afterFailure(
      item({ attempts: MAX_ATTEMPTS - 1 }),
      null,
      'still offline',
      () => 1,
      1_000,
    )
    expect(next.attempts).toBe(MAX_ATTEMPTS)
    expect(next.status).toBe('blocked')
  })

  it('never rewrites the clientRef, so a retry addresses the same row', () => {
    const original = item()
    const next = afterFailure(original, 500, 'server error')
    expect(next.clientRef).toBe(original.clientRef)
  })
})

describe('comparePriority', () => {
  // One bar of signal should deliver "valve seized, need the 24mm" before a
  // 3MB photo of the valve.
  it('sends notes before photos', () => {
    const note = item({ kind: 'note', clientRef: 'zzzz' })
    const photo = item({ kind: 'photo', clientRef: 'aaaa' })
    expect([photo, note].sort(comparePriority)[0]).toBe(note)
  })

  it('is stable for items of the same kind', () => {
    const a = item({ clientRef: 'aaaa' })
    const b = item({ clientRef: 'bbbb' })
    expect([b, a].sort(comparePriority).map((i) => i.clientRef)).toEqual([
      'aaaa',
      'bbbb',
    ])
  })
})
