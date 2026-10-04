import { useEffect, useState } from 'react'
import {
  collectCustomProps,
  contrastRatio,
  resolveVar,
  wcagLevel,
} from './token-utils'
import type { WcagLevel } from './token-utils'

interface ColorRow {
  name: string
  value: string
  ratio: number | null
  level: WcagLevel | null
  pairedWith: string
}

const LEVEL_STYLE: Record<WcagLevel, string> = {
  AAA: 'bg-success/15 text-success',
  AA: 'bg-success/15 text-success',
  'AA Large': 'bg-warning/20 text-warning-foreground',
  Fail: 'bg-destructive/15 text-destructive',
}

/**
 * Pick the surface a token is realistically read against, so the contrast
 * figure means something. A `*-foreground` token pairs with its own base;
 * everything else is judged against the page background.
 */
function pairFor(name: string, allNames: Array<string>): string {
  if (name.endsWith('-foreground')) {
    const base = name.replace(/-foreground$/, '')
    if (allNames.includes(base)) return base
    return '--background'
  }
  const fg = `${name}-foreground`
  if (allNames.includes(fg)) return fg
  return '--foreground'
}

export function ColorTokens({
  match,
  caption,
}: {
  /** Regex source matched against the token name. */
  match: string
  caption?: string
}) {
  const [rows, setRows] = useState<Array<ColorRow>>([])

  useEffect(() => {
    const all = collectCustomProps()
    const re = new RegExp(match)
    const next = all
      .filter((n) => re.test(n))
      .map((name) => {
        const value = resolveVar(name)
        const pairedWith = pairFor(name, all)
        const ratio = contrastRatio(`var(${name})`, `var(${pairedWith})`)
        return {
          name,
          value,
          pairedWith,
          ratio,
          level: ratio === null ? null : wcagLevel(ratio),
        }
      })
    setRows(next)
    // `match` is the only input; theme changes remount via the decorator key.
  }, [match])

  if (!rows.length) {
    return (
      <p className="text-muted-foreground text-sm">
        No tokens matched <code>{match}</code>.
      </p>
    )
  }

  return (
    <figure className="my-6 not-prose">
      <div className="border-border overflow-x-auto rounded-lg border">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Swatch</th>
              <th className="px-3 py-2 font-medium">Token</th>
              <th className="px-3 py-2 font-medium">Utility</th>
              <th className="px-3 py-2 font-medium">Resolved value</th>
              <th className="px-3 py-2 font-medium">Contrast</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.name} className="border-border border-t">
                <td className="px-3 py-2">
                  <span
                    className="border-border block size-8 rounded-md border"
                    style={{ background: `var(${row.name})` }}
                  />
                </td>
                <td className="px-3 py-2">
                  <code className="text-2xs">{row.name}</code>
                </td>
                <td className="px-3 py-2">
                  <code className="text-2xs text-muted-foreground">
                    {row.name.startsWith('--color-')
                      ? `bg-${row.name.slice('--color-'.length)}`
                      : '—'}
                  </code>
                </td>
                <td className="px-3 py-2">
                  <code className="text-2xs tabular">{row.value || '—'}</code>
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {row.ratio !== null && row.level ? (
                    <span className="flex items-center gap-2">
                      <span className="tabular text-2xs">
                        {row.ratio.toFixed(2)}:1
                      </span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-2xs font-medium ${LEVEL_STYLE[row.level]}`}
                      >
                        {row.level}
                      </span>
                      <span className="text-muted-foreground text-2xs">
                        vs {row.pairedWith.replace('--color-', '')}
                      </span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground text-2xs">n/a</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {caption ? (
        <figcaption className="text-muted-foreground mt-2 text-xs">
          {caption}
        </figcaption>
      ) : null}
    </figure>
  )
}

/** Renders spacing steps as real bars at their real widths. */
export function SpacingScale({ steps }: { steps?: Array<number> }) {
  const scale = steps ?? [0.5, 1, 1.5, 2, 3, 4, 6, 8, 12, 16]
  return (
    <div className="my-6 not-prose flex flex-col gap-2">
      {scale.map((step) => (
        <div key={step} className="flex items-center gap-3">
          <code className="text-2xs text-muted-foreground w-16 shrink-0 tabular">
            {step}
          </code>
          <div
            className="bg-primary h-4 rounded-sm"
            style={{ width: `calc(var(--spacing) * ${step})` }}
          />
          <code className="text-2xs text-muted-foreground tabular">
            {step * 4}px
          </code>
        </div>
      ))}
    </div>
  )
}

/** Live type specimens at each step, with resolved size and line-height. */
export function TypeScale() {
  // Literal classes, not `text-${step}`: Tailwind scans source text, so a
  // runtime-constructed class name is never emitted into the stylesheet.
  const steps: Array<[string, string]> = [
    ['2xs', 'text-2xs'],
    ['xs', 'text-xs'],
    ['sm', 'text-sm'],
    ['base', 'text-base'],
    ['lg', 'text-lg'],
    ['xl', 'text-xl'],
    ['2xl', 'text-2xl'],
    ['3xl', 'text-3xl'],
    ['4xl', 'text-4xl'],
  ]
  const [meta, setMeta] = useState<Record<string, string>>({})

  useEffect(() => {
    const probe = document.createElement('span')
    probe.style.position = 'absolute'
    probe.style.visibility = 'hidden'
    document.body.appendChild(probe)
    const next: Record<string, string> = {}
    for (const [label, cls] of steps) {
      probe.className = cls
      const cs = getComputedStyle(probe)
      next[label] = `${cs.fontSize} / ${cs.lineHeight}`
    }
    probe.remove()
    setMeta(next)
  }, [])

  return (
    <div className="my-6 not-prose flex flex-col gap-4">
      {steps.map(([label, cls]) => (
        <div
          key={label}
          className="border-border flex flex-col gap-1 border-b pb-3"
        >
          <div className="text-muted-foreground flex gap-3 text-2xs">
            <code>{cls}</code>
            <code className="tabular">{meta[label] ?? '\u2026'}</code>
          </div>
          <p className={`${cls} m-0`}>
            Rig 12 \u2014 quarterly compressor service
          </p>
        </div>
      ))}
    </div>
  )
}

/** Radius and elevation rendered as the real thing. */
export function RadiusScale() {
  const steps: Array<[string, string]> = [
    ['rounded-sm', 'rounded-sm'],
    ['rounded-md', 'rounded-md'],
    ['rounded-lg', 'rounded-lg'],
    ['rounded-xl', 'rounded-xl'],
  ]
  return (
    <div className="my-6 not-prose flex flex-wrap gap-4">
      {steps.map(([label, cls]) => (
        <div key={label} className="flex flex-col items-center gap-2">
          <div className={`bg-secondary border-border size-20 border ${cls}`} />
          <code className="text-2xs text-muted-foreground">{label}</code>
        </div>
      ))}
    </div>
  )
}

export function ElevationScale() {
  const steps: Array<[string, string]> = [
    ['shadow-e1', 'shadow-e1'],
    ['shadow-e2', 'shadow-e2'],
    ['shadow-e3', 'shadow-e3'],
  ]
  return (
    <div className="my-6 not-prose flex flex-wrap gap-8 p-4">
      {steps.map(([label, cls]) => (
        <div key={label} className="flex flex-col items-center gap-3">
          <div className={`bg-card size-24 rounded-lg ${cls}`} />
          <code className="text-2xs text-muted-foreground">{label}</code>
        </div>
      ))}
    </div>
  )
}
