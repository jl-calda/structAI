import { NextResponse, type NextRequest } from 'next/server'

/**
 * proxy.ts — the only edge proxy/middleware in the app.
 *
 * Gates `/api/bridge/*` so only the Python STAAD bridge can call it.
 * Two mechanisms, either one sufficient:
 *
 *   1. **Localhost IP** — when Next.js runs locally on the same box as
 *      the bridge (typical dev setup). Checked via x-forwarded-for /
 *      x-real-ip headers; absent headers treated as same-host.
 *
 *   2. **X-Bridge-Secret header** — when the app is deployed to Vercel
 *      and the bridge POSTs from a remote machine (typical production
 *      setup). The secret is compared against the `BRIDGE_SECRET` env
 *      var set on Vercel.
 *
 * If neither passes, the request is rejected with 403.
 *
 * Everything outside `/api/bridge/*` passes through — the app has no
 * auth gate anywhere else (CLAUDE.md rule #1).
 */
export function proxy(request: NextRequest): NextResponse {
  if (request.nextUrl.pathname.startsWith('/api/bridge')) {
    // Check 1: valid bridge secret header.
    const secret = request.headers.get('x-bridge-secret')
    const expected = process.env.BRIDGE_SECRET
    if (secret && expected && secret === expected) {
      return NextResponse.next()
    }

    // Check 2: localhost IP.
    const forwarded = request.headers.get('x-forwarded-for')
    const ip =
      forwarded?.split(',')[0]?.trim() ??
      request.headers.get('x-real-ip') ??
      ''
    const isLocal =
      ip === '' ||
      ip === '127.0.0.1' ||
      ip === '::1' ||
      ip === '::ffff:127.0.0.1'
    if (isLocal) {
      return NextResponse.next()
    }

    return new NextResponse('Forbidden', { status: 403 })
  }
  return NextResponse.next()
}

export const config = {
  matcher: '/api/bridge/:path*',
}
