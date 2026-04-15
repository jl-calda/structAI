# 04 — Engineering Library

## File structure
```
lib/engineering/
├── codes/
│   ├── index.ts        ← CodeProvider interface + getCode() registry
│   ├── aci318-19.ts    ← ACI 318-19
│   ├── nscp2015.ts     ← NSCP 2015 (spreads ACI, overrides Vc + Ld only)
│   ├── eurocode2.ts    ← EC2 2004 (full reimplementation — γ on materials)
│   ├── as3600.ts       ← AS 3600-2018
│   └── csa-a23.ts      ← CSA A23.3-19 (MCFT shear — needs Mu in Vc)
└── concrete/
    ├── beam/
    │   ├── index.ts         ← runBeamGroupDesign(beams, code)
    │   ├── group-engine.ts  ← per-beam diagram design + group iteration
    │   ├── flexure.ts       ← Whitney block — code-agnostic physics
    │   ├── shear.ts         ← Vc + Vs — code-agnostic physics
    │   ├── development.ts   ← Ld calculation
    │   └── bend-points.ts   ← bend point from M(x) curve
    ├── column/
    │   ├── index.ts         ← runColumnDesign(input, code)
    │   ├── interaction.ts   ← P-M diagram via strain sweep
    │   └── shear.ts
    ├── slab/
    │   ├── index.ts
    │   ├── one-way.ts
    │   └── two-way.ts
    └── footing/
        ├── index.ts
        └── bearing.ts
```

## Rule: physics files never change when adding a new code
`flexure.ts`, `shear.ts`, `development.ts` contain code-agnostic physics.
All code-specific numbers go in `codes/*.ts`.
Adding EC2 = write `codes/eurocode2.ts`, register in `codes/index.ts`. Done.

## CodeProvider interface (key methods)

```typescript
interface CodeProvider {
  code: CodeStandard  // 'ACI_318_19'|'NSCP_2015'|'EC2_2004'|'AS_3600_2018'|'CSA_A23_3_19'

  // Material design strengths — where ACI vs EC2 fundamentally differ
  fcd(fc: number): number     // ACI: fc    EC2: fck/1.5    CSA: 0.65·fc
  fyd(fy: number): number     // ACI: fy    EC2: fyk/1.15   CSA: 0.85·fy

  // Stress block
  stress_block_depth_factor(fc: number): number   // ACI β₁ · EC2 λ · AS γ
  stress_block_stress_factor(fc: number): number  // ACI 0.85 · EC2 η

  // Flexure — encapsulates φ/γ application internally
  moment_capacity(As, As_prime, geom, mat): MomentCapacityResult

  // Shear — Mu_kNm and Vu_kN are optional; only CSA MCFT needs them
  Vc_design(fc, b, d, As, Nu, Mu_kNm?, Vu_kN?): number
  Vs_design(Av, fys, d, s): number
  stirrup_spacing_max(d, Vs, b, fc): number

  // Development
  Ld(bar_dia, fc, fy, is_top, spacing): number
  lap_splice(Ld, class_): number

  // Column-specific
  phi_axial(eps_t, type): number      // ACI: 0.65→0.90 transition · EC2/CSA: 1.0
  Pn_max_factor(type): number         // ACI: 0.80 tied, 0.85 spiral · EC2/CSA: 1.0
  slenderness_limit(M1, M2, is_sway): number
  confinement_rho_min(fc, fyh, Ag, Ach): number

  // Slab + footing — critical perimeter location
  punching_d_factor(): number         // ACI/CSA/AS: 0.5 · EC2: 2.0
  min_slab_thickness(span, support, fy): number

  // Footing
  bearing_capacity(fc, A1, A2): number

  rho_column_min: number
  rho_column_max: number
  rho_temp(fy: number): number
  Vc_slab_oneway(fc, b, d): number
  Vc_slab_twoway(fc, bo, d, beta_c): number
  As_min(fc, fy, b, d): number

  seismic?: { stirrup_spacing_max(d, zone): number; column_tie_spacing_max(b, bar_dia, tie_dia): number }
}
```

## What differs between codes

| | ACI 318-19 | NSCP 2015 | EC2 2004 | AS 3600 | CSA A23.3 |
|---|---|---|---|---|---|
| Reduction on | capacity φ | capacity φ | materials γ | capacity φ | materials φ |
| fcd | f'c | f'c | fck/1.5 | f'c | 0.65f'c |
| φ flexure | 0.90 | 0.90 | 1.0 (in fcd) | 0.85 | 1.0 (in fcd) |
| Vc formula | table (ρₗ term) | 0.17√f'c | (ρₗ)^1/3·k | (f'c)^1/3 | MCFT β√f'c |
| Vc needs Mu? | No | No | No | No | **Yes** |
| Punching crit. | d/2 | d/2 | **2d** | d/2 | d/2 |
| Column φ | 0.65→0.90 varies | same | 1.0 constant | 0.65 constant | 1.0 constant |
| εcu | 0.003 | 0.003 | 0.0035 | 0.003 | 0.0035 |

## NSCP note
NSCP 2015 is ACI 318-11 with Philippine seismic additions.
Implementation: `export const NSCP2015: CodeProvider = { ...ACI318_19, code: 'NSCP_2015', Vc_design(...){...}, Ld(...){...} }`
Override only `Vc_design()`, `Ld()`, `rho_temp()`, and `seismic`.

## EC2 note
EC2 applies partial factors to materials first (fcd, fyd). No φ at the end.
`moment_capacity()` does NOT multiply by φ — reduction is already in fcd and fyd.
This cannot be achieved by sharing ACI's implementation with a different φ value.
`punching_d_factor()` returns `2.0` (vs 0.5 for all others) — biggest structural difference.
