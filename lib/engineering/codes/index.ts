/**
 * CodeProvider — the contract every concrete design code standard conforms to.
 *
 * The rule (docs/04-engineering-lib.md): every code-specific number lives in
 * a CodeProvider implementation. Files under `lib/engineering/concrete/**`
 * call into the provider and contain no code-specific constants — that's
 * what lets "add a new code" mean "write one more file in codes/" with
 * zero edits to the physics.
 *
 * Units are fixed across the lib: mm, kN, kN·m, MPa.
 */
import type { CodeStandard } from '@/lib/supabase/types'

export type { CodeStandard }

// ---------------------------------------------------------------------------
// Shared input shapes
// ---------------------------------------------------------------------------

/** Rectangular-section geometry used throughout the beam/column engines. */
export type SectionGeom = {
  /** Section width (mm). */
  b_mm: number
  /** Overall section depth (mm). */
  h_mm: number
  /** Effective depth to tension centroid (mm). */
  d_mm: number
  /** Distance from compression face to compression steel centroid (mm). */
  d_prime_mm?: number
  /** Clear cover (mm). */
  clear_cover_mm: number
}

/** Materials used throughout the beam/column engines. */
export type Materials = {
  /** Concrete compressive strength (MPa). */
  fc_mpa: number
  /** Longitudinal steel yield strength (MPa). */
  fy_mpa: number
  /** Transverse (shear) steel yield strength (MPa). */
  fys_mpa: number
}

/** Result of a positive or negative moment capacity check. */
export type MomentCapacityResult = {
  /** Design moment capacity (kN·m) — already includes φ / γ per the code. */
  phi_Mn_kNm: number
  /** Stress-block depth `a` (mm). */
  a_mm: number
  /** Neutral axis depth `c` (mm). */
  c_mm: number
  /** Whether compression steel yielded — relevant only for doubly-reinforced. */
  compression_steel_yielded?: boolean
  /** Compression steel stress used (MPa) when doubly-reinforced. */
  fs_prime_mpa?: number
  /** True if the section was designed as doubly reinforced. */
  is_doubly_reinforced: boolean
}

export type ColumnType = 'tied' | 'spiral'

/**
 * CodeProvider interface.
 *
 * Grouped by concern. `moment_capacity` is the only method that encapsulates
 * code-specific φ/γ application internally — everything else returns raw
 * numbers that the physics modules combine.
 *
 * For the ACI family, `phi_*` methods multiply by φ.
 * For EC2/CSA, φ = 1.0 and the reduction is already baked into `fcd`/`fyd`.
 * This asymmetry is what forces the interface's shape (see docs/04 note on EC2).
 */
export interface CodeProvider {
  readonly code: CodeStandard

  // ─── Material design strengths ─────────────────────────────────────────
  /** Design concrete stress. ACI/NSCP return f'c; EC2 returns fck/γc; CSA 0.65·fc. */
  fcd(fc_mpa: number): number
  /** Design steel stress. ACI/NSCP return fy; EC2 returns fyk/γs; CSA 0.85·fy. */
  fyd(fy_mpa: number): number

  // ─── Stress block ──────────────────────────────────────────────────────
  /** β₁ (ACI) · λ (EC2) · γ (AS) — a/c ratio coefficient. */
  stress_block_depth_factor(fc_mpa: number): number
  /** 0.85 (ACI) · η (EC2) — stress-block height coefficient. */
  stress_block_stress_factor(fc_mpa: number): number

  // ─── Flexure ───────────────────────────────────────────────────────────
  /**
   * Design moment capacity including φ/γ for whatever code this is.
   *
   * @param As_mm2       Tension steel area (mm²).
   * @param As_prime_mm2 Compression steel area (mm²) — 0 for singly reinforced.
   * @param geom         Section geometry.
   * @param mat          Materials.
   */
  moment_capacity(
    As_mm2: number,
    As_prime_mm2: number,
    geom: SectionGeom,
    mat: Materials,
  ): MomentCapacityResult

  /** Minimum tension steel area (mm²) for a rectangular section. */
  As_min(fc_mpa: number, fy_mpa: number, b_mm: number, d_mm: number): number

  // ─── Shear ─────────────────────────────────────────────────────────────
  /**
   * Design concrete shear contribution φVc (kN).
   *
   * @param Mu_kNm Only CSA MCFT actually uses this; every other code ignores it.
   *               Pass the Mu at the section being checked if available.
   * @param Vu_kN  Same — only CSA MCFT uses it.
   */
  Vc_design(
    fc_mpa: number,
    b_mm: number,
    d_mm: number,
    As_mm2: number,
    Nu_kN: number,
    Mu_kNm?: number,
    Vu_kN?: number,
  ): number
  /** Design stirrup shear contribution φVs (kN) for given stirrup area/spacing. */
  Vs_design(
    Av_mm2: number,
    fys_mpa: number,
    d_mm: number,
    s_mm: number,
  ): number
  /** Max permitted stirrup spacing (mm) for given Vs, d, b, fc. */
  stirrup_spacing_max(
    d_mm: number,
    Vs_kN: number,
    b_mm: number,
    fc_mpa: number,
  ): number

  // ─── Development ───────────────────────────────────────────────────────
  /** Development length Ld (mm). */
  Ld(
    bar_dia_mm: number,
    fc_mpa: number,
    fy_mpa: number,
    is_top: boolean,
    spacing_mm: number,
  ): number
  /** Lap splice length (mm) given Ld and class. */
  lap_splice(Ld_mm: number, class_: 'A' | 'B'): number

  // ─── Column-specific ───────────────────────────────────────────────────
  /** Strength-reduction φ on axial capacity for given εt. ACI transitions 0.65→0.90. */
  phi_axial(eps_t: number, type: ColumnType): number
  /** Pn,max cap factor. ACI: 0.80 tied / 0.85 spiral. EC2/CSA: 1.0. */
  Pn_max_factor(type: ColumnType): number
  /** Slenderness limit klu/r below which second-order effects can be ignored. */
  slenderness_limit(M1_kNm: number, M2_kNm: number, is_sway: boolean): number
  /** Minimum ρ of confinement reinforcement (column ties). */
  confinement_rho_min(
    fc_mpa: number,
    fyh_mpa: number,
    Ag_mm2: number,
    Ach_mm2: number,
  ): number

  // ─── Slab + punching ───────────────────────────────────────────────────
  /** Punching critical section distance factor × d. ACI/CSA/AS: 0.5 · EC2: 2.0. */
  punching_d_factor(): number
  /** Minimum slab thickness (mm). */
  min_slab_thickness(
    span_mm: number,
    support: 'simply_supported' | 'one_end_continuous' | 'both_ends_continuous' | 'cantilever',
    fy_mpa: number,
  ): number

  // ─── Footing ───────────────────────────────────────────────────────────
  /** Design bearing capacity φBn at column-footing interface (kN). */
  bearing_capacity(fc_mpa: number, A1_mm2: number, A2_mm2: number): number

  // ─── Column ρ bounds + slab secondary steel ────────────────────────────
  readonly rho_column_min: number
  readonly rho_column_max: number
  /** Minimum temperature/shrinkage steel ratio given fy. */
  rho_temp(fy_mpa: number): number
  /** One-way slab Vc (kN) per unit width — reuses beam Vc with ρl = 0. */
  Vc_slab_oneway(fc_mpa: number, b_mm: number, d_mm: number): number
  /** Two-way slab Vc (kN) at the punching perimeter. */
  Vc_slab_twoway(
    fc_mpa: number,
    bo_mm: number,
    d_mm: number,
    beta_c: number,
  ): number

  // ─── Seismic add-ons (optional) ────────────────────────────────────────
  readonly seismic?: {
    /** Max stirrup spacing (mm) in seismic end zones vs. midspan. */
    stirrup_spacing_max(d_mm: number, zone: 'end' | 'mid'): number
    /** Max column tie spacing (mm) in seismic end zones. */
    column_tie_spacing_max(
      b_mm: number,
      bar_dia_mm: number,
      tie_dia_mm: number,
    ): number
  }
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/**
 * Registration happens via side effect: each provider file imports this
 * module and calls `registerCode(...)` at the top level. Callers that want
 * a provider import the provider file directly (e.g. `aci318-19.ts`),
 * which triggers its registration before `getCode()` is called.
 *
 * This avoids a barrel that forces every code into every bundle, and keeps
 * this file independent of which providers happen to exist.
 */
const registry: Partial<Record<CodeStandard, CodeProvider>> = {}

export function registerCode(provider: CodeProvider): void {
  registry[provider.code] = provider
}

/**
 * Resolve a code standard to its provider. Throws if the code is not yet
 * implemented — callers should validate the standard before calling, and
 * must have imported the provider file somewhere in the reachable graph.
 */
export function getCode(standard: CodeStandard): CodeProvider {
  const provider = registry[standard]
  if (!provider) {
    throw new Error(
      `Code standard ${standard} is not registered. ` +
        `Import the provider file (lib/engineering/codes/<standard>.ts) ` +
        `somewhere in the reachable graph, or see docs/04-engineering-lib.md ` +
        `for how to add one.`,
    )
  }
  return provider
}
