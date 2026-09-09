#!/usr/bin/env node
/**
 * Fails the build on any Supabase advisor finding that is not explicitly
 * accepted in `supabase/advisor-allowlist.json`.
 *
 * WHY THIS EXISTS
 *
 * The advisors are the only automated review of the parts of this system that
 * live in the database -- RLS, grants, definer functions, view rights. The
 * dashboard shows them, but nobody looks at a dashboard on a pull request, and
 * a project that carries permanent accepted findings trains people to ignore
 * the whole panel. Splinter, the linter behind the advisors, has no
 * suppression mechanism: `cache_key` exists in its lint interface for exactly
 * this purpose but has no user-facing exclusion list. So the list lives here,
 * and adding to it is a reviewed diff with a written reason.
 *
 * Findings are keyed on `cache_key`, which the Management API returns (the MCP
 * tool omits it) and which splinter documents as "a short, uniquely
 * identifiable string that users can add to an exclusion list".
 *
 * A stale allowlist entry -- one that no longer matches any finding -- is also
 * a failure. An exception that has outlived its reason is how an allowlist
 * turns into a place where real findings go to hide.
 *
 * POLICY
 *
 *   security     every finding must be allowlisted, at every level. There are
 *                few of them and each one means something.
 *   performance  WARN and above must be allowlisted. INFO is not gated: it is
 *                dominated by `unindexed_foreign_keys` on columns nothing
 *                queries and `unused_index`, which reports every index in a
 *                database that has not served production traffic yet -- so on
 *                a fresh project it flags the indexes that were added on
 *                purpose. Counted and printed, never fatal.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ALLOWLIST_PATH = join(HERE, '..', 'supabase', 'advisor-allowlist.json')

const PERFORMANCE_GATED_LEVELS = new Set(['WARN', 'ERROR'])

const token = process.env.SUPABASE_ACCESS_TOKEN
const projectRef = process.env.SUPABASE_PROJECT_REF

if (!projectRef) {
  console.error('SUPABASE_PROJECT_REF is not set.')
  process.exit(2)
}
if (!token) {
  console.error(
    'SUPABASE_ACCESS_TOKEN is not set. This check talks to the Supabase\n' +
      'Management API and cannot run without it. Set it as a repository\n' +
      'secret rather than skipping the check.',
  )
  process.exit(2)
}

/** @param {string} kind */
async function fetchLints(kind) {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/advisors/${kind}`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!res.ok) {
    // Never echo the token, including via an error body that may quote the
    // request.
    throw new Error(`advisors/${kind} returned HTTP ${res.status}`)
  }
  const body = await res.json()
  return body.lints ?? []
}

const allowlist = JSON.parse(readFileSync(ALLOWLIST_PATH, 'utf8'))
/** @type {Map<string, string>} cache_key -> reason */
const accepted = new Map(
  Object.entries(allowlist.accepted ?? {}).map(([k, v]) => [k, String(v)]),
)

const [security, performance] = await Promise.all([
  fetchLints('security'),
  fetchLints('performance'),
])

const gated = [
  ...security.map((l) => ({ ...l, kind: 'security' })),
  ...performance
    .filter((l) => PERFORMANCE_GATED_LEVELS.has(l.level))
    .map((l) => ({ ...l, kind: 'performance' })),
]

const ungatedInfo = performance.filter(
  (l) => !PERFORMANCE_GATED_LEVELS.has(l.level),
).length

const unexpected = gated.filter((l) => !accepted.has(l.cache_key))
const seen = new Set(gated.map((l) => l.cache_key))
const stale = [...accepted.keys()].filter((k) => !seen.has(k))

const rank = { ERROR: 0, WARN: 1, INFO: 2 }
unexpected.sort(
  (a, b) =>
    (rank[a.level] ?? 9) - (rank[b.level] ?? 9) || a.name.localeCompare(b.name),
)

console.log(
  `advisors: ${gated.length} gated finding(s), ${accepted.size} accepted, ` +
    `${ungatedInfo} performance INFO not gated`,
)

if (unexpected.length > 0) {
  console.error(
    `\n${unexpected.length} advisor finding(s) not in the allowlist:\n`,
  )
  for (const l of unexpected) {
    console.error(`  [${l.level}] ${l.kind}/${l.name}`)
    console.error(`    ${String(l.detail).replace(/\\`/g, '`')}`)
    console.error(`    cache_key: ${l.cache_key}`)
    console.error(`    ${l.remediation}\n`)
  }
  console.error(
    'Fix it, or add the cache_key to supabase/advisor-allowlist.json with a\n' +
      'reason saying why it is correct. Do not add one to make CI pass.',
  )
}

if (stale.length > 0) {
  console.error(
    `\n${stale.length} allowlist entr(y/ies) no longer match any finding:\n`,
  )
  for (const k of stale) console.error(`  ${k}`)
  console.error(
    '\nRemove them. A stale exception is where a real finding hides next time\n' +
      'the same object is flagged.',
  )
}

if (unexpected.length > 0 || stale.length > 0) process.exit(1)
console.log('advisors: clean')
