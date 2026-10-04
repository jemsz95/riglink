/**
 * Token introspection for the design guide.
 *
 * Everything here reads the LIVE stylesheet and computed styles. Nothing is
 * hardcoded, so the guide cannot drift from src/styles.css -- that difference
 * is what makes it authoritative rather than aspirational.
 */

/** Collect every `--*` custom property name declared in the document's stylesheets. */
export function collectCustomProps(): Array<string> {
  const names = new Set<string>()
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: Array<CSSRule>
    try {
      rules = Array.from(sheet.cssRules)
    } catch {
      continue // cross-origin sheet; nothing we can read
    }
    walk(rules, names)
  }
  return Array.from(names).sort()
}

function walk(rules: Array<CSSRule>, names: Set<string>) {
  for (const rule of rules) {
    if (rule instanceof CSSStyleRule) {
      for (const prop of Array.from(rule.style)) {
        if (prop.startsWith('--')) names.add(prop)
      }
    } else if ('cssRules' in rule) {
      try {
        walk(Array.from((rule as CSSGroupingRule).cssRules), names)
      } catch {
        /* ignore */
      }
    }
  }
}

/** Resolve a custom property to its authored value (e.g. `oklch(0.55 0.1 175)`). */
export function resolveVar(name: string): string {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim()
}

/**
 * Resolve a colour to sRGB by letting the browser do it.
 *
 * Reading the custom property directly gives us the authored `oklch(...)`
 * string, which we cannot do maths on. Assigning it to a real element and
 * reading back the computed `color` forces the engine to convert.
 */
export function resolveToRgb(
  cssColor: string,
): [number, number, number] | null {
  const probe = document.createElement('span')
  probe.style.display = 'none'
  probe.style.color = cssColor
  document.body.appendChild(probe)
  const computed = getComputedStyle(probe).color
  probe.remove()
  return parseRgb(computed)
}

export function parseRgb(value: string): [number, number, number] | null {
  // Covers `rgb(r, g, b)`, `rgba(r, g, b, a)` and the space-separated forms.
  const nums = value.match(/-?[\d.]+%?/g)
  if (!nums || nums.length < 3) return null
  const toByte = (raw: string) =>
    raw.endsWith('%') ? (parseFloat(raw) / 100) * 255 : parseFloat(raw)
  return [toByte(nums[0]), toByte(nums[1]), toByte(nums[2])]
}

/** WCAG 2.1 relative luminance from an sRGB triple (0-255). */
export function srgbLuminance([r, g, b]: [number, number, number]): number {
  const channel = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/** WCAG contrast ratio between two sRGB triples. Pure; safe to unit test. */
export function ratioFromRgb(
  a: [number, number, number],
  b: [number, number, number],
): number {
  const lumA = srgbLuminance(a)
  const lumB = srgbLuminance(b)
  const [hi, lo] = lumA > lumB ? [lumA, lumB] : [lumB, lumA]
  return (hi + 0.05) / (lo + 0.05)
}

/** WCAG contrast ratio between two CSS colour strings, or null if unresolvable. */
export function contrastRatio(a: string, b: string): number | null {
  const rgbA = resolveToRgb(a)
  const rgbB = resolveToRgb(b)
  if (!rgbA || !rgbB) return null
  return ratioFromRgb(rgbA, rgbB)
}

export type WcagLevel = 'AAA' | 'AA' | 'AA Large' | 'Fail'

/** Grade a ratio for normal-weight body text. */
export function wcagLevel(ratio: number): WcagLevel {
  if (ratio >= 7) return 'AAA'
  if (ratio >= 4.5) return 'AA'
  if (ratio >= 3) return 'AA Large'
  return 'Fail'
}
