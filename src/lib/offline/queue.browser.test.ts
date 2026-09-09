import { beforeEach, describe, expect, it } from 'vitest'
import { compressImage, fitWithin } from './image'
import {
  allPending,
  enqueue,
  evictBlob,
  forget,
  isQueueAvailable,
  offlineDb,
  patchUpload,
  sweepCommitted,
} from './store'

/**
 * The offline pipeline against a real browser.
 *
 * These cover the two halves that jsdom cannot: IndexedDB durability, and
 * canvas image decoding. The queue's DECISION logic is tested in
 * `queue-state.test.ts` under the unit project, because it is pure and should
 * not need a browser to run on every commit.
 *
 * Runs via `npm run test:browser`.
 */

function baseEntry(overrides: Record<string, unknown> = {}) {
  return {
    clientRef: crypto.randomUUID(),
    orgId: '54cc3682-75e7-4982-9e07-fb726023537e',
    jobId: '9c883415-3cda-4288-88a3-140c5fe7ac8f',
    clientId: 'c9990000-0000-4000-8000-000000000001',
    kind: 'photo' as const,
    blob: new Blob([new Uint8Array(1024)], { type: 'image/jpeg' }),
    mimeType: 'image/jpeg',
    byteSize: 1024,
    width: 100,
    height: 100,
    caption: null,
    body: null,
    capturedAt: new Date().toISOString(),
    capturedBy: '00000000-0000-4000-8000-000000000001',
    ...overrides,
  }
}

describe('the durable queue', () => {
  beforeEach(async () => {
    await offlineDb().uploads.clear()
  })

  it('is available in this browser', async () => {
    expect(await isQueueAvailable()).toBe(true)
  })

  // The whole reason for IndexedDB: a capture must outlive the page.
  it('keeps a queued capture across a fresh database handle', async () => {
    const entry = baseEntry()
    await enqueue(entry)

    // Close and reopen, which is the closest a test can get to the tab being
    // killed and the app restarted.
    offlineDb().close()
    await offlineDb().open()

    const items = await allPending()
    expect(items).toHaveLength(1)
    expect(items[0].clientRef).toBe(entry.clientRef)
    expect(items[0].status).toBe('queued')
    // The bytes must survive too, not just the metadata.
    expect(items[0].blob?.size).toBe(1024)
  })

  // A double-tap on the shutter must not enqueue the same capture twice.
  it('is idempotent on clientRef', async () => {
    const entry = baseEntry()
    await enqueue(entry)
    await enqueue(entry)
    expect(await allPending()).toHaveLength(1)
  })

  it('drops the blob on eviction but keeps the record briefly', async () => {
    const entry = baseEntry()
    await enqueue(entry)
    await evictBlob(entry.clientRef)

    const [item] = await allPending()
    expect(item.status).toBe('committed')
    expect(item.blob).toBeNull()
  })

  it('sweeps committed records once they are stale', async () => {
    const entry = baseEntry()
    await enqueue(entry)
    await evictBlob(entry.clientRef)

    // Not yet: the record is deliberately kept for a moment so the UI does
    // not appear to lose the item the instant it lands.
    expect(await sweepCommitted(Date.now())).toBe(0)
    expect(await sweepCommitted(Date.now() + 120_000)).toBe(1)
    expect(await allPending()).toHaveLength(0)
  })

  it('preserves a tus url across a patch, so a retry resumes', async () => {
    const entry = baseEntry()
    await enqueue(entry)
    await patchUpload(entry.clientRef, {
      status: 'uploading',
      tusUrl: 'https://example.test/upload/abc',
    })
    const [item] = await allPending()
    expect(item.tusUrl).toBe('https://example.test/upload/abc')
    await forget(entry.clientRef)
  })
})

describe('compressImage in a real browser', () => {
  /** A canvas-drawn PNG of a given size, as a stand-in for a camera capture. */
  async function madeUpImage(width: number, height: number): Promise<Blob> {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('no context')
    // A gradient rather than flat colour: a flat image compresses to almost
    // nothing and would make the size assertions meaningless.
    const gradient = ctx.createLinearGradient(0, 0, width, height)
    gradient.addColorStop(0, '#b45309')
    gradient.addColorStop(1, '#1e3a8a')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, width, height)
    return new Promise((resolve) =>
      canvas.toBlob((blob) => resolve(blob as Blob), 'image/png'),
    )
  }

  it('downscales a camera-sized photo to the long-edge limit', async () => {
    const original = await madeUpImage(3000, 2000)
    const result = await compressImage(original, 'image/png', 1024)

    expect(result.passthrough).toBe(false)
    expect(result.mimeType).toBe('image/jpeg')
    expect(result.width).toBe(1024)
    expect(result.height).toBe(683)
    expect(result.blob.size).toBeLessThan(original.size)
  })

  it('agrees with the pure sizing function', async () => {
    const original = await madeUpImage(1200, 1600)
    const result = await compressImage(original, 'image/png', 800)
    expect({ width: result.width, height: result.height }).toEqual(
      fitWithin({ width: 1200, height: 1600 }, 800),
    )
  })

  // A large original that uploads beats a perfect one that does not exist.
  it('passes a format it cannot safely decode straight through', async () => {
    const heic = new Blob([new Uint8Array(64)], { type: 'image/heic' })
    const result = await compressImage(heic, 'image/heic')
    expect(result.passthrough).toBe(true)
    expect(result.blob).toBe(heic)
  })

  it('passes a PDF through untouched', async () => {
    const pdf = new Blob([new Uint8Array(64)], { type: 'application/pdf' })
    const result = await compressImage(pdf, 'application/pdf')
    expect(result.passthrough).toBe(true)
  })

  it('returns the original when re-encoding would make it bigger', async () => {
    // A tiny flat PNG re-encodes to a larger JPEG.
    const small = await madeUpImage(8, 8)
    const result = await compressImage(small, 'image/png', 2048)
    expect(result.passthrough).toBe(true)
    expect(result.blob).toBe(small)
  })
})
