/**
 * Column design engine.
 *
 * Runs a column through:
 *   - P-M interaction on the major axis
 *   - Biaxial Bresler reciprocal (when a minor-axis moment is present)
 *   - Slender-column moment magnifier (ACI 318-19 6.6.4.5)
 *   - Shear capacity
 *   - ρ bounds
 *   - Slenderness classification
 *
 * All code-specific numbers flow through `CodeProvider` — this file
 * contains no code-standard constants (docs/04-engineering-lib.md).
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

// Typical ACI concrete modulus (MPa) from normal-weight f'c, and the
// effective-flexural-stiffness reduction used in the moment magnifier.
// EC/CSA providers could later expose these via CodeProvider if needed.
function Ec_mpa(fc_mpa: number): number {
  return 4700 * Math.sqrt(fc_mpa)
}

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
  /**
   * Ratio of sustained axial load to total factored axial — βdns.
   * Used to reduce EI in the magnifier. 0.6 is a reasonable default
   * for typical building columns where ~60% of Pu is dead load.
   */
  beta_dns?: number
}

export type ColumnCheckResult = {
  label: string
  demand: ColumnDemand
  curve: PmPoint[]
  /** P-M curve about the minor axis — computed whenever Mu_minor > 0. */
  minor_curve?: PmPoint[]
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
  /** Moment magnifier applied when slender. 1.0 when non-slender. */
  delta_ns: number
  /** Mu actually used in the check — Mu_major × δns. */
  Mu_major_design_kNm: number

  /** Biaxial interaction per Bresler (when minor-axis moment is present). */
  biaxial?: {
    phi_Mn_major_kNm: number
    phi_Mn_minor_kNm: number
    /** (Mu_x/φMn_x)^α + (Mu_y/φMn_y)^α ≤ 1, α = 1.0 conservative. */
    ratio: number
  }

  overall_status: 'pass' | 'fail'
}

export function runColumnDesign(input: ColumnInput): ColumnCheckResult {
  const { section, mat, rebar, demand, code } = input

  // ─── Slenderness classification ─────────────────────────────────────
  const r = 0.3 * section.h_mm // rectangular
  const k = input.k_factor ?? 1.0
  const klu_r = (k * input.height_mm) / r
  const slendernessLimit = code.slenderness_limit(
    /* M1 */ 0,
    /* M2 */ demand.Mu_major_kNm,
    /* sway */ false,
  )
  const slender = klu_r > slendernessLimit

  // ─── Moment magnifier (ACI 318-19 6.6.4.5) ───────────────────────────
  // δns = Cm / (1 − Pu / 0.75·Pc). For single-curvature or no M1:
  //   Cm = 0.6 + 0.4·M1/M2, floored at 0.4, but we take 1.0 conservatively
  //   (pinned-end column with no reverse curvature — common in practice).
  // EI_eff = 0.4·Ec·Ig / (1 + βdns). Pc = π²·EI_eff / (k·lu)².
  let delta_ns = 1.0
  if (slender && demand.Mu_major_kNm > 0) {
    const Ec = Ec_mpa(mat.fc_mpa)
    const Ig_mm4 = (section.b_mm * Math.pow(section.h_mm, 3)) / 12
    const beta_dns = input.beta_dns ?? 0.6
    const EI_eff_Nmm2 = (0.4 * Ec * Ig_mm4) / (1 + beta_dns)
    const klu_mm = k * input.height_mm
    const Pc_N = (Math.PI * Math.PI * EI_eff_Nmm2) / (klu_mm * klu_mm)
    const Pc_kN = Pc_N / 1000
    const Cm = 1.0
    const ratio = demand.Pu_kN / (0.75 * Pc_kN)
    // ACI caps δns at the point where Pu approaches 0.75·Pc — past that
    // the section is unstable and the design must enlarge. We clamp to
    // a large finite value so the interaction check fails cleanly.
    if (ratio >= 0.99) {
      delta_ns = 50
    } else {
      delta_ns = Math.max(1.0, Cm / (1 - ratio))
    }
  }

  const Mu_major_design_kNm = demand.Mu_major_kNm * delta_ns

  // ─── P-M interaction (major axis) ───────────────────────────────────
  const curve = buildPmCurve(section, rebar, mat, code)
  const ratio = interactionRatio(curve, demand.Pu_kN, Mu_major_design_kNm)
  const capacity = capacityAtRatio(curve, demand.Pu_kN, Mu_major_design_kNm)

  // ─── Biaxial (Bresler) when a minor-axis moment is present ──────────
  // Bresler reciprocal form:
  //   1/Pn = 1/Pnx + 1/Pny − 1/Po
  // is the classic formulation, but it fails near pure flexure. We use
  // the contour load-ratio form (ACI R11.2.3):
  //   (Mux/φMnx)^α + (Muy/φMny)^α ≤ 1, with α = 1 (conservative for
  //   rectangular tied columns at typical eccentricities).
  let biaxial: ColumnCheckResult['biaxial'] | undefined
  let minor_curve: PmPoint[] | undefined
  if (demand.Mu_minor_kNm > 0) {
    // Build the minor-axis curve by swapping b ↔ h. Bar layout is still
    // 50/50 top vs bottom in the engine; swapping section geometry
    // effectively flips which face is "top" for the minor axis.
    const minorSection: ColumnSection = {
      b_mm: section.h_mm,
      h_mm: section.b_mm,
      d_prime_mm: section.d_prime_mm,
    }
    minor_curve = buildPmCurve(minorSection, rebar, mat, code)
    const minorCap = capacityAtRatio(minor_curve, demand.Pu_kN, demand.Mu_minor_kNm)
    const alpha = 1.0
    const biaxialRatio =
      Math.pow(Mu_major_design_kNm / Math.max(capacity.phi_Mn_kNm, 1e-6), alpha) +
      Math.pow(demand.Mu_minor_kNm / Math.max(minorCap.phi_Mn_kNm, 1e-6), alpha)
    biaxial = {
      phi_Mn_major_kNm: capacity.phi_Mn_kNm,
      phi_Mn_minor_kNm: minorCap.phi_Mn_kNm,
      ratio: biaxialRatio,
    }
  }

  // ─── Steel ratio ────────────────────────────────────────────────────
  const As_total = rebar.bar_count * barArea(rebar.bar_dia_mm)
  const Ag = section.b_mm * section.h_mm
  const rho = As_total / Ag
  const rho_min_ok = rho >= code.rho_column_min
  const rho_max_ok = rho <= code.rho_column_max

  // ─── Shear ──────────────────────────────────────────────────────────
  const d_mm = section.h_mm - section.d_prime_mm
  const Av = 2 * barArea(input.tie_dia_mm)
  const phi_Vc = code.Vc_design(
    mat.fc_mpa,
    section.b_mm,
    d_mm,
    0,
    demand.Pu_kN,
  )
  const phi_Vs = code.Vs_design(Av, mat.fys_mpa, d_mm, input.tie_spacing_mm)
  const phi_Vn_kN = phi_Vc + phi_Vs

  // ─── Verdicts ───────────────────────────────────────────────────────
  // Axial passes iff both uniaxial and (when applicable) biaxial ≤ 1.0.
  const axialRatioOk =
    ratio <= 1.0 && (!biaxial || biaxial.ratio <= 1.0)
  const axial_status: 'pass' | 'fail' =
    axialRatioOk && rho_min_ok && rho_max_ok ? 'pass' : 'fail'
  const shear_status: 'pass' | 'fail' =
    phi_Vn_kN >= demand.Vu_kN ? 'pass' : 'fail'
  const overall_status: 'pass' | 'fail' =
    axial_status === 'pass' && shear_status === 'pass' ? 'pass' : 'fail'

  return {
    label: input.label,
    demand,
    curve,
    minor_curve,
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
    delta_ns,
    Mu_major_design_kNm,

    biaxial,

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
