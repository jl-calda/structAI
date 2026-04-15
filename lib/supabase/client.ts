/**
 * Supabase client for browser / client components.
 * Uses the anon key only — never ship the service-role key to the browser.
 */
import { createBrowserClient } from '@supabase/ssr'

import { env } from '@/lib/env'
import type { Database } from '@/lib/supabase/types'

export function createClient() {
  return createBrowserClient<Database>(env.SUPABASE_URL, env.SUPABASE_ANON_KEY)
}
