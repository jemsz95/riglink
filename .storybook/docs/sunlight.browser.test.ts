import { beforeEach, describe, expect, it } from 'vitest'
import { parseRgb, ratioFromRgb, resolveVar } from './token-utils'
import { JOB_STATUS_PRESENTATION } from '../../src/features/jobs/status'
import '../../src/styles.css'

/**
 * The sunlight review.
 *
 * A technician reads this on a phone, outdoors, in direct sun, possibly
 * through a cracked screen protector, while wearing gloves. WCAG AA (4.5:1)
 * is calibrated for an office; it is not enough for that. So the primary
 * reading pair is held to AAA, and every non-text boundary a user has to
 * FIND -- focus rings, card borders -- is held to the 3:1 that WCAG 1.4.11
 * requires for interface components.
 *
 * The status badges get their own assertions because their colours are
 * hand-picked Tailwind classes in `JOB_STATUS_PRESENTATION` rather than
 * semantic token pairs. Nothing else checks them, and "the badge is legible"
 * is exactly the sort of claim that rots the next time somebody adds a status.
 *
 * Needs a real CSS engine: jsdom implements neither oklch() nor colour
 * conversion, so these would report false passes there. `npm run test:browser`.
 */

function setTheme(theme: 'light' | 'dark') {
  document.documentElement.classList.toggle('dark', theme === 'dark')
}

/**
 * Resolves the computed colours of a Tailwind class string.
 *
 * The classes carry alpha (`bg-status-quoted/10`), so the background has to be
 * composited over the surface it actually sits on before the ratio means
 * anything -- a 10%-alpha fill measured against transparent black would look
 * like a pass and be invisible in the product.
 */
function resolveClassColours(classes: string, surface: string) {
  const host = document.createElement('div')
  host.style.backgroundColor = surface
  const probe = document.createElement('span')
  probe.className = classes
  probe.textContent = 'Sample'
  host.append(probe)
  document.body.append(host)
  try {
    const style = getComputedStyle(probe)
    return {
      color: style.color,
      backgroundColor: style.backgroundColor,
      borderColor: style.borderTopColor,
    }
  } finally {
    host.remove()
  }
}

/** Composites a possibly-translucent colour over an opaque backdrop. */
function flatten(
  colour: string,
  backdrop: [number, number, number],
): [number, number, number] | null {
  const match = /rgba?\(([^)]+)\)/.exec(colour)
  if (!match) return null
  const parts = match[1]
    .split(/[,\s/]+/)
    .filter(Boolean)
    .map(Number)
  const [r, g, b] = parts
  const alpha = parts.length > 3 ? parts[3] : 1
  return [
    r * alpha + backdrop[0] * (1 - alpha),
    g * alpha + backdrop[1] * (1 - alpha),
    b * alpha + backdrop[2] * (1 - alpha),
  ]
}

describe('sunlight legibility', () => {
  beforeEach(() => setTheme('light'))

  for (const theme of ['light', 'dark'] as const) {
    describe(theme, () => {
      beforeEach(() => setTheme(theme))

      // AAA, not AA. This is the pair a tech reads a job number in.
      it('body text on the page background meets WCAG AAA (7:1)', () => {
        const fg = parseRgb(resolveVar('--foreground'))
        const bg = parseRgb(resolveVar('--background'))
        expect(fg).not.toBeNull()
        expect(bg).not.toBeNull()
        const ratio = ratioFromRgb(fg!, bg!)
        expect(
          ratio,
          `--foreground on --background is ${ratio.toFixed(2)}:1`,
        ).toBeGreaterThanOrEqual(7)
      })

      it('body text on a card meets WCAG AAA (7:1)', () => {
        const fg = parseRgb(resolveVar('--card-foreground'))
        const bg = parseRgb(resolveVar('--card'))
        const ratio = ratioFromRgb(fg!, bg!)
        expect(
          ratio,
          `--card-foreground on --card is ${ratio.toFixed(2)}:1`,
        ).toBeGreaterThanOrEqual(7)
      })

      // WCAG 1.4.11: a control boundary a user must locate needs 3:1. A focus
      // ring you cannot see in sunlight is a keyboard user lost on the page.
      it('the focus ring is findable against both surfaces (3:1)', () => {
        const ring = parseRgb(resolveVar('--ring'))
        for (const surface of ['--background', '--card'] as const) {
          const bg = parseRgb(resolveVar(surface))
          const ratio = ratioFromRgb(ring!, bg!)
          expect(
            ratio,
            `--ring on ${surface} is ${ratio.toFixed(2)}:1`,
          ).toBeGreaterThanOrEqual(3)
        }
      })

      it('the destructive tone is findable on a card (3:1)', () => {
        // The `attention` stat tile and the overdue badge rely on this.
        const fg = parseRgb(resolveVar('--destructive'))
        const bg = parseRgb(resolveVar('--card'))
        const ratio = ratioFromRgb(fg!, bg!)
        expect(
          ratio,
          `--destructive on --card is ${ratio.toFixed(2)}:1`,
        ).toBeGreaterThanOrEqual(3)
      })

      describe('status badges', () => {
        const statuses = Object.entries(JOB_STATUS_PRESENTATION)

        it('covers every status, so a new one cannot slip through untested', () => {
          expect(statuses.length).toBeGreaterThan(0)
        })

        for (const [status, presentation] of statuses) {
          it(`${status} badge text meets WCAG AA on a card`, () => {
            const surface = resolveVar('--card')
            const backdrop = parseRgb(surface)
            expect(backdrop, '--card should resolve').not.toBeNull()

            const colours = resolveClassColours(presentation.className, surface)
            const text = flatten(colours.color, backdrop!)
            const fill = flatten(colours.backgroundColor, backdrop!)
            expect(text, `${status} text colour should resolve`).not.toBeNull()
            expect(fill, `${status} fill colour should resolve`).not.toBeNull()

            const ratio = ratioFromRgb(
              text as [number, number, number],
              fill as [number, number, number],
            )
            expect(
              ratio,
              `${status}: ${presentation.className} gives ${ratio.toFixed(2)}:1`,
            ).toBeGreaterThanOrEqual(4.5)
          })
        }
      })
    })
  }

  it('the field shell asks for larger targets than the office shell', () => {
    const office = document.createElement('div')
    const field = document.createElement('div')
    field.dataset.density = 'comfortable'
    document.body.append(office, field)
    try {
      const value = (el: HTMLElement) =>
        parseFloat(getComputedStyle(el).getPropertyValue('--size-touch'))
      // Not just "48px or more" -- the field value must be strictly LARGER
      // than the office one, which is what catches the density attribute
      // being dropped from FieldShell and silently inheriting the compact
      // token.
      expect(value(field)).toBeGreaterThan(value(office))
    } finally {
      office.remove()
      field.remove()
    }
  })
})
