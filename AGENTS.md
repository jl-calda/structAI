# Agent Instructions

Before writing any code in this repo, **read `CLAUDE.md`** — it is the index
for the spec in `docs/` and tells you exactly which docs are relevant to your
current task.

## Hard rules (do not violate)

1. **No auth.** No login page, no NextAuth, no session checks, no Google OAuth.
   The app opens directly to `/dashboard`. `proxy.ts` only gates
   `/api/bridge/*` to localhost. See `docs/01-stack.md` and
   `docs/12-conventions.md`.

2. **STAAD is geometry authority.** The app cannot edit STAAD-owned fields
   (section sizes, spans, supports). Those controls are locked in the UI. See
   `docs/02-architecture.md`.

3. **Beam design uses per-beam diagrams, never max-of-maxima.** The engine
   must read each beam's full `M(x)` / `V(x)` from `staad_diagram_points` and
   compute bend points from that beam's own curve. See `docs/05-beam-engine.md`.

4. **Physics files never change when adding a new code.** All code-specific
   numbers live in `lib/engineering/codes/*.ts`. `flexure.ts`, `shear.ts`,
   `development.ts`, `bend-points.ts` are code-agnostic. See
   `docs/04-engineering-lib.md`.

5. **CodeProvider is always the last argument** of engine functions:
   `runBeamGroupDesign(beams, code)`. See `docs/12-conventions.md`.

6. **Units are fixed:** mm, kN, kN·m, MPa. No conversions at the boundary —
   both DB and engine use these units everywhere.

## Build order

Follow `docs/11-build-phases.md` exactly. Do not skip ahead.

## Before editing

- If you are about to modify a file you have not read, read it first.
- If you are about to add a new code-standard specific number anywhere outside
  `lib/engineering/codes/`, stop — that number belongs in a CodeProvider.
