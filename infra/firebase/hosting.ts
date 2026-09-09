/**
 * Reads `firebase.json` and answers questions about it the way Firebase
 * Hosting would.
 *
 * `firebase.json` is the source of truth for the deployed site's routing and
 * response headers -- Firebase Hosting serves `dist/` as static files and
 * nothing else, so that file is the whole security posture. JSON has no
 * comments, so the reasons behind each value live in `hosting.test.ts`, which
 * asserts them.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export type HostingConfig = {
  hosting: {
    public: string
    ignore: Array<string>
    rewrites: Array<{ source: string; destination: string }>
    headers: Array<{
      source: string
      headers: Array<{ key: string; value: string }>
    }>
  }
}

export function readHostingConfig(): HostingConfig {
  const path = fileURLToPath(new URL('../../firebase.json', import.meta.url))
  return JSON.parse(readFileSync(path, 'utf8')) as HostingConfig
}

function globToRegExp(glob: string): RegExp {
  const escape = (part: string) => part.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  const body = glob
    .split('**')
    .map((segment) => segment.split('*').map(escape).join('[^/]*'))
    .join('.*')
  return new RegExp(`^${body}$`)
}

/**
 * The headers a request for `path` ends up with.
 *
 * Mirrors two Firebase behaviours that are not in its docs and were measured
 * against a deployed preview channel: rules match the REQUESTED path, not the
 * rewrite destination, and when two rules set the same header the LATER one
 * wins.
 */
export function headersFor(
  config: HostingConfig,
  path: string,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const rule of config.hosting.headers) {
    if (!globToRegExp(rule.source).test(path)) continue
    for (const { key, value } of rule.headers) out[key] = value
  }
  return out
}

/** CSP directive name -> its sources. */
export function cspDirectives(csp: string): Map<string, Array<string>> {
  const directives = new Map<string, Array<string>>()
  for (const part of csp.split(';')) {
    const [name, ...sources] = part.trim().split(/\s+/)
    if (name) directives.set(name, sources)
  }
  return directives
}

/**
 * Why the deployed CSP would block the Supabase project the bundle is built
 * against, or null if it would not.
 *
 * Run by `vite build`, so pointing `VITE_SUPABASE_URL` at another project
 * without updating `firebase.json` fails the build -- rather than deploying an
 * app whose CSP blocks its own API, or whose Realtime silently never connects.
 */
export function supabaseCspProblem(
  config: HostingConfig,
  supabaseUrl: string,
): string | null {
  const origin = new URL(supabaseUrl).origin
  const wsOrigin = origin.replace(/^https:/, 'wss:')
  const csp = cspDirectives(headersFor(config, '/')['Content-Security-Policy'])
  const missing = [
    ['connect-src', origin],
    ['connect-src', wsOrigin],
    ['img-src', origin],
  ].filter(([directive, source]) => !csp.get(directive)?.includes(source))
  if (missing.length === 0) return null
  return (
    `firebase.json's Content-Security-Policy does not allow ${origin}, which ` +
    `VITE_SUPABASE_URL points at. Missing: ` +
    missing.map(([d, s]) => `${s} in ${d}`).join(', ') +
    '. Update the CSP in firebase.json, or fix the URL in your .env override.'
  )
}
