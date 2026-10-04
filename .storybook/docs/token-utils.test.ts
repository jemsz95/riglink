import { describe, expect, it } from 'vitest'
import { parseRgb, ratioFromRgb, srgbLuminance, wcagLevel } from './token-utils'

describe('parseRgb', () => {
  it('parses comma-separated rgb', () => {
    expect(parseRgb('rgb(18, 52, 86)')).toEqual([18, 52, 86])
  })

  it('parses space-separated rgb with alpha', () => {
    expect(parseRgb('rgb(18 52 86 / 0.5)')).toEqual([18, 52, 86])
  })

  it('parses rgba', () => {
    expect(parseRgb('rgba(255, 0, 127, 0.25)')).toEqual([255, 0, 127])
  })

  it('converts percentage channels to bytes', () => {
    const parsed = parseRgb('rgb(100%, 0%, 50%)')
    expect(parsed?.[0]).toBeCloseTo(255)
    expect(parsed?.[1]).toBeCloseTo(0)
    expect(parsed?.[2]).toBeCloseTo(127.5)
  })

  it('returns null when there are too few channels', () => {
    expect(parseRgb('rgb(1, 2)')).toBeNull()
    expect(parseRgb('nonsense')).toBeNull()
  })
})

describe('srgbLuminance', () => {
  it('is 0 for black and 1 for white', () => {
    expect(srgbLuminance([0, 0, 0])).toBeCloseTo(0, 6)
    expect(srgbLuminance([255, 255, 255])).toBeCloseTo(1, 6)
  })

  it('uses the linearisation curve, not a naive average', () => {
    // Mid-grey is ~0.216 relative luminance, NOT 0.5. Getting this wrong is the
    // classic contrast bug: it makes mid-tones look compliant when they are not.
    expect(srgbLuminance([128, 128, 128])).toBeCloseTo(0.2159, 3)
  })
})

describe('ratioFromRgb', () => {
  it('gives 21:1 for black on white', () => {
    expect(ratioFromRgb([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 2)
  })

  it('gives 1:1 for identical colours', () => {
    expect(ratioFromRgb([90, 90, 90], [90, 90, 90])).toBeCloseTo(1, 6)
  })

  it('is order-independent', () => {
    const a: [number, number, number] = [12, 34, 56]
    const b: [number, number, number] = [240, 240, 200]
    expect(ratioFromRgb(a, b)).toBeCloseTo(ratioFromRgb(b, a), 10)
  })
})

describe('wcagLevel', () => {
  it('grades at the standard boundaries', () => {
    expect(wcagLevel(21)).toBe('AAA')
    expect(wcagLevel(7)).toBe('AAA')
    expect(wcagLevel(6.99)).toBe('AA')
    expect(wcagLevel(4.5)).toBe('AA')
    expect(wcagLevel(4.49)).toBe('AA Large')
    expect(wcagLevel(3)).toBe('AA Large')
    expect(wcagLevel(2.99)).toBe('Fail')
    expect(wcagLevel(1)).toBe('Fail')
  })
})
