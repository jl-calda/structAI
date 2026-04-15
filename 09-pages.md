# 09 — Pages Inventory

No login page. No auth redirect. `/dashboard` is the first page the app shows.

| Route | Component type | Key data sources |
|-------|---------------|-----------------|
| `/` | Server — redirect to `/dashboard` | — |
| `/dashboard` | Server (`use cache`) | `projects` table |
| `/projects/[id]` | Server (`use cache`) | `staad_syncs`, `beam_designs`, `column_designs`, `slab_designs`, `footing_designs` |
| `/projects/[id]/setup` | Client | `staad_syncs`, `projects` |
| `/projects/[id]/members` | Server (`use cache`) | `staad_members`, `staad_sections`, `beam_designs`, `column_designs` |
| `/projects/[id]/combinations` | Server (`use cache`) | `staad_combinations`, `staad_envelope`, `load_templates` |
| `/projects/[id]/beams` | Server | `beam_designs` list |
| `/projects/[id]/beams/[id]` | Client | `beam_designs`, `beam_reinforcement`, `beam_checks`, `staad_diagram_points`, `staad_envelope` |
| `/projects/[id]/columns/[id]` | Client | `column_designs`, `column_reinforcement`, `column_checks`, `staad_envelope` |
| `/projects/[id]/slabs/[id]` | Client | `slab_designs`, `slab_reinforcement`, `slab_checks` |
| `/projects/[id]/footings/[id]` | Client | `footing_designs`, `footing_checks`, `staad_reactions` |
| `/projects/[id]/mto` | Server (`use cache`) | `material_takeoff_items` |
| `/projects/[id]/reports` | Client | `design_reports`, `staad_syncs` |

## Cache invalidation
- `getMemberList(projectId)` — tag: `staad-${projectId}` — invalidate on new `staad_syncs` row
- `getCombinations(projectId)` — tag: `combos-${projectId}` — invalidate when combinations change
- `getEnvelope(projectId)` — tag: `envelope-${projectId}` — invalidate on sync
- Design pages: NO `use cache` — rebar config and check results change frequently

## Sidebar navigation structure
```
[Dashboard]
── divider ──
[Project name + sync dot]
  Overview
  Setup
  Members
  Load Combos
── divider ──
Design
  Beams
  Columns
  Slabs
  Footings
── divider ──
Material Takeoff
Reports
── bottom ──
[Engineer name | Code standard]  ← static text, no session
```

## STAAD sync banner (shown on all project pages)
```
Green:  "● STAAD Connected · BLDG-01.std · Last sync [date] · Hash [short]"  [Re-sync button]
Amber:  "○ STAAD offline — showing design from [date]"
Red:    "⚠ STAAD Model Mismatch — [N] members changed"  [Re-sync] [Keep unverified]
```
