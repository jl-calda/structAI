import { NextResponse, type NextRequest } from 'next/server'

/**
 * middleware.ts — the only edge middleware in the app.
 *
 * The spec (docs/01-stack.md:20) originally asked for `proxy.ts`, the
 * Next.js 16.2 rename. That file name works locally but Vercel's current
 * deployment pipeline doesn't always register a `proxy.ts` file as edge
 * middleware — it falls through and the whole site 404s. Until Vercel
 * ships full proxy.ts support we stay on `middleware.ts`, which is the
 * universally recognised form.
 *
 * The app itself is fully open (no auth, no login, no session). This gate
 * exists for a single reason: `/api/bridge/*` must only be callable by the
 * Python STAAD bridge running on the same host. Everything else passes.
 *
 * Note: NextRequest.ip was removed in Next.js 15+. We derive the caller IP
 * from forwarded headers only. If no forwarded headers are present (plain
 * local dev server with no reverse proxy in front) we treat the caller as
 * same-host, which is the only way the bridge can reach us in that setup.
 */
export function middleware(request: NextRequest): NextResponse {
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
