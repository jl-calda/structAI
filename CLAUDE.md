# StructAI — Claude Code Index

Personal structural engineering design app. STAAD Pro is the analysis engine. StructAI is the design layer.

## Read only what you need for the current task

| Task | Read these files |
|------|-----------------|
| Starting / scaffolding | `docs/01-stack.md` · `docs/12-conventions.md` |
| Database migrations | `docs/03-schema.md` |
| STAAD sync + bridge endpoint | `docs/02-architecture.md` · `docs/13-bridge.md` · `docs/08-routes.md` |
| Load combination builder | `docs/03-schema.md` · `docs/09-pages.md` |
| Engineering lib (CodeProvider) | `docs/04-engineering-lib.md` |
| Beam design engine | `docs/05-beam-engine.md` · `docs/06-elements.md` |
| Column / slab / footing engines | `docs/06-elements.md` |
| Any page UI | `docs/07-design-system.md` · `docs/10-ui-layouts.md` |
| API routes | `docs/08-routes.md` |
| Build order / what to do next | `docs/11-build-phases.md` |
| Env vars / naming / error handling | `docs/12-conventions.md` |
| Python bridge spec | `docs/13-bridge.md` |

## The three things that matter most

1. **No login required.** App opens directly to `/dashboard`. No auth gate anywhere. No NextAuth. No login page. `proxy.ts` only restricts `/api/bridge/*` to localhost.

2. **STAAD is geometry authority. App is design authority.** App cannot edit member sizes, sections, or geometry — those controls are locked. STAAD results are cached in Supabase after each sync.

3. **Beam design uses per-beam diagrams, not max-of-maxima.** The engine reads the full M(x) and V(x) curve per beam, not just peak values. Bend points come from each beam's own moment diagram. See `docs/05-beam-engine.md`.
