#!/usr/bin/env node
/**
 * Fails the build on SQL patterns that are wrong in a way nothing else catches.
 *
 * Each rule here exists because the pattern it finds ALREADY SHIPPED once and
 * was silent: no error, no failing test, no advisor finding. A rule earns its
 * place by having cost something.
 *
 *   citext-under-empty-search-path
 *     Every function in this project pins `set search_path = ''`, which is
 *     right. But operators resolve by name through the search_path, and the
 *     `=` for `citext` lives in `extensions` -- so with an empty search_path
 *     it is invisible and PostgreSQL silently falls back to the implicit cast
 *     to text and `text = text`, which is case-SENSITIVE.
 *
 *     Same syntax, opposite semantics, no warning. `bootstrap_session` matched
 *     `client_contacts.email` this way for three phases, so a contact invited
 *     as `Sam@Firm.com` who signed up as `sam@firm.com` never had their
 *     invitation claimed -- and it looked like nothing had happened at all.
 *     The fix is to name the schema: `a operator(extensions.=) b`.
 *
 *     Checking it by hand in psql shows the CORRECT answer, because an
 *     interactive session has a normal search_path. That is exactly why a
 *     human will not catch this one.
 */
import { readFileSync } from 'node:fs'

const projectRef = process.env.SUPABASE_PROJECT_REF
const token = process.env.SUPABASE_ACCESS_TOKEN
if (!projectRef || !token) {
  console.error(
    'SUPABASE_PROJECT_REF and SUPABASE_ACCESS_TOKEN are both required.',
  )
  process.exit(2)
}

/**
 * Finds functions that pin an empty search_path and compare a citext column
 * with a bare `=`.
 *
 * Reads the CATALOGUE rather than the migration files: what matters is what is
 * deployed, and a function can be replaced by a later migration, by a branch,
 * or by hand in the dashboard.
 */
const QUERY = `
  with citext_columns as (
    select distinct c.column_name
    from information_schema.columns c
    where c.table_schema = 'public' and c.udt_name = 'citext'
  ),
  pinned_functions as (
    select n.nspname as schema_name, p.proname, p.prosrc
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'app')
      -- Array membership, NOT \`proconfig::text like '%search_path=""%'\`.
      -- The text rendering backslash-escapes the quotes, so the LIKE never
      -- matches and the check silently examines nothing. Verified by
      -- deliberately reintroducing the bug and watching it pass.
      and 'search_path=""' = any(p.proconfig)
  ),
  -- Remove the CORRECT forms before looking for the incorrect one, so a
  -- function containing both a fixed comparison and a new broken one is still
  -- caught. Excluding the whole function when it mentions operator() would
  -- hide exactly that case.
  stripped as (
    select f.schema_name, f.proname, cc.column_name,
           regexp_replace(
             regexp_replace(
               f.prosrc,
               cc.column_name || '\\s*operator\\([^)]*\\)', '', 'g'
             ),
             'set\\s+' || cc.column_name || '\\s*=', '', 'gi'
           ) as src
    from pinned_functions f
    cross join citext_columns cc
  )
  select schema_name, proname, column_name
  from stripped
  -- A word boundary that ALLOWS a qualifier: \`c.email =\` is the common
  -- shape and was the one the first version of this check missed.
  where src ~ ('(^|[^[:alnum:]_])' || column_name || '\\s*=\\s*')
  order by 1, 2, 3
`

const res = await fetch(
  `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
  {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: QUERY }),
  },
)
if (!res.ok) {
  console.error(`database/query returned HTTP ${res.status}`)
  process.exit(2)
}

const findings = await res.json()

/**
 * Comparisons that are genuinely fine despite matching the pattern.
 *
 * Keyed `schema.function:column`, each with a reason. Same contract as the
 * advisor allowlist: an entry that no longer matches is itself a failure, so
 * these cannot rot.
 */
const ACCEPTED = new Map(
  Object.entries(
    JSON.parse(
      readFileSync(
        new URL('../supabase/sql-conventions-allowlist.json', import.meta.url),
        'utf8',
      ),
    ).accepted ?? {},
  ),
)

const keyOf = (f) => `${f.schema_name}.${f.proname}:${f.column_name}`
const unexpected = findings.filter((f) => !ACCEPTED.has(keyOf(f)))
const seen = new Set(findings.map(keyOf))
const stale = [...ACCEPTED.keys()].filter((k) => !seen.has(k))

console.log(
  `sql conventions: ${findings.length} citext comparison(s) flagged, ` +
    `${ACCEPTED.size} accepted`,
)

if (unexpected.length > 0) {
  console.error(
    `\n${unexpected.length} citext comparison(s) using a bare \`=\` inside a ` +
      "function with `search_path = ''`:\n",
  )
  for (const f of unexpected) {
    console.error(`  ${f.schema_name}.${f.proname}  compares ${f.column_name}`)
  }
  console.error(
    '\nWith an empty search_path the citext `=` operator is not visible and\n' +
      'PostgreSQL silently uses `text = text`, which is CASE-SENSITIVE. Write\n' +
      '  a operator(extensions.=) b\n' +
      'instead. Checking it in psql will show the right answer and prove\n' +
      'nothing: an interactive session has a normal search_path.',
  )
}

if (stale.length > 0) {
  console.error(`\n${stale.length} allowlist entr(y/ies) no longer match:\n`)
  for (const key of stale) console.error(`  ${key}`)
  console.error('\nRemove them.')
}

if (unexpected.length > 0 || stale.length > 0) process.exit(1)
console.log('sql conventions: clean')
