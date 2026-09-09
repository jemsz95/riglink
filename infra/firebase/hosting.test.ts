// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  cspDirectives,
  headersFor,
  readHostingConfig,
  supabaseCspProblem,
} from './hosting'

/**
 * firebase.json is hand-maintained JSON with no room for comments, so this
 * file is where the reason for each value lives. A change that breaks one of
 * these should fail here, with the explanation next to it.
 */
const config = readHostingConfig()
const { hosting } = config

/** The production Supabase URL, from the committed .env. */
const SUPABASE = /^VITE_SUPABASE_URL=(.+)$/m
  .exec(readFileSync(new URL('../../.env', import.meta.url), 'utf8'))![1]
  .trim()

const PATHS = {
  root: '/',
  shell: '/index.html',
  deepLink: '/acme/jobs/4f2a',
  asset: '/assets/index-Co6H18ZC.js',
}

const csp = cspDirectives(headersFor(config, '/')['Content-Security-Policy'])

describe('Content-Security-Policy', () => {
  it('matches the Supabase project in the committed .env', () => {
    expect(supabaseCspProblem(config, SUPABASE)).toBeNull()
  })

  // Realtime is a WebSocket. A CSP without the wss: origin fails silently as
  // "realtime just doesn't work", which is a miserable thing to debug.
  it('allows the project origin over https and wss', () => {
    const wss = SUPABASE.replace(/^https:/, 'wss:')
    expect(csp.get('connect-src')).toEqual(["'self'", SUPABASE, wss])
  })

  it('rejects a different project, naming what is missing', () => {
    const problem = supabaseCspProblem(
      config,
      'https://someone-else.supabase.co',
    )
    expect(problem).toContain('https://someone-else.supabase.co in connect-src')
    expect(problem).toContain('wss://someone-else.supabase.co in connect-src')
  })

  it('locks down the dangerous directives', () => {
    expect(csp.get('default-src')).toEqual(["'none'"])
    expect(csp.get('object-src')).toEqual(["'none'"])
    expect(csp.get('base-uri')).toEqual(["'none'"])
    expect(csp.get('frame-ancestors')).toEqual(["'none'"])
    for (const sources of csp.values()) {
      expect(sources).not.toContain("'unsafe-eval'")
    }
  })

  // Radix sets inline `style` attributes for positioning, and a nonce cannot
  // be applied to those from a static host with no server-side render.
  // Scripts get no such allowance.
  it('allows inline STYLES but never inline scripts', () => {
    expect(csp.get('style-src')).toContain("'unsafe-inline'")
    expect(csp.get('script-src')).toEqual(["'self'"])
  })

  // The compress-then-queue pipeline previews photos from blob: URLs.
  it('allows blob: for the offline queue previews', () => {
    expect(csp.get('img-src')).toContain('blob:')
    expect(csp.get('worker-src')).toEqual(["'self'", 'blob:'])
  })
})

describe('security headers', () => {
  it('apply to every path, deep links and assets included', () => {
    const expected = headersFor(config, PATHS.root)
    for (const path of Object.values(PATHS)) {
      const headers = headersFor(config, path)
      for (const key of [
        'Content-Security-Policy',
        'X-Content-Type-Options',
        'X-Frame-Options',
        'Referrer-Policy',
        'Permissions-Policy',
        'Strict-Transport-Security',
      ]) {
        expect(headers[key], `${key} on ${path}`).toBe(expected[key])
      }
    }
  })

  it('set what a static host would otherwise omit', () => {
    const headers = headersFor(config, PATHS.root)
    expect(headers['X-Content-Type-Options']).toBe('nosniff')
    expect(headers['X-Frame-Options']).toBe('DENY')
    expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin')
    expect(headers['Strict-Transport-Security']).toContain('max-age=31536000')
  })

  // The field surface captures photos with <input capture="environment">,
  // which needs camera permission on the app's own origin. Dropping it to ()
  // breaks evidence capture on a phone.
  it('keep camera permission for the app origin', () => {
    expect(headersFor(config, PATHS.root)['Permissions-Policy']).toContain(
      'camera=(self)',
    )
  })

  it('deny geolocation and microphone, which nothing here uses', () => {
    const policy = headersFor(config, PATHS.root)['Permissions-Policy']
    expect(policy).toContain('geolocation=()')
    expect(policy).toContain('microphone=()')
  })
})

describe('cache policy', () => {
  // `no-cache` means "revalidate before use", not "do not store": an
  // unchanged deploy costs a 304. It must not be cached outright -- the shell
  // is the one URL whose name never changes, so a cached copy pins a visitor
  // to the previous build's asset names.
  //
  // Header rules match the REQUESTED path, not the rewrite destination, so a
  // deep link never matches a `/index.html` rule. This has to come from the
  // catch-all or deep links get Firebase's default caching.
  it('revalidates the shell however it is reached', () => {
    for (const path of [PATHS.root, PATHS.shell, PATHS.deepLink]) {
      expect(headersFor(config, path)['Cache-Control'], path).toBe('no-cache')
    }
  })

  // Vite content-hashes every filename under assets/, so a changed file gets
  // a new URL and an old one never needs revalidating. The later rule wins,
  // so the asset rule must come after the catch-all; reversed, every asset
  // would be no-cache and the hashed filenames would buy nothing.
  it('caches content-hashed assets forever, in shared caches too', () => {
    expect(headersFor(config, PATHS.asset)['Cache-Control']).toBe(
      'public, max-age=31536000, immutable',
    )
  })

  it('does not treat a path that merely starts with "assets" as an asset', () => {
    expect(headersFor(config, '/assetsfoo')['Cache-Control']).toBe('no-cache')
  })
})

describe('routing', () => {
  it('serves dist/', () => {
    expect(hosting.public).toBe('dist')
  })

  // Deep links and refresh need the shell. A missing chunk must 404 instead,
  // or a stale tab asking for the previous build's file gets index.html
  // served as JavaScript. Firebase honours the negated glob; measured.
  it('falls back to the shell for everything except assets', () => {
    expect(hosting.rewrites).toEqual([
      { source: '!/assets/**', destination: '/index.html' },
    ])
  })
})
