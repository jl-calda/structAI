# 01 — Tech Stack

## Packages
- **Next.js 16.2** — App Router, Turbopack (default), `use cache`, `proxy.ts`
- **TypeScript 5.x** — strict mode, no `any`
- **Supabase** — PostgreSQL + Realtime + Storage. No RLS. Anon key is fine.
- **Tailwind CSS v4** — utility classes + CSS variables
- **Claude API** — `claude-sonnet-4-20250514`, streaming
- **React-PDF** — server-side PDF generation
- **pnpm** — package manager

## No Auth — Important
No NextAuth. No Google OAuth. No login page. No session checks anywhere.
`proxy.ts` blocks `/api/bridge/*` from non-localhost callers only.
Every other route and page is fully open.

## Next.js 16.2 specifics
- `'use cache'` on `getMemberList()`, `getCombinations()`, `getEnvelope()` — invalidated on sync
- Design pages: NOT cached — rebar config changes too frequently
- `proxy.ts` replaces `middleware.ts` — rename file, change export name to `proxy`
- React Compiler: enable for beam design page only (`reactCompiler: true` in next.config)
- `AGENTS.md` in root — instructs agents to read docs/ before writing code

## Scaffold
```bash
pnpm create next-app@latest structai --typescript --tailwind --app --turbopack
pnpm add @supabase/supabase-js @supabase/ssr @anthropic-ai/sdk @react-pdf/renderer
```
