import { NextResponse, type NextRequest } from 'next/server'

/**
 * proxy.ts — the only edge proxy/middleware in the app.
 *
 * Next.js 16.2 deprecated `middleware.ts` in favour of `proxy.ts`. When
 * we tried middleware.ts on Vercel, Next's compat layer generated an
 * edge bundle that referenced `__dirname` — a Node global that Edge
 * Runtime does not provide — causing MIDDLEWARE_INVOCATION_FAILED on
 * every matched request. The 16.2 form (this file) emits clean edge
 * output.
 *
 * The app itself is fully open (no auth, no login, no session). This
 * gate exists for a single reason: `/api/bridge/*` must only be
 * callable by the Python STAAD bridge running on the same host.
 * Everything else passes.
 *
 * Note: NextRequest.ip was removed in Next.js 15+. We derive the caller
 * IP from forwarded headers only. If no forwarded headers are present
 * (plain local dev server with no reverse proxy in front) we treat the
 * caller as same-host, which is the only way the bridge can reach us in
 * that setup.
 */
export function proxy(request: NextRequest): NextResponse {
  if (request.nextUrl.pathname.startsWith('/api/bridge')) {
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
    if (!isLocal) {
      return new NextResponse('Forbidden', { status: 403 })
    }
  }
  return NextResponse.next()
}

export const config = {
  matcher: '/api/bridge/:path*',
}
