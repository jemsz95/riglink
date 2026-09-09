import { describe, expect, it } from 'vitest'
import { MAX_EDGE, fitWithin, isCompressibleImage } from './image'

describe('fitWithin', () => {
  it('scales a landscape photo by its long edge', () => {
    expect(fitWithin({ width: 4032, height: 3024 }, 2048)).toEqual({
      width: 2048,
      height: 1536,
    })
  })

  it('scales a portrait photo by its long edge', () => {
    expect(fitWithin({ width: 3024, height: 4032 }, 2048)).toEqual({
      width: 1536,
      height: 2048,
    })
  })

  // Interpolating a small photo upward makes a bigger file carrying no more
  // information, on a connection that is the scarce resource.
  it('never scales up', () => {
    expect(fitWithin({ width: 800, height: 600 }, 2048)).toEqual({
      width: 800,
      height: 600,
    })
  })

  it('leaves a photo exactly at the limit alone', () => {
    expect(fitWithin({ width: 2048, height: 100 }, 2048)).toEqual({
      width: 2048,
      height: 100,
    })
  })

  // A 4000x1 strip would otherwise round the short edge to 0 and give a
  // canvas that throws on construction.
  it('clamps the short edge to at least one pixel', () => {
    expect(fitWithin({ width: 8000, height: 1 }, 2048)).toEqual({
      width: 2048,
      height: 1,
    })
  })

  it('does not divide by zero on an empty image', () => {
    expect(fitWithin({ width: 0, height: 0 }, 2048)).toEqual({
      width: 0,
      height: 0,
    })
  })

  it('defaults to MAX_EDGE', () => {
    expect(fitWithin({ width: 5000, height: 5000 })).toEqual({
      width: MAX_EDGE,
      height: MAX_EDGE,
    })
  })
})

describe('isCompressibleImage', () => {
  it('accepts the formats a canvas can decode everywhere', () => {
    expect(isCompressibleImage('image/jpeg')).toBe(true)
    expect(isCompressibleImage('image/png')).toBe(true)
    expect(isCompressibleImage('image/webp')).toBe(true)
  })

  // A canvas round-trip on HEIC yields a blank image on browsers that cannot
  // decode it -- silently. A large original beats a blank re-encode.
  it('refuses HEIC rather than risking a blank re-encode', () => {
    expect(isCompressibleImage('image/heic')).toBe(false)
  })

  it('refuses PDFs, which are uploaded as they are', () => {
    expect(isCompressibleImage('application/pdf')).toBe(false)
  })
})
