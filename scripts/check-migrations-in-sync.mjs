#!/usr/bin/env node
/**
 * Fails if the repo's migrations and the project's applied migrations differ.
 *
 * This repo is the source of truth: `config.toml` and `supabase/migrations`
 * ship together, so an instance running a different set is a deployment bug,
 * not a runtime state to design around. Catching it here is the whole reason
 * the app has no runtime "is the schema deployed?" checks.
 *
 * Takes the path to the JSON that `supabase migration list --project-ref ...`
 * writes. Each entry has `local` and `remote` version strings; either side
 * being absent means that migration exists in only one place.
 */
import { readFileSync } from 'node:fs'

const path = process.argv[2]
if (!path) {
  console.error('usage: check-migrations-in-sync.mjs <migration-list.json>')
  process.exit(2)
}

const raw = readFileSync(path, 'utf8')
// The CLI prints progress lines before the JSON payload.
const line = raw
  .split('\n')
  .map((l) => l.trim())
  .find((l) => l.startsWith('{'))
if (!line) {
  console.error('no JSON object found in the migration list output')
  process.exit(2)
}

const { migrations = [] } = JSON.parse(line)
const localOnly = migrations
  .filter((m) => m.local && !m.remote)
  .map((m) => m.local)
const remoteOnly = migrations
  .filter((m) => m.remote && !m.local)
  .map((m) => m.remote)

console.log(`migrations: ${migrations.length} tracked`)

if (localOnly.length > 0) {
  console.error(
    `\nIn the repo but not applied to the project:\n  ${localOnly.join('\n  ')}`,
  )
  console.error('\nRun `npm run db:push`.')
}
if (remoteOnly.length > 0) {
  console.error(
    `\nApplied to the project but not in the repo:\n  ${remoteOnly.join('\n  ')}`,
  )
  console.error(
    '\nSomeone changed the database outside this repo. Capture it as a\n' +
      'migration before anything else lands.',
  )
}

if (localOnly.length > 0 || remoteOnly.length > 0) process.exit(1)
console.log('migrations: in sync')
