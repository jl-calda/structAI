/**
 * Column design engine.
 *
 * Runs a single column through the P-M check, shear check, steel-ratio
 * bounds, and slenderness classification. Bresler reciprocal is
 * referenced in docs/06-elements.md for biaxial; for Phase 4 we run the
 * major-axis check only (typical for building columns where minor-axis
 * moments are small). Biaxial expansion is a later commit.
 */
import type { CodeProvider, Materials } from '@/lib/engineering/codes'

import {
  buildPmCurve,
  interactionRatio,
  type ColumnRebar,
  type ColumnSection,
  type PmPoint,
} from './interaction'

const barArea = (d: number) => (Math.PI * d * d) / 4

export type ColumnDemand = {
  Pu_kN: number
  Mu_major_kNm: number
  Mu_minor_kNm: number
  Vu_kN: number
  governing_combo: number | null
}

export type ColumnInput = {
  label: string
  section: ColumnSection & { clear_cover_mm: number }
  height_mm: number
  /** Effective length factor; 1.0 for non-sway braced columns. */
  k_factor?: number
  mat: Materials
  rebar: ColumnRebar
  tie_dia_mm: number
  tie_spacing_mm: number
  demand: ColumnDemand
  code: CodeProvider
}

export type ColumnCheckResult = {
  label: string
  demand: ColumnDemand
  curve: PmPoint[]
  phi_Pn_kN: number
  phi_Mn_kNm: number
  interaction_ratio: number
  axial_status: 'pass' | 'fail'

  rho_percent: number
  rho_min_ok: boolean
  rho_max_ok: boolean

  phi_Vn_kN: number
  shear_status: 'pass' | 'fail'

  klu_r: number
  slender: boolean

  overall_status: 'pass' | 'fail'
}

export function runColumnDesign(input: ColumnInput): ColumnCheckResult {
  const { section, mat, rebar, demand, code } = input

  // ─── P-M interaction ────────────────────────────────────────────────
  const curve = buildPmCurve(section, rebar, mat, code)
  const ratio = interactionRatio(curve, demand.Pu_kN, demand.Mu_major_kNm)

  // Look up the capacity on the ray through the demand — we re-run the
  // interpolation to pick the specific phi_Pn / phi_Mn at that slope.
  const capacity = capacityAtRatio(curve, demand.Pu_kN, demand.Mu_major_kNm)

  // ─── Steel ratio ────────────────────────────────────────────────────
  const As_total = rebar.bar_count * barArea(rebar.bar_dia_mm)
  const Ag = section.b_mm * section.h_mm
  const rho = As_total / Ag
  const rho_min_ok = rho >= code.rho_column_min
  const rho_max_ok = rho <= code.rho_column_max

  // ─── Shear ──────────────────────────────────────────────────────────
  // Approximate d as h − d'; Av = 2 legs × area of tie bar.
  const d_mm = section.h_mm - section.d_prime_mm
  const Av = 2 * barArea(input.tie_dia_mm)
  const phi_Vc = code.Vc_design(
    mat.fc_mpa,
    section.b_mm,
    d_mm,
    0,
    demand.Pu_kN, // axial compression boosts Vc modestly
  )
  const phi_Vs = code.Vs_design(Av, mat.fys_mpa, d_mm, input.tie_spacing_mm)
  const phi_Vn_kN = phi_Vc + phi_Vs

  // ─── Slenderness ────────────────────────────────────────────────────
  const r = 0.3 * section.h_mm // rectangular
  const k = input.k_factor ?? 1.0
  const klu_r = (k * input.height_mm) / r
  const slendernessLimit = code.slenderness_limit(
    /* M1 */ 0,
    /* M2 */ demand.Mu_major_kNm,
    /* sway */ false,
  )
  const slender = klu_r > slendernessLimit

  // ─── Verdicts ───────────────────────────────────────────────────────
  const axial_status: 'pass' | 'fail' = ratio <= 1.0 && rho_min_ok && rho_max_ok ? 'pass' : 'fail'
  const shear_status: 'pass' | 'fail' = phi_Vn_kN >= demand.Vu_kN ? 'pass' : 'fail'
  const overall_status: 'pass' | 'fail' =
    axial_status === 'pass' && shear_status === 'pass' ? 'pass' : 'fail'

  return {
    label: input.label,
    demand,
    curve,
    phi_Pn_kN: capacity.phi_Pn_kN,
    phi_Mn_kNm: capacity.phi_Mn_kNm,
    interaction_ratio: ratio,
    axial_status,

    rho_percent: rho * 100,
    rho_min_ok,
    rho_max_ok,

    phi_Vn_kN,
    shear_status,

    klu_r,
    slender,

    overall_status,
  }
}

/**
 * Pick the phi_Pn / phi_Mn on the interaction curve along the demand
 * ray. Mirrors `interactionRatio` but returns the point itself.
 */
function capacityAtRatio(
  curve: PmPoint[],
  Pu_kN: number,
  Mu_kNm: number,
): { phi_Pn_kN: number; phi_Mn_kNm: number } {
  const M = Math.abs(Mu_kNm)
  if (M === 0) {
    return { phi_Pn_kN: curve[0]?.phi_Pn_kN ?? 0, phi_Mn_kNm: 0 }
  }
  const slope = Pu_kN / M
  for (let i = 0; i < curve.length - 1; i++) {
    const a = curve[i]
    const b = curve[i + 1]
    const sa = a.phi_Mn_kNm === 0 ? Infinity : a.phi_Pn_kN / a.phi_Mn_kNm
    const sb = b.phi_Mn_kNm === 0 ? Infinity : b.phi_Pn_kN / b.phi_Mn_kNm
    const bracketed =
      (slope <= sa && slope >= sb) || (slope >= sa && slope <= sb)
    if (!bracketed) continue
    const dM = b.phi_Mn_kNm - a.phi_Mn_kNm
    const dP = b.phi_Pn_kN - a.phi_Pn_kN
    const num = slope * a.phi_Mn_kNm - a.phi_Pn_kN
    const den = dP - slope * dM
    const t = Math.abs(den) < 1e-9 ? 0 : num / den
    return {
      phi_Mn_kNm: a.phi_Mn_kNm + t * dM,
      phi_Pn_kN: a.phi_Pn_kN + t * dP,
    }
  }
  return { phi_Pn_kN: curve[0]?.phi_Pn_kN ?? 0, phi_Mn_kNm: 0 }
}
