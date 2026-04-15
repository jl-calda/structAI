# 11 — Build Phases

Complete tasks in this exact order. Do not skip ahead.

---

## Phase 1 — Shell + STAAD Sync
> Read: `docs/01-stack.md`, `docs/02-architecture.md`, `docs/03-schema.md`, `docs/08-routes.md`, `docs/12-conventions.md`, `docs/13-bridge.md`

- [ ] Scaffold Next.js 16.2 with Turbopack + Supabase (no auth packages)
- [ ] `proxy.ts` — block `/api/bridge/*` from non-localhost. Pass all other requests through.
- [ ] Supabase client files: `lib/supabase/client.ts` (browser) + `lib/supabase/server.ts` (RSC)
- [ ] Database migration: `projects` + all `staad_*` tables (including `staad_diagram_points`)
- [ ] Seed `load_templates` with NSCP 2015 LRFD and ACI 318-19 LRFD
- [ ] `POST /api/bridge/sync` route — validate `X-Bridge-Secret`, upsert all Object 1 tables
- [ ] `GET /api/bridge/status` route
- [ ] Projects CRUD: `/dashboard` page + create/open project
- [ ] App shell: sidebar + top nav + content area layout
- [ ] STAAD frame viewer SVG component (`components/staad/FrameViewer.tsx`)
- [ ] Sync banner component (`components/layout/SyncBanner.tsx`)
- [ ] Project overview page with sync status + stat cards

---

## Phase 2 — Load Combination Builder
> Read: `docs/03-schema.md`, `docs/09-pages.md`

- [ ] Load combination builder UI on `/projects/[id]/setup` Tab 2
- [ ] Generate combinations from template + basic load inputs
- [ ] `staad_combinations` table writes
- [ ] Push generated combos to STAAD via bridge (`lib/staad/bridge-client.ts`)
- [ ] Envelope computation: read `staad_diagram_points` → write `staad_envelope`
- [ ] `/projects/[id]/combinations` page — combinations table + envelope summary
- [ ] `/projects/[id]/members` page — member table with assignment controls

---

## Phase 3 — Beam Design Module
> Read: `docs/04-engineering-lib.md`, `docs/05-beam-engine.md`, `docs/06-elements.md`, `docs/07-design-system.md`, `docs/10-ui-layouts.md`

- [ ] `lib/engineering/codes/index.ts` — CodeProvider interface + `getCode()` registry
- [ ] `lib/engineering/codes/aci318-19.ts` — full ACI implementation
- [ ] `lib/engineering/codes/nscp2015.ts` — spread ACI, override Vc/Ld/rho_temp/seismic
- [ ] `lib/engineering/concrete/beam/flexure.ts` — physics (no code-specific values)
- [ ] `lib/engineering/concrete/beam/shear.ts`
- [ ] `lib/engineering/concrete/beam/development.ts`
- [ ] `lib/engineering/concrete/beam/bend-points.ts` — find x where M(x) ≤ φMn(perimeter)
- [ ] `lib/engineering/concrete/beam/group-engine.ts` — 5-step per-beam group algorithm
- [ ] Database migration: `beam_designs`, `beam_reinforcement`, `beam_checks`
- [ ] `POST /api/design/beam` route
- [ ] Beam design page — all components per layout in `docs/10-ui-layouts.md`
- [ ] Material takeoff generation for beams

---

## Phase 4 — Column + Slab + Footing
> Read: `docs/06-elements.md`, `docs/10-ui-layouts.md`

- [ ] `lib/engineering/concrete/column/interaction.ts` — P-M strain sweep
- [ ] `lib/engineering/concrete/column/index.ts`
- [ ] Database migration: column tables
- [ ] `POST /api/design/column` + column design page
- [ ] `lib/engineering/concrete/slab/one-way.ts` + `two-way.ts`
- [ ] Database migration: slab tables
- [ ] `POST /api/design/slab` + slab design page
- [ ] `lib/engineering/concrete/footing/index.ts` + `bearing.ts`
- [ ] Database migration: footing tables
- [ ] `POST /api/design/footing` + footing design page
- [ ] Full MTO page (all element types)

---

## Phase 5 — Reports + AI
- [ ] `POST /api/reports/generate` — React-PDF, upload to Supabase Storage
- [ ] Report PDF template — calc breakdown + drawings + MTO + sync stamp
- [ ] Reports page
- [ ] `POST /api/ai/assistant` — streaming, project context from Supabase
- [ ] AI assistant panel (floating or sidebar)
- [ ] `AGENTS.md` in project root
