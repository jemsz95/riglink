#!/usr/bin/env node
/**
 * Fails the build when a portal contact can read a column nobody signed off.
 *
 * WHY THIS EXISTS
 *
 * RLS filters rows, not columns, and Supabase has a single `authenticated`
 * role. So a policy that lets a client read their own job rows lets them read
 * EVERY COLUMN of those rows. Adding a staff-only column to `jobs`,
 * `clients`, `sites`, `quotes` or `job_evidence` therefore ships it to
 * customers, silently, with no lint and no test failure -- which is exactly
 * how `jobs.internal_notes`, `clients.notes`, `sites.access_notes` and
 * `quotes.internal_note` were readable for two phases before anyone looked,
 * and how `job_status_events.reason` was one dispatcher's keystroke away from
 * joining them.
 *
 * The project's rule (see README, "Row-shaped vs field-shaped") is that a
 * staff-only FIELD on a client-visible row goes in a side table. This check is
 * what makes the rule stick: it enumerates the real exposure surface from the
 * catalogue and compares it to `supabase/portal-exposure.json`, where every
 * readable column is listed with a reason. A new column fails until it is
 * either moved to a side table or written down.
 *
 * Both directions fail, deliberately:
 *   - a column in the database but not the inventory -- something leaked
 *   - a column in the inventory but not the database -- the inventory is
 *     stale, and a stale inventory is where the next leak hides
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const INVENTORY_PATH = join(HERE, '..', 'supabase', 'portal-exposure.json')

const token = process.env.SUPABASE_ACCESS_TOKEN
const projectRef = process.env.SUPABASE_PROJECT_REF
if (!projectRef || !token) {
  console.error(
    'SUPABASE_PROJECT_REF and SUPABASE_ACCESS_TOKEN are both required. This\n' +
      'check reads the database catalogue through the Management API; set them\n' +
      'as repository secrets rather than skipping it.',
  )
  process.exit(2)
}

/**
 * A table is portal-readable when some SELECT or ALL policy on it consults
 * `app.portal_clients()`. Derived from the catalogue rather than hardcoded, so
 * adding a portal policy to a new table brings that table under the check
 * automatically -- which is the case most likely to be forgotten.
 */
const QUERY = `
  with portal_tables as (
    select distinct tablename
    from pg_policies
    where schemaname = 'public'
      and cmd in ('SELECT', 'ALL')
      and coalesce(qual, '') like '%portal_clients()%'
  )
  select c.table_name, c.column_name
  from information_schema.columns c
  join portal_tables p on p.tablename = c.table_name
  where c.table_schema = 'public'
  order by c.table_name, c.ordinal_position
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
const rows = await res.json()

/** @type {Map<string, Set<string>>} */
const live = new Map()
for (const { table_name, column_name } of rows) {
  if (!live.has(table_name)) live.set(table_name, new Set())
  live.get(table_name).add(column_name)
}

const inventory = JSON.parse(readFileSync(INVENTORY_PATH, 'utf8'))
const declared = inventory.tables ?? {}

const unlisted = []
const stale = []

for (const [table, columns] of live) {
  const entry = declared[table]
  if (!entry) {
    unlisted.push({ table, column: '(whole table)' })
    continue
  }
  for (const column of columns) {
    if (!(column in entry.columns)) unlisted.push({ table, column })
  }
  for (const column of Object.keys(entry.columns)) {
    if (!columns.has(column)) stale.push({ table, column })
  }
}
for (const table of Object.keys(declared)) {
  if (!live.has(table)) stale.push({ table, column: '(whole table)' })
}

const total = [...live.values()].reduce((n, s) => n + s.size, 0)
console.log(
  `portal exposure: ${live.size} table(s), ${total} column(s) readable by a client contact`,
)

if (unlisted.length > 0) {
  console.error(
    `\n${unlisted.length} column(s) a portal contact can read are not in the inventory:\n`,
  )
  for (const { table, column } of unlisted) {
    console.error(`  public.${table}.${column}`)
  }
  console.error(
    '\nRLS cannot hide a column. If this is staff-only, move it to a side\n' +
      'table with its own policies (see job_internal_notes and friends). If a\n' +
      'client is genuinely meant to see it, add it to\n' +
      'supabase/portal-exposure.json with a one-line reason.',
  )
}

if (stale.length > 0) {
  console.error(`\n${stale.length} inventory entr(y/ies) no longer exist:\n`)
  for (const { table, column } of stale) {
    console.error(`  public.${table}.${column}`)
  }
  console.error('\nRemove them, so the inventory keeps describing reality.')
}

if (unlisted.length > 0 || stale.length > 0) process.exit(1)
console.log('portal exposure: every readable column is accounted for')
