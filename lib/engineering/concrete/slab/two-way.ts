/**
 * Two-way slab design — coefficient method.
 *
 * Load distribution between short (x) and long (y) directions uses
 * Rankine-Grashof:
 *   wx = w · Ly^4 / (Lx^4 + Ly^4)
 *   wy = w · Lx^4 / (Lx^4 + Ly^4)
 * Then each direction is designed as a 1-m beam strip via the same
 * CodeProvider flow as one-way.
 *
 * Phase 4b MVP: supports panels on beams (no punching check — that's
 * only needed for flat plates / flat slabs). A full ACI direct-design
 * or equivalent-frame treatment is a later refinement.
 *
 * Deflection check uses code.min_slab_thickness with short span.
 */
import type {
  CodeProvider,
  Materials,
  SectionGeom,
} from '@/lib/engineering/codes'

import type { SlabLoads, SlabRebar, SlabSpan } from './one-way'

const STRIP_WIDTH_MM = 1000

export type TwoWaySlabCheck = {
  wu_kPa: number
  Mu_x_kNm_per_m: number
  phi_Mn_x_kNm_per_m: number
  flexure_x_status: 'pass' | 'fail'
  Mu_y_kNm_per_m: number
  phi_Mn_y_kNm_per_m: number
  flexure_y_status: 'pass' | 'fail'
  Vu_kN_per_m: number
  phi_Vn_kN_per_m: number
  shear_status: 'pass' | 'fail'
  deflection_ok: boolean
  overall_status: 'pass' | 'fail'
}

function AsPerMetre(bar_dia_mm: number, spacing_mm: number): number {
  if (spacing_mm <= 0) return 0
  const area = (Math.PI * bar_dia_mm * bar_dia_mm) / 4
  return (area * STRIP_WIDTH_MM) / spacing_mm
}

export function designTwoWaySlab(input: {
  span: SlabSpan
  loads: SlabLoads
  mat: Materials
  rebar: SlabRebar
  code: CodeProvider
}): TwoWaySlabCheck {
  const { span, loads, mat, rebar, code } = input

  const wu_kPa = 1.2 * (loads.DL_self_kPa + loads.SDL_kPa) + 1.6 * loads.LL_kPa
  const Lx_m = span.short_mm / 1000
  const Ly_m = span.long_mm / 1000

  // Rankine-Grashof distribution.
  const Lx4 = Math.pow(Lx_m, 4)
  const Ly4 = Math.pow(Ly_m, 4)
  const totalDen = Lx4 + Ly4 || 1
  const wx_kPa = (wu_kPa * Ly4) / totalDen
  const wy_kPa = (wu_kPa * Lx4) / totalDen

  // Per ACI simplified coefficients for interior continuous panels,
  // we take wL²/10 in each direction (same approximation as one-way).
  const Mu_x_kNm_per_m = (wx_kPa * Lx_m * Lx_m) / 10
  const Mu_y_kNm_per_m = (wy_kPa * Ly_m * Ly_m) / 10

  // Effective depth — short bars are below long bars so d_short > d_long.
  const d_short =
    span.thickness_mm - span.clear_cover_mm - rebar.bar_dia_short_mm / 2
  const d_long =
    span.thickness_mm -
    span.clear_cover_mm -
    rebar.bar_dia_short_mm -
    rebar.bar_dia_long_mm / 2

  const geomShort: SectionGeom = {
    b_mm: STRIP_WIDTH_MM,
    h_mm: span.thickness_mm,
    d_mm: d_short,
    clear_cover_mm: span.clear_cover_mm,
  }
  const geomLong: SectionGeom = {
    b_mm: STRIP_WIDTH_MM,
    h_mm: span.thickness_mm,
    d_mm: d_long,
    clear_cover_mm: span.clear_cover_mm,
  }

  const As_x = AsPerMetre(rebar.bar_dia_short_mm, rebar.spacing_short_mm)
  const As_y = AsPerMetre(rebar.bar_dia_long_mm, rebar.spacing_long_mm)
  const cap_x = code.moment_capacity(As_x, 0, geomShort, mat)
  const cap_y = code.moment_capacity(As_y, 0, geomLong, mat)

  const Vu_kN_per_m = wx_kPa * (Lx_m / 2 - d_short / 1000)
  const phi_Vn_kN_per_m = code.Vc_slab_oneway(mat.fc_mpa, STRIP_WIDTH_MM, d_short)

  const min_t = code.min_slab_thickness(span.short_mm, 'both_ends_continuous', mat.fy_mpa)
  const deflection_ok = span.thickness_mm >= min_t

  const flexure_x_status: 'pass' | 'fail' =
    cap_x.phi_Mn_kNm >= Mu_x_kNm_per_m ? 'pass' : 'fail'
  const flexure_y_status: 'pass' | 'fail' =
    cap_y.phi_Mn_kNm >= Mu_y_kNm_per_m ? 'pass' : 'fail'
  const shear_status: 'pass' | 'fail' =
    phi_Vn_kN_per_m >= Vu_kN_per_m ? 'pass' : 'fail'
  const overall_status: 'pass' | 'fail' =
    flexure_x_status === 'pass' &&
    flexure_y_status === 'pass' &&
    shear_status === 'pass' &&
    deflection_ok
      ? 'pass'
      : 'fail'

  return {
    wu_kPa,
    Mu_x_kNm_per_m,
    phi_Mn_x_kNm_per_m: cap_x.phi_Mn_kNm,
    flexure_x_status,
    Mu_y_kNm_per_m,
    phi_Mn_y_kNm_per_m: cap_y.phi_Mn_kNm,
    flexure_y_status,
    Vu_kN_per_m,
    phi_Vn_kN_per_m,
    shear_status,
    deflection_ok,
    overall_status,
  }
}
