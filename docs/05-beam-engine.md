# 05 — Beam Design Engine

## The core rule
**Design each beam from its own full moment diagram. Never take max-of-maxima across beams.**

Max-of-maxima anti-pattern:
- B-12: M+ = 558 (highest), M- = 210, Vu = 280
- B-13: M+ = 480, M- = 312 (highest), Vu = 266
- B-14: M+ = 522, M- = 280, Vu = 302 (highest)
- Designing for M+=558 + M-=312 + Vu=302 simultaneously is wrong — no single beam ever sees all three at once.

## A "beam" in StructAI
One `beam_design` = one physical RC beam that may span multiple STAAD members.
`beam_designs.member_ids = [104, 105, 106]` means members 104, 105, 106 form one continuous beam.
The engine stitches their M(x) curves together end-to-end to get the full beam diagram.

## Algorithm — `runBeamGroupDesign(beams[], code)`

```
Step 1 — Assemble diagram per beam
  For each beam:
    Query staad_diagram_points WHERE member_id IN beam.member_ids
    Stitch member diagrams end-to-end → full M(x), V(x) along total span
    (11 points per member × N members = 11N points total)

Step 2 — Identify governing beam
  For each beam independently, run a quick trial design using its own M+(peak)
  Governing beam = the one requiring the largest As_required
  (NOT simply the beam with the highest M+ value)

Step 3 — Design governing beam from ITS OWN diagram
  Flexure:
    As from M+(x_peak) of this beam → may trigger doubly reinforced
    As_neg from M-(x_peak) of this beam
  Shear:
    V(x) curve of this beam → zone boundaries where V crosses φVc
    Dense stirrup zone: from support to where V ≤ φVc
  Bend points:
    Find x where M(x) of THIS beam drops below φMn(perimeter bars only)
    = the earliest point where additional bars are no longer needed
    This x is beam-specific — do not average across beams

Step 4 — Check design against all other beams
  For each other beam in group:
    Does As satisfy its M+(x) at every sampled point?
    Does φVn cover its V(x) at every sampled point?
    Recalculate bend points from THAT beam's own M(x)
    → If pass: same rebar qty, different bend points
    → If fail: record the failing beam + x location + shortfall

Step 5 — Iterate if any failed
  Find the worst failure across all beams
  Add steel (increase bar count or layer) or tighten stirrups
  Go back to Step 4
  Continue until all beams pass
  Max iterations: 10 (fail with message if exceeded)
```

## Key rule: bend points are always beam-specific
Even when beams share the same rebar qty, their bend points differ.
`bend_point_left_mm` in `beam_checks` is per beam, from that beam's own M(x).
The DB stores one `beam_checks` row per beam, even if rebar is shared.

## What the engine writes
- One `beam_reinforcement` row per `beam_design` (shared rebar config)
- One `beam_checks` row per `beam_design` (bend points are beam-specific)
- `beam_design.design_status` = 'pass' | 'fail'

## Perimeter bars rule
Always 4 corner bars. Always continuous. UI locks this — cannot reduce below 4.
`perimeter_dia_mm` can change but count is hardcoded to 4 in the engine.

## Doubly reinforced trigger
If `Mu > phi_Mn_max_singly`:
  - Compute Mn2 = Mu - phi_Mn_max
  - Add compression steel As' (top)
  - Check strain compatibility: fsp = min(Es × ε's, fy)
  - φMn = φ(As_conc × fy × (d - a/2) + As' × fsp × (d - d'))
