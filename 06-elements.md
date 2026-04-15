# 06 — Element Design Decisions

## Beam
- 4 perimeter corner bars are always continuous, always 4 — UI locks the count control
- Additional tension bars can be bent down at supports
- Stirrups: 3 zones — dense (near supports), relaxed (midspan)
- Bend points computed from each beam's own M(x) — see `docs/05-beam-engine.md`
- Compression bars (As') added only when doubly reinforced is triggered

## Column
- φ is NOT constant for ACI — it transitions 0.65→0.90 with net tensile strain εt
  - εt ≤ 0.002 → φ = 0.65 (tied) or 0.75 (spiral)
  - εt ≥ 0.005 → φ = 0.90
  - Between: linear interpolation
- EC2/CSA/AS: φ constant (reduction embedded in fcd/fyd) → use `phi_axial()` from CodeProvider
- P-M interaction diagram: strain sweep (ε_top = εcu, vary ε_bot from +εcu to -∞)
- Pn_max cap: ACI uses 0.80φ (tied) or 0.85φ (spiral) — EC2/CSA do not have this cap
- Slenderness: if klu/r > limit, apply moment magnifier. Use `slenderness_limit()` from CodeProvider.
- Biaxial bending: Bresler reciprocal method

## Slab
- NOT linked to STAAD — no `member_ids`
- User inputs: span Lx, Ly, thickness, DL, SDL, LL
- One-way: treat as b=1000mm beam strip. Reuse beam CodeProvider methods directly.
- Two-way: coefficient method for Mu. Punching shear is the critical check.
- Punching perimeter: `bo = 4 × (col_b + col_h + 2 × d × punching_d_factor())`
  - ACI/CSA/AS: `punching_d_factor() = 0.5` → perimeter at d/2 from column face
  - EC2: `punching_d_factor() = 2.0` → perimeter at 2d from column face (perimeter is ~4× larger)

## Footing
- Links to STAAD support node via `node_id` — loads come from `staad_reactions`
- One-way shear critical section: d from column face — all codes agree
- Punching critical section: same `punching_d_factor()` as slab
- Flexure critical section: at column face — all codes agree
- Bearing check at column base: use `bearing_capacity(fc, A1, A2)` from CodeProvider
  - ACI: φ = 0.65 × 0.85f'c × A1 × √(A2/A1) ≤ 2φ × 0.85f'c × A1
  - EC2: fcd × A1 × √(Ac1/Ac0) ≤ 3fcd × A1
- Minimum thickness: 300mm if on soil, 150mm if on piles
- No stirrups in footings (typical) — increase depth if one-way shear fails

## Shared rules across all elements
- `design_status = 'unverified'` when `geometry_changed = true` — never auto-delete rebar config
- Design engine writes to `{element}_checks`, never to `{element}_designs`
- Material takeoff generated after every successful design run
- CodeProvider is always the last argument in engine functions: `runBeamDesign(input, code)`
