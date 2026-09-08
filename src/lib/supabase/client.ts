import { createClient } from '@supabase/supabase-js'
import { getEnv } from '@/lib/env/env'
import type { Database } from './database.types'

export type SupabaseClient = ReturnType<typeof createSupabaseClient>

export function createSupabaseClient() {
  const env = getEnv()
  return createClient<Database>(
    env.VITE_SUPABASE_URL,
    env.VITE_SUPABASE_ANON_KEY,
    {
      auth: {
        // Mandatory for a public SPA: the code-exchange flow keeps tokens out of
        // the URL fragment, and both magic links and OAuth land on ?code=...
        flowType: 'pkce',
        detectSessionInUrl: true,
        autoRefreshToken: true,
        persistSession: true,
      },
    },
  )
}

/**
 * Module singleton for app code. Tests and Storybook build their own via
 * createSupabaseClient() (or a mock) rather than importing this.
 */
export const supabase: SupabaseClient = createSupabaseClient()
