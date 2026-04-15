/**
 * NSCP 2015 provider.
 *
 * NSCP 2015 is substantially ACI 318-11 with Philippine seismic
 * additions. Per docs/04-engineering-lib.md:102-105 the implementation
 * strategy is: spread ACI, then override only `Vc_design`, `Ld`,
 * `rho_temp`, and `seismic`.
 *
 * The ρₗ dependence in ACI 318-19 Vc was added in the 2019 revision;
 * NSCP 2015 sticks with the older 0.17·√f'c·b·d form (which is also the
 * simplified form our ACI provider happens to use, so the override here
 * mostly exists for clarity and so Philippine projects can diverge when
 * NSCP publishes its own updates without touching ACI).
 */
import {
  registerCode,
  type CodeProvider,
} from '@/lib/engineering/codes'
import { ACI_318_19 } from '@/lib/engineering/codes/aci318-19'

const PHI_SHEAR = 0.75
const PHI_FLEXURE_NSCP = 0.9
void PHI_FLEXURE_NSCP

export const NSCP_2015: CodeProvider = {
  ...ACI_318_19,
  code: 'NSCP_2015',

  // NSCP 2015 §422.5.5.1 — Vc = 0.17 · λ · √f'c · b · d.
  Vc_design(fc_mpa, b_mm, d_mm, _As_mm2, Nu_kN) {
    const lam = 1.0
    const base_N = 0.17 * lam * Math.sqrt(fc_mpa) * b_mm * d_mm
    const axial_N =
      Nu_kN > 0
        ? (Nu_kN * 1000) / (14 * b_mm * d_mm) *
          0.17 * lam * Math.sqrt(fc_mpa) * b_mm * d_mm
        : 0
    return (PHI_SHEAR * (base_N + axial_N)) / 1000
  },

  // NSCP 2015 §425.4 — basic Ld slightly diverges from ACI 318-19 only
  // in the ψ_g factor for higher-strength bars, which we don't yet
  // surface. For Gr275/Gr415 the numbers match ACI's simplified form.
  Ld(bar_dia_mm, fc_mpa, fy_mpa, is_top) {
    const psi_t = is_top ? 1.3 : 1.0
    const psi_e = 1.0
    const lam = 1.0
    const denom = 1.1 * lam * Math.sqrt(fc_mpa) * 2.5
    const Ld_raw = (fy_mpa * psi_t * psi_e * bar_dia_mm) / denom
    return Math.max(300, Ld_raw)
  },

  // NSCP §424.4.3.2 — rho_temp = 0.0020 for Gr275, 0.0018 for Gr415.
  rho_temp(fy_mpa) {
    return fy_mpa <= 300 ? 0.0020 : 0.0018
  },

  // NSCP Philippine seismic additions.
  seismic: {
    stirrup_spacing_max(d_mm, zone) {
      // NSCP 2015 §418.6.4 — SMF end zone: s ≤ min(d/4, 8·db_long,
      // 24·db_stirrup, 300 mm). Bar diameters aren't plumbed here;
      // we return a conservative d/4 or 150 mm.
      return zone === 'end' ? Math.min(d_mm / 4, 150) : Math.min(d_mm / 2, 600)
    },
    column_tie_spacing_max(b_mm, bar_dia_mm, tie_dia_mm) {
      // NSCP §418.7.5 — lo end-zone tie spacing:
      // s ≤ min(b/4, 6·db_long, 100 + (350 - hx)/3, 150).
      // hx is the largest horizontal bar spacing; we cap at 150 mm.
      void tie_dia_mm
      return Math.min(b_mm / 4, 6 * bar_dia_mm, 150)
    },
  },
}

registerCode(NSCP_2015)
