/**
 * P-M interaction curve for a rectangular tied concrete column.
 *
 * Code-agnostic: concrete stress block, strain compatibility, steel
 * constitutive law. The CodeProvider supplies phi_axial(eps_t),
 * Pn_max_factor, stress-block factors, and (via its `fcd`/`fyd`) any
 * material reductions (EC2/CSA baked in, ACI returns nominal).
 *
 * Simplification (Phase 4 MVP): total bar count is split evenly between
 * a top row at d' and a bottom row at (h - d'). Side bars are not yet
 * modelled — that's conservative on Mn (side bars at mid-height would
 * only add ~0-20% to Mn and essentially nothing to Pn) and exact on
 * Pn_max. Refining to a full perimeter layout is a later improvement.
 */
import type {
  CodeProvider,
  ColumnType,
  Materials,
} from '@/lib/engineering/codes'

const ES_MPA = 200_000
const EPS_CU = 0.003 // ACI/NSCP; EC2/CSA use 0.0035 — captured in each provider

export type ColumnSection = {
  b_mm: number
  h_mm: number
  /** Cover to the centroid of the outer bar (≈ clear_cover + stirrup + dia/2). */
  d_prime_mm: number
}

export type ColumnRebar = {
  /** Total longitudinal bar count. */
  bar_count: number
  bar_dia_mm: number
  type: ColumnType
}

export type PmPoint = {
  /** Design axial capacity (kN). Positive = compression. */
  phi_Pn_kN: number
  /** Design moment capacity about the major axis (kN·m). Positive = sagging. */
  phi_Mn_kNm: number
  /** Extreme tension steel strain at this neutral axis depth. */
  eps_t: number
  /** Effective phi used at this point (0.65–0.90 for ACI). */
  phi: number
  /** Neutral axis depth c (mm) used to generate this point. */
  c_mm: number
}

const barArea = (d: number) => (Math.PI * d * d) / 4

/**
 * Generate the P-M interaction curve by sweeping the neutral-axis depth
 * `c` over a geometric range. Each sweep yields one point.
 *
 * Returns points ordered by decreasing phi_Pn (pure axial down to pure
 * flexure) so the curve plots naturally.
 */
export function buildPmCurve(
  section: ColumnSection,
  rebar: ColumnRebar,
  mat: Materials,
  code: CodeProvider,
  samples = 60,
): PmPoint[] {
  const { b_mm, h_mm, d_prime_mm } = section
  const d_mm = h_mm - d_prime_mm
  const n_top = Math.floor(rebar.bar_count / 2)
  const n_bot = rebar.bar_count - n_top
  const As_top = n_top * barArea(rebar.bar_dia_mm)
  const As_bot = n_bot * barArea(rebar.bar_dia_mm)
  const As_total = As_top + As_bot
  const Ag = b_mm * h_mm

  const fc = code.fcd(mat.fc_mpa)
  const fy = code.fyd(mat.fy_mpa)
  const beta1 = code.stress_block_depth_factor(fc)
  const k = code.stress_block_stress_factor(fc)

  // Pure compression reference (used to cap Pn_max).
  const Po_kN = (k * fc * (Ag - As_total) + fy * As_total) / 1000
  const Pn_max_cap_kN =
    code.Pn_max_factor(rebar.type) *
    code.phi_axial(/* deep compression */ 0, rebar.type) *
    Po_kN

  // c sweep: from very deep (pure compression) down to near-zero. We use
  // c/h values spanning [3.0, 0.05] log-spaced so we pack points near
  // the balanced region where curvature changes fast.
  const points: PmPoint[] = []

  // Explicit pure-compression point (φPn max, 0 moment).
  points.push({
    phi_Pn_kN: Pn_max_cap_kN,
    phi_Mn_kNm: 0,
    eps_t: -EPS_CU, // all steel in compression
    phi: code.phi_axial(0, rebar.type),
    c_mm: h_mm * 3,
  })

  for (let i = 0; i < samples; i++) {
    const frac = i / (samples - 1)
    // Log-space from c = 3h down to c = 0.05h.
    const c_h = 3 * Math.pow(0.05 / 3, frac)
    const c = c_h * h_mm

    // Concrete stress block: a = β1·c, capped at h.
    const a = Math.min(beta1 * c, h_mm)
    const Cc_N = k * fc * a * b_mm
    // Centroid of block measured from top face: a/2; from section centroid: h/2 − a/2.
    const y_cc = h_mm / 2 - a / 2

    // Steel layers.
    // Top row at y_top = h/2 − d' (above centroid).
    // Bot row at y_bot = −(h/2 − d') (below centroid).
    const y_top = h_mm / 2 - d_prime_mm
    const y_bot = -(h_mm / 2 - d_prime_mm)

    // Strain: positive = compression. From geometry:
    //   eps(y_from_top) = eps_cu * (c − y_from_top) / c
    //   y_from_top_top = d'        → eps_top
    //   y_from_top_bot = h − d' = d → eps_bot
    const eps_top = (EPS_CU * (c - d_prime_mm)) / c
    const eps_bot = (EPS_CU * (c - d_mm)) / c

    // Steel stress: elastic up to ±fy.
    const sig_top = clamp(eps_top * ES_MPA, -fy, fy)
    const sig_bot = clamp(eps_bot * ES_MPA, -fy, fy)

    // Subtract concrete area displaced by compression steel to avoid
    // double-counting (ACI 22.2.2.4.2 allows this correction; we apply
    // only where bar strain is compressive enough to be "in" the block).
    const displacedTop = eps_top > 0 ? As_top * (k * fc) : 0
    const displacedBot = eps_bot > 0 ? As_bot * (k * fc) : 0

    const F_top_N = As_top * sig_top - displacedTop
    const F_bot_N = As_bot * sig_bot - displacedBot

    const Pn_N = Cc_N + F_top_N + F_bot_N
    const Mn_Nmm = Cc_N * y_cc + F_top_N * y_top + F_bot_N * y_bot

    // ε_t at the extreme tension bar. If the bottom bar is in tension
    // (ε_bot < 0), that's −ε_bot. If both rows are compressive, ε_t is
    // defined as the strain at the farthest steel layer, which we take
    // as ε_bot (smaller magnitude compression → closer to tension).
    const eps_t_at_bot = -eps_bot
    const eps_t = Math.max(0, eps_t_at_bot)

    const phi = code.phi_axial(eps_t, rebar.type)
    let phi_Pn_kN = (phi * Pn_N) / 1000
    const phi_Mn_kNm = (phi * Mn_Nmm) / 1_000_000

    // Cap axial capacity by Pn_max rule (tied: 0.80, spiral: 0.85).
    if (phi_Pn_kN > Pn_max_cap_kN) phi_Pn_kN = Pn_max_cap_kN

    points.push({
      phi_Pn_kN,
      phi_Mn_kNm: Math.abs(phi_Mn_kNm),
      eps_t,
      phi,
      c_mm: c,
    })
  }

  // Pure tension point: all steel yielded in tension, no concrete.
  const Pt_kN = (-As_total * fy) / 1000
  const phi_pt = code.phi_axial(/* large tension */ 0.01, rebar.type)
  points.push({
    phi_Pn_kN: phi_pt * Pt_kN,
    phi_Mn_kNm: 0,
    eps_t: 0.01,
    phi: phi_pt,
    c_mm: 0,
  })

  // Sort by phi_Pn descending (nose of curve first) for plotting convenience.
  return points.sort((a, b) => b.phi_Pn_kN - a.phi_Pn_kN)
}

/**
 * Interaction ratio for a demand point (Pu, Mu). Computed by ray-casting
 * from the origin through (Mu, Pu) and finding where the ray intersects
 * the curve; ratio = ||demand|| / ||capacity along same ray||.
 *
 * < 1.0 → inside the curve (pass).
 * ≥ 1.0 → outside (fail).
 *
 * Implementation: linear interpolation across adjacent curve segments.
 */
export function interactionRatio(
  curve: PmPoint[],
  Pu_kN: number,
  Mu_kNm: number,
): number {
  if (Mu_kNm < 0) Mu_kNm = -Mu_kNm // symmetric about M = 0

  // Degenerate — no moment demand: ratio = Pu / phi_Pn_max.
  if (Mu_kNm === 0) {
    const maxP = curve[0]?.phi_Pn_kN ?? 1
    return Pu_kN / maxP
  }

  // Demand ray slope dP/dM.
  const slope = Pu_kN / Mu_kNm

  // Walk adjacent curve segments until the segment brackets the demand slope.
  for (let i = 0; i < curve.length - 1; i++) {
    const a = curve[i]
    const b = curve[i + 1]
    // Slope of the line from origin to each curve point.
    const sa = a.phi_Mn_kNm === 0 ? Infinity : a.phi_Pn_kN / a.phi_Mn_kNm
    const sb = b.phi_Mn_kNm === 0 ? Infinity : b.phi_Pn_kN / b.phi_Mn_kNm

    // The ray from origin hits the segment when demand slope is between
    // sa and sb (inclusive). Interpolate.
    const bracketed =
      (slope <= sa && slope >= sb) || (slope >= sa && slope <= sb)
    if (!bracketed) continue

    const dM = b.phi_Mn_kNm - a.phi_Mn_kNm
    const dP = b.phi_Pn_kN - a.phi_Pn_kN
    if (Math.abs(dM) < 1e-9 && Math.abs(dP) < 1e-9) continue

    // Parametric intersection: find t ∈ [0,1] along segment A→B where
    // the line (t·dM + A.M, t·dP + A.P) passes through origin with
    // slope = Pu/Mu, i.e. (t·dP + A.P) / (t·dM + A.M) = slope.
    const num = slope * a.phi_Mn_kNm - a.phi_Pn_kN
    const den = dP - slope * dM
    const t = Math.abs(den) < 1e-9 ? 0 : num / den
    const Mc = a.phi_Mn_kNm + t * dM
    const Pc = a.phi_Pn_kN + t * dP
    const demandMag = Math.hypot(Mu_kNm, Pu_kN)
    const capacityMag = Math.hypot(Mc, Pc)
    if (capacityMag < 1e-9) continue
    return demandMag / capacityMag
  }

  // If we got here the demand slope wasn't bracketed. Return ratio vs
  // nearest curve end — conservative.
  const last = curve[curve.length - 1]
  const maxP = curve[0]
  const capMag = Math.hypot(last.phi_Mn_kNm, maxP.phi_Pn_kN)
  return Math.hypot(Mu_kNm, Pu_kN) / (capMag || 1)
}

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v
}
