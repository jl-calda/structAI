/**
 * Supabase client for server components and route handlers.
 * Uses the anon key. For bridge writes that need to bypass anon limits,
 * use `createServiceClient()` from `./service.ts` instead — that client
 * holds the service-role key and must only run on the server.
 */
import 'server-only'
import { cookies } from 'next/headers'

import { createServerClient, type CookieOptions } from '@supabase/ssr'

import { env } from '@/lib/env'
import type { Database } from '@/lib/supabase/types'

type MutableCookie = { name: string; value: string; options?: CookieOptions }

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient<Database>(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet: MutableCookie[]) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options)
          }
        } catch {
          // Called from a Server Component where cookies are read-only.
          // We don't use cookie-based auth anyway (no login), so this is safe
          // to swallow — the anon client never writes a session cookie.
        }
      },
    },
  })
}
