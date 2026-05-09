import { NextRequest, NextResponse } from 'next/server'

const BRIDGE_URL = process.env.BRIDGE_URL ?? 'http://localhost:8765'

/**
 * POST /api/bridge/query
 *
 * Proxies live OpenSTAAD queries to the Python bridge.
 * Body: { action: "members" | "search" | "forces", ...params }
 *
 * Actions:
 *   members: { project_id, member_ids? }  → geometry for specific/all members
 *   search:  { project_id, section_name?, member_type?, floor_y_min?, floor_y_max? }
 *   forces:  { project_id, member_ids, combo_numbers? }  → section forces
 */
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { action, ...params } = body

  if (!action) {
    return NextResponse.json({ ok: false, error: 'Missing action' }, { status: 400 })
  }

  const bridgeEndpoint: Record<string, string> = {
    members: '/query/members',
    search: '/query/search',
    forces: '/query/forces',
  }

  const path = bridgeEndpoint[action]
  if (!path) {
    return NextResponse.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 })
  }

  try {
    const secret = process.env.BRIDGE_SECRET ?? ''
    const res = await fetch(`${BRIDGE_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Bridge-Secret': secret,
      },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(15_000),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => 'unknown error')
      return NextResponse.json({ ok: false, error: `Bridge error: ${text}` }, { status: res.status })
    }

    const data = await res.json()
    return NextResponse.json(data)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('timeout') || msg.includes('ECONNREFUSED')) {
      return NextResponse.json({
        ok: false,
        error: 'Bridge not reachable — is STAAD Pro running with the bridge service?',
        offline: true,
      }, { status: 503 })
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
