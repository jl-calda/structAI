# 02 — Source of Truth Architecture

## Two Objects

### Object 1 — STAAD Mirror (read-only in the app)
Populated by the Python bridge after every sync. App UI displays these but CANNOT edit them.
Geometry controls (section size, span, support type) are greyed out with a lock icon.

Tables: `staad_syncs`, `staad_nodes`, `staad_members`, `staad_sections`,
`staad_materials`, `staad_load_cases`, `staad_combinations`,
`staad_diagram_points`, `staad_envelope`, `staad_reactions`

### Object 2 — Design Data (app-owned)
Lives only in Supabase. STAAD has zero knowledge of this.
References STAAD member IDs — if those change in STAAD, affected designs get flagged.

Tables: `beam_designs`, `beam_reinforcement`, `beam_checks`,
`column_designs`, `column_reinforcement`, `column_checks`,
`slab_designs`, `slab_reinforcement`, `slab_checks`,
`footing_designs`, `footing_reinforcement`, `footing_checks`,
`material_takeoff_items`, `load_templates`, `design_reports`

## Sync Check On Project Open

```
1. Python bridge reads current .std file SHA-256 hash
2. App compares with staad_syncs.file_hash (last stored)
   MATCH    → load project normally
   MISMATCH → show diff dialog: which members changed?
              User picks: re-sync OR keep design as "unverified"
   OFFLINE  → load last known Supabase state
              Show banner: "STAAD offline — showing design from [date]"
```

When re-sync runs on a mismatch:
- `geometry_changed = true` on all beam_designs and column_designs whose member_ids overlap with changed members
- `design_status = 'unverified'` on those same records
- Design data (rebar config) is PRESERVED — not deleted

## Reports Without STAAD
Report generator reads Object 1 + Object 2 from Supabase only. STAAD does not need to be open.
Every PDF is stamped with: STAAD file name · hash · sync date.
If `mismatch_detected = true`, report shows a warning banner on the cover page.

## Slabs — No STAAD Link
Slabs are typically not modelled in STAAD frame models.
`slab_designs` has no `member_ids` field.
User defines slab geometry and loads manually. App computes everything.
