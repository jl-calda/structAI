/**
 * Service-role Supabase client. Server-only. Bypasses RLS and anon limits.
 *
 * Used exclusively by the bridge sync endpoint for bulk upsert into the
 * Object 1 (STAAD mirror) tables. Never import this into a client
 * component — the service-role key must never reach the browser.
 *
 * See docs/12-conventions.md `Supabase` and docs/08-routes.md `Bridge sync`.
 */
import 'server-only'

import { createClient } from '@supabase/supabase-js'

import { env } from '@/lib/env'
import type { Database } from '@/lib/supabase/types'

export function createServiceClient() {
  return createClient<Database>(
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  )
}
