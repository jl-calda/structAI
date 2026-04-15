/**
 * GET /api/bridge/status
 *
 * Thin health check — pings the bridge's own status endpoint and returns
 * { connected: boolean }. Used by the UI sync banner to show green / amber.
 *
 * See docs/08-routes.md.
 */
import { ok } from '@/lib/api/response'
import { env } from '@/lib/env'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 1500)
  try {
    const res = await fetch(`${env.BRIDGE_URL}/status`, {
      signal: controller.signal,
      cache: 'no-store',
    })
    return ok({ connected: res.ok })
  } catch {
    return ok({ connected: false })
  } finally {
    clearTimeout(timeout)
  }
}
