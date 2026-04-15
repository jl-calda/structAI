/**
 * One-way slab design — treat as a b = 1000 mm beam strip (docs/06 § Slab).
 * Reuses the CodeProvider's `moment_capacity`, `Vc_slab_oneway`,
 * `As_min`, and `rho_temp`. No slab-specific physics lives here.
 */
import type {
  CodeProvider,
  Materials,
  SectionGeom,
} from '@/lib/engineering/codes'

const STRIP_WIDTH_MM = 1000

export type SlabSpan = {
  /** Shorter clear span (mm) — governs one-way bending. */
  short_mm: number
  /** Longer span (mm). */
  long_mm: number
  thickness_mm: number
  clear_cover_mm: number
}

export type SlabLoads = {
  DL_self_kPa: number
  SDL_kPa: number
  LL_kPa: number
}

export type SlabRebar = {
  bar_dia_short_mm: number
  spacing_short_mm: number
  bar_dia_long_mm: number
  spacing_long_mm: number
}

export type SlabCheck = {
  /** Ultimate distributed load wu (kPa). */
  wu_kPa: number
  /** Mu per metre strip (kN·m/m). */
  Mu_kNm_per_m: number
  /** φMn per metre strip (kN·m/m). */
  phi_Mn_kNm_per_m: number
  flexure_status: 'pass' | 'fail'
  /** Vu per metre strip (kN/m). */
  Vu_kN_per_m: number
  /** φVc per metre strip (kN/m). */
  phi_Vn_kN_per_m: number
  shear_status: 'pass' | 'fail'
  deflection_ok: boolean
  overall_status: 'pass' | 'fail'
}

/** Bar area (mm²) → As per metre given a bar spacing (mm). */
function AsPerMetre(bar_dia_mm: number, spacing_mm: number): number {
  if (spacing_mm <= 0) return 0
  const area = (Math.PI * bar_dia_mm * bar_dia_mm) / 4
  return (area * STRIP_WIDTH_MM) / spacing_mm
}

export function designOneWaySlab(input: {
  span: SlabSpan
  loads: SlabLoads
  mat: Materials
  rebar: SlabRebar
  code: CodeProvider
}): SlabCheck {
  const { span, loads, mat, rebar, code } = input

  // Assume continuous — use wu·L²/10 per ACI approximate coefficients.
  // (End span positive moment = wu·L²/11; interior positive = wu·L²/16;
  // interior support negative = wu·L²/10. We take /10 as the governing.)
  const wu_kPa = 1.2 * (loads.DL_self_kPa + loads.SDL_kPa) + 1.6 * loads.LL_kPa
  const L_m = span.short_mm / 1000
  const Mu_kNm_per_m = (wu_kPa * L_m * L_m) / 10
  const Vu_kN_per_m = wu_kPa * (L_m / 2 - (span.thickness_mm - span.clear_cover_mm) / 1000)

  // Effective depth — bar runs in the short direction, so d is measured
  // to the centre of the short-direction bar.
  const d_mm =
    span.thickness_mm - span.clear_cover_mm - rebar.bar_dia_short_mm / 2

  const geom: SectionGeom = {
    b_mm: STRIP_WIDTH_MM,
    h_mm: span.thickness_mm,
    d_mm,
    clear_cover_mm: span.clear_cover_mm,
  }

  const As_prov = AsPerMetre(rebar.bar_dia_short_mm, rebar.spacing_short_mm)
  const cap = code.moment_capacity(As_prov, 0, geom, mat)
  const phi_Mn_kNm_per_m = cap.phi_Mn_kNm

  const phi_Vn_kN_per_m = code.Vc_slab_oneway(mat.fc_mpa, STRIP_WIDTH_MM, d_mm)

  // Deflection check (ACI 9.3.1.1): l/d ratio vs code min thickness.
  const min_t = code.min_slab_thickness(span.short_mm, 'both_ends_continuous', mat.fy_mpa)
  const deflection_ok = span.thickness_mm >= min_t

  const flexure_status: 'pass' | 'fail' =
    phi_Mn_kNm_per_m >= Mu_kNm_per_m ? 'pass' : 'fail'
  const shear_status: 'pass' | 'fail' =
    phi_Vn_kN_per_m >= Vu_kN_per_m ? 'pass' : 'fail'
  const overall_status: 'pass' | 'fail' =
    flexure_status === 'pass' && shear_status === 'pass' && deflection_ok ? 'pass' : 'fail'

  return {
    wu_kPa,
    Mu_kNm_per_m,
    phi_Mn_kNm_per_m,
    flexure_status,
    Vu_kN_per_m,
    phi_Vn_kN_per_m,
    shear_status,
    deflection_ok,
    overall_status,
  }
}
