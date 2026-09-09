import { z } from 'zod'

/**
 * Validated at module load so a missing variable fails loudly at boot, rather
 * than surfacing later as an opaque `fetch failed` against `undefined/rest/v1`.
 */
const schema = z.object({
  VITE_SUPABASE_URL: z.url({ error: 'VITE_SUPABASE_URL must be a valid URL' }),
  VITE_SUPABASE_ANON_KEY: z
    .string()
    .min(1, 'VITE_SUPABASE_ANON_KEY is required'),
  VITE_APP_ENV: z
    .enum(['development', 'preview', 'production'])
    .default('development'),
})

export type Env = z.infer<typeof schema>

export function parseEnv(source: Record<string, unknown>): Env {
  const result = schema.safeParse(source)
  if (!result.success) {
    const detail = result.error.issues
      .map(
        (issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`,
      )
      .join('\n')
    throw new Error(
      `Invalid environment configuration:\n${detail}\n\n` +
        'The committed .env has production values; check whether an override\n' +
        'in .env.local or .env.development.local blanks one of them.',
    )
  }
  return result.data
}

let cached: Env | null = null

/**
 * Memoised accessor. Deliberately lazy rather than a module-scope constant:
 * eager validation at import time makes this module impossible to import in a
 * test (and couples every importer to a fully-populated env). The first caller
 * is the Supabase client factory, which runs during boot, so a bad config still
 * fails immediately and visibly.
 */
export function getEnv(): Env {
  cached ??= parseEnv(import.meta.env)
  return cached
}

/** Test seam: drops the memoised value. */
export function resetEnvCache(): void {
  cached = null
}
