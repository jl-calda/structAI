/**
 * ACI 318-19 provider.
 *
 * Canonical reference — every other code implementation in this lib is
 * either independent (EC2) or spread-and-override on top of this
 * (NSCP 2015). The physics files under `lib/engineering/concrete/**`
 * call the methods below; there are no code-specific numbers outside
 * this file (docs/04-engineering-lib.md).
 *
 * Units: mm, kN, kN·m, MPa.
 */
import {
  registerCode,
  type CodeProvider,
  type ColumnType,
  type Materials,
  type MomentCapacityResult,
  type SectionGeom,
} from '@/lib/engineering/codes'

const PHI_FLEXURE = 0.9
const PHI_SHEAR = 0.75
const PHI_COLUMN_TIED_MIN = 0.65
const PHI_COLUMN_TIED_MAX = 0.9
const PHI_COLUMN_SPIRAL_MIN = 0.75
const PHI_COLUMN_SPIRAL_MAX = 0.9
const PHI_BEARING = 0.65
const PHI_COMPRESSION_YIELD = 0.003
const EPS_T_TENSION_CONTROLLED = 0.005
const ES_MPA = 200_000 // steel modulus

/** ACI 318-19 Table 22.2.2.4.3 — β₁ varies with f'c. */
function beta1(fc_mpa: number): number {
  if (fc_mpa <= 28) return 0.85
  if (fc_mpa >= 55) return 0.65
  return 0.85 - 0.05 * ((fc_mpa - 28) / 7)
}

function lambda(): number {
  // Normal-weight concrete by default. Lightweight (0.75) can be
  // plumbed through via Materials later if the project requires it.
  return 1.0
}

/**
 * ACI 318-19 Eq. 22.5.5.1 — detailed Vc with ρₗ dependence.
 *   Vc = 0.66 · λ · (ρₗ)^(1/3) · √f'c · b · d   (with Nu/6Ag add-on)
 * For simplicity we use the upper-bound form:
 *   Vc = 0.17 · λ · √f'c · b · d   (ρₗ = 0 limit)
 * plus the axial term. This matches NSCP 2015 and is a safe default;
 * the detailed form will be added when we plumb ρₗ through.
 */
function Vc_simple_kN(
  fc_mpa: number,
  b_mm: number,
  d_mm: number,
  Nu_kN: number,
): number {
  const lam = lambda()
  const Vc_N =
    0.17 * lam * Math.sqrt(fc_mpa) * b_mm * d_mm +
    // Axial tension reduces Vc; axial compression increases it slightly.
    // ACI 22.5.6: Vc_axial = Vc · (1 + Nu/(14 Ag)) if Nu is compression.
    // We reflect only the compression enhancement here to stay
    // conservative for tension members (beam engine passes Nu_kN = 0).
    Math.max(0, (Nu_kN * 1000) / (14 * b_mm * d_mm)) *
      0.17 * lam * Math.sqrt(fc_mpa) * b_mm * d_mm
  return Vc_N / 1000
}

/**
 * ACI 318-19 12.5.2 basic development length.
 *   Ld = fy · ψt · ψe / (1.1 · λ · √f'c · (cb + Ktr)/db) · db
 * We simplify with ψs = 1, ψg = 1, (cb + Ktr)/db = 2.5 (upper cap),
 * and top-bar factor ψt = 1.3 where the bar is placed so that 300 mm
 * of fresh concrete is cast below it.
 */
function Ld_simple_mm(
  bar_dia_mm: number,
  fc_mpa: number,
  fy_mpa: number,
  is_top: boolean,
): number {
  const psi_t = is_top ? 1.3 : 1.0
  const psi_e = 1.0
  const lam = lambda()
  const denom = 1.1 * lam * Math.sqrt(fc_mpa) * 2.5
  const Ld_raw = (fy_mpa * psi_t * psi_e * bar_dia_mm) / denom
  // ACI minimum: 300 mm.
  return Math.max(300, Ld_raw)
}

export const ACI_318_19: CodeProvider = {
  code: 'ACI_318_19',

  // ─── Material design strengths ─────────────────────────────────────────
  // ACI applies phi at capacity level, so design "material" stays nominal.
  fcd: (fc_mpa) => fc_mpa,
  fyd: (fy_mpa) => fy_mpa,

  // ─── Stress block ──────────────────────────────────────────────────────
  stress_block_depth_factor: (fc_mpa) => beta1(fc_mpa),
  stress_block_stress_factor: () => 0.85,

  // ─── Flexure ───────────────────────────────────────────────────────────
  moment_capacity(
    As_mm2: number,
    As_prime_mm2: number,
    geom: SectionGeom,
    mat: Materials,
  ): MomentCapacityResult {
    const { b_mm, d_mm } = geom
    const dp = geom.d_prime_mm ?? Math.max(40, geom.clear_cover_mm + 10)
    const fc = mat.fc_mpa
    const fy = mat.fy_mpa
    const k = 0.85
    const b1 = beta1(fc)

    if (As_prime_mm2 <= 0) {
      // Singly reinforced.
      const a = (As_mm2 * fy) / (k * fc * b_mm)
      const c = a / b1
      const Mn_Nmm = As_mm2 * fy * (d_mm - a / 2)
      return {
        phi_Mn_kNm: (PHI_FLEXURE * Mn_Nmm) / 1e6,
        a_mm: a,
        c_mm: c,
        is_doubly_reinforced: false,
      }
    }

    // Doubly reinforced — strain-compatibility iteration on c.
    // Equilibrium: 0.85 f'c b a + As'·fs' = As·fy.
    // If compression steel yields, fs' = fy and we can solve directly:
    //   a = (As·fy - As'·fy) / (0.85 f'c b)
    // Check strain: eps_s' = 0.003 · (c - d') / c. If eps_s' < fy/Es,
    // compression steel doesn't yield; iterate.
    let a_try = ((As_mm2 - As_prime_mm2) * fy) / (k * fc * b_mm)
    if (a_try < 0) a_try = 0
    let c_try = a_try / b1
    const eps_y = fy / ES_MPA

    let fs_prime = fy
    let compression_yielded = true
    // Tightening loop — usually converges in 3 iterations.
    for (let iter = 0; iter < 20; iter++) {
      const eps_sp =
        c_try <= 0 ? 0 : PHI_COMPRESSION_YIELD * (c_try - dp) / c_try
      if (eps_sp >= eps_y) {
        fs_prime = fy
        compression_yielded = true
      } else {
        fs_prime = Math.max(0, eps_sp * ES_MPA)
        compression_yielded = false
      }
      const a_new =
        (As_mm2 * fy - As_prime_mm2 * fs_prime) / (k * fc * b_mm)
      const c_new = a_new / b1
      if (Math.abs(c_new - c_try) < 0.1) {
        c_try = c_new
        a_try = a_new
        break
      }
      c_try = c_new
      a_try = a_new
    }

    const Mn_Nmm =
      (As_mm2 - As_prime_mm2 * (fs_prime / fy)) * fy * (d_mm - a_try / 2) +
      As_prime_mm2 * fs_prime * (d_mm - dp)

    return {
      phi_Mn_kNm: (PHI_FLEXURE * Mn_Nmm) / 1e6,
      a_mm: a_try,
      c_mm: c_try,
      compression_steel_yielded: compression_yielded,
      fs_prime_mpa: fs_prime,
      is_doubly_reinforced: true,
    }
  },

  As_min: (fc_mpa, fy_mpa, b_mm, d_mm) => {
    // ACI 9.6.1.2 — greater of 0.25·√f'c·b·d/fy and 1.4·b·d/fy.
    const a = (0.25 * Math.sqrt(fc_mpa) * b_mm * d_mm) / fy_mpa
    const b = (1.4 * b_mm * d_mm) / fy_mpa
    return Math.max(a, b)
  },

  // ─── Shear ─────────────────────────────────────────────────────────────
  Vc_design: (fc_mpa, b_mm, d_mm, _As, Nu_kN) =>
    PHI_SHEAR * Vc_simple_kN(fc_mpa, b_mm, d_mm, Nu_kN),

  Vs_design: (Av_mm2, fys_mpa, d_mm, s_mm) => {
    if (s_mm <= 0) return 0
    const Vs_N = (Av_mm2 * fys_mpa * d_mm) / s_mm
    return (PHI_SHEAR * Vs_N) / 1000
  },

  stirrup_spacing_max(d_mm, Vs_kN, b_mm, fc_mpa) {
    // ACI 9.7.6.2.2 — s_max = min(d/2, 600 mm) when Vs ≤ 0.33·√f'c·b·d;
    // s_max = min(d/4, 300 mm) when Vs exceeds that.
    const Vs_threshold_kN = (0.33 * Math.sqrt(fc_mpa) * b_mm * d_mm) / 1000
    if (Vs_kN <= Vs_threshold_kN) return Math.min(d_mm / 2, 600)
    return Math.min(d_mm / 4, 300)
  },

  // ─── Development ───────────────────────────────────────────────────────
  Ld: (bar_dia_mm, fc_mpa, fy_mpa, is_top) =>
    Ld_simple_mm(bar_dia_mm, fc_mpa, fy_mpa, is_top),

  lap_splice: (Ld_mm, class_) => {
    // ACI 25.5.2.1 — Class A: 1.0·Ld, Class B: 1.3·Ld. Min 300 mm.
    const factor = class_ === 'A' ? 1.0 : 1.3
    return Math.max(300, factor * Ld_mm)
  },

  // ─── Column-specific ───────────────────────────────────────────────────
  phi_axial(eps_t: number, type: ColumnType): number {
    // ACI Table 21.2.2 — compression-controlled φ, transitional φ,
    // tension-controlled φ. Linear ramp between 0.002 (yield strain of
    // Gr60 steel) and the tension-controlled limit 0.005.
    const phi_min =
      type === 'spiral' ? PHI_COLUMN_SPIRAL_MIN : PHI_COLUMN_TIED_MIN
    const phi_max =
      type === 'spiral' ? PHI_COLUMN_SPIRAL_MAX : PHI_COLUMN_TIED_MAX
    if (eps_t <= 0.002) return phi_min
    if (eps_t >= EPS_T_TENSION_CONTROLLED) return phi_max
    const t = (eps_t - 0.002) / (EPS_T_TENSION_CONTROLLED - 0.002)
    return phi_min + t * (phi_max - phi_min)
  },

  Pn_max_factor: (type) => (type === 'spiral' ? 0.85 : 0.8),

  slenderness_limit(M1_kNm, M2_kNm, is_sway) {
    // ACI 6.2.5 — non-sway: klu/r ≤ 34 + 12·(M1/M2), capped at 40.
    // Sway: klu/r ≤ 22.
    if (is_sway) return 22
    const ratio = M2_kNm === 0 ? 0 : M1_kNm / M2_kNm
    return Math.min(40, 34 + 12 * ratio)
  },

  confinement_rho_min(fc_mpa, fyh_mpa, Ag_mm2, Ach_mm2) {
    // ACI 25.7.3.3 — spiral:
    //   ρs = max(0.45(Ag/Ach - 1)·(fc/fyh), 0.12·fc/fyh)
    const a = 0.45 * (Ag_mm2 / Ach_mm2 - 1) * (fc_mpa / fyh_mpa)
    const b = (0.12 * fc_mpa) / fyh_mpa
    return Math.max(a, b)
  },

  // ─── Slab + punching ───────────────────────────────────────────────────
  punching_d_factor: () => 0.5,
  min_slab_thickness(span_mm, support) {
    // ACI 7.3.1.1 Table — one-way, normal weight, Gr60.
    // Conservative: span / divisor, fy adjustment applied elsewhere.
    const divisor =
      support === 'simply_supported'
        ? 20
        : support === 'one_end_continuous'
          ? 24
          : support === 'both_ends_continuous'
            ? 28
            : /* cantilever */ 10
    return span_mm / divisor
  },

  // ─── Footing bearing ───────────────────────────────────────────────────
  bearing_capacity(fc_mpa, A1_mm2, A2_mm2) {
    // ACI 22.8.3 — φBn = 0.65 · 0.85 · f'c · A1 · √(A2/A1), ≤ 2·0.65·0.85·f'c·A1
    const base = PHI_BEARING * 0.85 * fc_mpa * A1_mm2
    const ratio = Math.min(2, Math.sqrt(A2_mm2 / A1_mm2))
    return (base * ratio) / 1000 // N → kN
  },

  // ─── Column ρ bounds + slab secondary steel ────────────────────────────
  rho_column_min: 0.01,
  rho_column_max: 0.08,
  rho_temp: () => 0.0018, // ACI 24.4.3.2 for Gr60.

  Vc_slab_oneway(fc_mpa, b_mm, d_mm) {
    return (PHI_SHEAR * 0.17 * Math.sqrt(fc_mpa) * b_mm * d_mm) / 1000
  },

  Vc_slab_twoway(fc_mpa, bo_mm, d_mm, beta_c) {
    // ACI 22.6.5.2 — least of three expressions.
    const a = (1 / 3) * Math.sqrt(fc_mpa)
    const b = (1 / 6) * (1 + 2 / Math.max(beta_c, 1)) * Math.sqrt(fc_mpa)
    const c =
      (1 / 12) * (2 + (40 * d_mm) / Math.max(bo_mm, 1)) * Math.sqrt(fc_mpa)
    const vc_mpa = Math.min(a, b, c)
    return (PHI_SHEAR * vc_mpa * bo_mm * d_mm) / 1000
  },

  // ─── Seismic (Philippine seismic additions live in NSCP provider) ──────
  seismic: {
    stirrup_spacing_max(d_mm, zone) {
      // ACI 318-19 18.6.4.4 — SMF end zone max s = min(d/4, 8·db, 150).
      // Here we return a conservative d/4 or 150; caller can choose
      // tighter bar-diameter multiples. Midspan defers to non-seismic.
      return zone === 'end' ? Math.min(d_mm / 4, 150) : Math.min(d_mm / 2, 600)
    },
    column_tie_spacing_max(b_mm, bar_dia_mm, tie_dia_mm) {
      // ACI 18.7.5.3 — s = min(b/4, 6·db, 150), with tie_dia >= #3.
      const caps = [b_mm / 4, 6 * bar_dia_mm, 150]
      void tie_dia_mm
      return Math.min(...caps)
    },
  },
}

registerCode(ACI_318_19)
