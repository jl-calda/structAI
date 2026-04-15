/**
 * Bridge client — server-side wrapper around the Python bridge's HTTP
 * interface. Used for app-to-STAAD actions: push generated combos back,
 * request an immediate re-sync.
 *
 * Endpoints assumed on the bridge (see docs/13-bridge.md):
 *   POST /push-combinations  — accept app-generated combos
 *   POST /resync             — force an immediate sync cycle
 *
 * All calls are fire-and-forget-ish: short timeouts, graceful degradation.
 * If the bridge is offline, the Supabase write still succeeds and the UI
 * shows the amber "STAAD offline" banner.
 */
import 'server-only'

import { env } from '@/lib/env'
import type { CombinationFactor } from '@/lib/supabase/types'

export type BridgeOutcome = { ok: true } | { ok: false; error: string }

export type PushCombinationPayload = {
  project_id: string
  combinations: {
    combo_number: number
    title: string
    factors: CombinationFactor[]
  }[]
}

const TIMEOUT_MS = 4_000

async function bridgePost(path: string, body: unknown): Promise<BridgeOutcome> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`${env.BRIDGE_URL}${path}`, {
      method: 'POST',
      signal: controller.signal,
      cache: 'no-store',
      headers: {
        'content-type': 'application/json',
        // Same header the bridge sends on inbound sync — used here to
        // authenticate app→bridge calls in case the bridge binds beyond
        // localhost (it shouldn't, but defence in depth).
        'x-bridge-secret': env.BRIDGE_SECRET,
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      return { ok: false, error: `bridge ${path}: ${res.status} ${res.statusText}` }
    }
    return { ok: true }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return { ok: false, error: `bridge ${path}: ${message}` }
  } finally {
    clearTimeout(timeout)
  }
}

export function pushCombinations(
  payload: PushCombinationPayload,
): Promise<BridgeOutcome> {
  return bridgePost('/push-combinations', payload)
}

export function requestResync(projectId: string): Promise<BridgeOutcome> {
  return bridgePost('/resync', { project_id: projectId })
}
