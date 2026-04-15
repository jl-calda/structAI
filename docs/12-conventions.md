# 12 — Conventions

## Naming
- DB tables: `snake_case`
- TypeScript interfaces: `PascalCase`, no `I` prefix
- Components: `PascalCase.tsx`
- Hooks: `use` prefix — `useSyncStatus`, `useBeamDesign`
- Engineering functions: `camelCase`, CodeProvider always last arg — `runBeamGroupDesign(beams, code)`
- API routes: `/api/[noun]/[verb]` — `/api/design/beam`, `/api/bridge/sync`

## Error handling
- API routes always return `{ ok: true, data }` or `{ ok: false, error: string }`
- HTTP status: 400 bad input · 404 not found · 500 engine error
- Bridge sync: malformed payload → 400 + log, never crash
- Design engine: invalid input → return `{ status: 'fail', reason: string }`, never throw
- Client components: React Error Boundary around all design pages

## TypeScript
- Strict mode. No `any`.
- All Supabase table types generated with `supabase gen types typescript`
- Engineering lib: all units in JSDoc — `/** @param fc_mpa concrete compressive strength in MPa */`

## Supabase
- Browser pages: `lib/supabase/client.ts` — `createBrowserClient()`
- Server components + route handlers: `lib/supabase/server.ts` — `createServerClient()`
- Bridge sync writes: `SUPABASE_SERVICE_ROLE_KEY` — bypasses anon restrictions
- Upsert on all Object 1 tables — never plain insert (re-syncs overwrite)

## Environment variables
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=    # server-only
ANTHROPIC_API_KEY=
BRIDGE_URL=http://localhost:8765
BRIDGE_SECRET=                # included in X-Bridge-Secret header by Python bridge
```
No Google OAuth vars. No NEXTAUTH_SECRET. No session vars.

## `middleware.ts` (the only middleware)
Next.js 16.2 introduced `proxy.ts` as the rename for `middleware.ts`.
That rename works locally but Vercel's current deployment pipeline does
not always register a `proxy.ts` file as edge middleware — the file
exists, no matcher engages, and every path 404s. Until Vercel ships
full `proxy.ts` support we stay on `middleware.ts` with
`export function middleware`, which is the universally recognised form.
```typescript
// middleware.ts — only blocks bridge endpoints from non-localhost.
// Note: NextRequest.ip was removed in Next.js 15+. Derive the caller IP from
// headers only. On a plain local dev server with no proxy in front, forwarded
// headers are absent — that path represents a same-host caller and is allowed.
export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/api/bridge')) {
    const forwarded = request.headers.get('x-forwarded-for')
    const ip = forwarded?.split(',')[0].trim() ?? request.headers.get('x-real-ip') ?? ''
    const isLocal =
      !ip || ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1'
    if (!isLocal) {
      return new NextResponse('Forbidden', { status: 403 })
    }
  }
  return NextResponse.next()
}
export const config = { matcher: '/api/bridge/:path*' }
```
No auth check. No session check. No redirect to login.

## Testing
- Engineering lib: unit test every CodeProvider method against textbook examples
- Beam engine: verify per-beam bend points are different from max-of-maxima result
- API routes: test bridge sync with valid and malformed payloads
