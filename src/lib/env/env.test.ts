import { describe, expect, it } from 'vitest'
import { parseEnv } from './env'

const valid = {
  VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
  VITE_SUPABASE_ANON_KEY: 'anon-key',
}

describe('parseEnv', () => {
  it('accepts a valid config and defaults the app env', () => {
    expect(parseEnv(valid)).toEqual({ ...valid, VITE_APP_ENV: 'development' })
  })

  it('rejects a missing anon key with an actionable message', () => {
    expect(() => parseEnv({ ...valid, VITE_SUPABASE_ANON_KEY: '' })).toThrow(
      /VITE_SUPABASE_ANON_KEY is required/,
    )
  })

  it('rejects a non-URL supabase url', () => {
    expect(() =>
      parseEnv({ ...valid, VITE_SUPABASE_URL: 'not-a-url' }),
    ).toThrow(/must be a valid URL/)
  })

  it('rejects an unknown app env', () => {
    expect(() => parseEnv({ ...valid, VITE_APP_ENV: 'staging' })).toThrow(
      /Invalid environment configuration/,
    )
  })
})
