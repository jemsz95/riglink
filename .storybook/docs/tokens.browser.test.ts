import { beforeEach, describe, expect, it } from 'vitest'
import {
  collectCustomProps,
  contrastRatio,
  resolveToRgb,
  resolveVar,
  wcagLevel,
} from './token-utils'
import '../../src/styles.css'

/**
 * These require a real CSS engine: jsdom implements neither oklch() nor colour
 * conversion, so running them there would report false passes. See the `browser`
 * project in vitest.config.ts -- `npm run test:browser`.
 */

function setTheme(theme: 'light' | 'dark') {
  document.documentElement.classList.toggle('dark', theme === 'dark')
}

describe('design tokens', () => {
  beforeEach(() => setTheme('light'))

  it('declares the core semantic tokens', () => {
    const props = collectCustomProps()
    for (const name of [
      '--background',
      '--foreground',
      '--primary',
      '--accent',
      '--border',
      '--radius',
      '--size-touch',
      '--row-height',
    ]) {
      expect(props, `${name} should be declared`).toContain(name)
    }
  })

  /**
   * The regression guard for the single easiest way to break Tailwind v4
   * theming: dropping `inline` from the @theme bridge block. Without `inline`,
   * Tailwind resolves --color-* at build time and the utilities keep their
   * light values, so `.dark` visibly does nothing while every token still
   * "exists". Asserting the raw var changes AND that a utility follows it
   * catches both halves.
   */
  it('actually changes surface colours between themes', () => {
    setTheme('light')
    const lightBg = resolveToRgb('var(--background)')
    const lightFg = resolveToRgb('var(--foreground)')

    setTheme('dark')
    const darkBg = resolveToRgb('var(--background)')
    const darkFg = resolveToRgb('var(--foreground)')

    expect(lightBg).not.toEqual(darkBg)
    expect(lightFg).not.toEqual(darkFg)

    // Light theme must be light and dark must be dark -- catches a swapped block.
    expect(lightBg![0]).toBeGreaterThan(darkBg![0])
  })

  it('routes utilities through the var, not a build-time literal', () => {
    const probe = document.createElement('div')
    probe.className = 'bg-background'
    document.body.appendChild(probe)
    try {
      setTheme('light')
      const light = getComputedStyle(probe).backgroundColor
      setTheme('dark')
      const dark = getComputedStyle(probe).backgroundColor
      expect(light).not.toBe(dark)
    } finally {
      probe.remove()
    }
  })

  const PAIRS: Array<[string, string]> = [
    ['--foreground', '--background'],
    ['--muted-foreground', '--background'],
    ['--card-foreground', '--card'],
    ['--primary-foreground', '--primary'],
    ['--secondary-foreground', '--secondary'],
    ['--accent-foreground', '--accent'],
    ['--destructive-foreground', '--destructive'],
    ['--success-foreground', '--success'],
    ['--info-foreground', '--info'],
  ]

  for (const theme of ['light', 'dark'] as const) {
    describe(`${theme} theme contrast`, () => {
      for (const [fg, bg] of PAIRS) {
        it(`${fg} on ${bg} meets WCAG AA`, () => {
          setTheme(theme)
          const ratio = contrastRatio(`var(${fg})`, `var(${bg})`)
          expect(ratio).not.toBeNull()
          expect(
            ratio!,
            `${fg} on ${bg} is ${ratio!.toFixed(2)}:1 (${wcagLevel(ratio!)})`,
          ).toBeGreaterThanOrEqual(4.5)
        })
      }
    })
  }

  it('keeps touch targets at 44px+ compact and 48px+ in the field', () => {
    const wrapper = document.createElement('div')
    document.body.appendChild(wrapper)
    try {
      const px = (v: string) => parseFloat(v)
      expect(px(resolveVar('--size-touch'))).toBeGreaterThanOrEqual(
        2.75 * 16 - 0.01,
      )

      wrapper.dataset.density = 'comfortable'
      const comfortable =
        getComputedStyle(wrapper).getPropertyValue('--size-touch')
      expect(px(comfortable) * 16).toBeGreaterThanOrEqual(48 - 0.01)
    } finally {
      wrapper.remove()
    }
  })
})
